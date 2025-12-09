//! Multi-Share FUSE filesystem implementation
//!
//! This module implements a FUSE filesystem that presents multiple shares
//! from multiple hosts as subdirectories under a virtual root.
//!
//! Structure:
//! ```text
//! /mount_point/
//!   ├── host1_share1/       (GlobalInode: share_index=0)
//!   │   ├── file1.txt
//!   │   └── subdir/
//!   ├── host1_share2/       (GlobalInode: share_index=1)
//!   │   └── ...
//!   └── host2_share1/       (GlobalInode: share_index=2)
//!       └── ...
//! ```
//!
//! The virtual root uses inode 1. Each share's root appears as a subdirectory
//! with inodes namespaced using GlobalInode (share_index << 48 | local_inode).

use std::ffi::OsStr;
use std::sync::Arc;
use std::time::{Duration, UNIX_EPOCH};

use dashmap::DashMap;
use fuser::{
    FileAttr as FuserAttr, FileType as FuserFileType, Filesystem, ReplyAttr, ReplyData,
    ReplyDirectory, ReplyEntry, ReplyWrite, Request,
};
use parking_lot::RwLock;
use tracing::{debug, error, info, trace, warn};

use teleport_core::{ChunkId, DirEntry, FileAttr, FileType, GlobalInode, Inode, ShareInfo};

use crate::cache::HybridCacheManager;
use crate::connection_manager::ConnectionManager;
use crate::governor::Governor;
use crate::sync_engine::SyncEngine;

/// TTL for FUSE kernel cache
const TTL: Duration = Duration::from_secs(1);

/// Virtual root inode (standard FUSE root)
const FUSE_ROOT_INODE: u64 = 1;

/// Information about a mounted share
#[derive(Clone, Debug)]
pub struct MountedShare {
    /// Share info from the host
    pub info: ShareInfo,
    /// Index in our share list (used for GlobalInode)
    pub index: u16,
    /// Display name in the filesystem (may differ from share.name)
    pub mount_name: String,
    /// Whether this share is currently connected
    pub connected: bool,
}

/// Multi-share FUSE filesystem
pub struct MultiShareFS {
    /// Connection manager for all hosts
    connection_manager: Arc<ConnectionManager>,
    /// Hybrid cache (RAM + Disk)
    cache: Arc<HybridCacheManager>,
    /// Governor for prefetch detection
    governor: parking_lot::Mutex<Governor>,
    /// Sync engine for dirty chunks
    sync_engine: Arc<SyncEngine>,
    /// Whether write operations are enabled
    writable: bool,
    /// Mounted shares (index -> share info)
    shares: RwLock<Vec<MountedShare>>,
    /// Share name to index mapping
    name_to_index: DashMap<String, u16>,
}

impl MultiShareFS {
    /// Create a new multi-share filesystem
    pub fn new(connection_manager: Arc<ConnectionManager>) -> Self {
        info!("Initializing MultiShareFS with virtual root");
        Self {
            connection_manager,
            cache: Arc::new(HybridCacheManager::new(
                Duration::from_secs(5),
                Duration::from_secs(5),
            )),
            governor: parking_lot::Mutex::new(Governor::new()),
            sync_engine: Arc::new(SyncEngine::default()),
            writable: false,
            shares: RwLock::new(Vec::new()),
            name_to_index: DashMap::new(),
        }
    }

    /// Create with write support enabled
    pub fn new_writable(connection_manager: Arc<ConnectionManager>) -> Self {
        info!("Initializing MultiShareFS with write support");
        Self {
            connection_manager,
            cache: Arc::new(HybridCacheManager::new(
                Duration::from_secs(5),
                Duration::from_secs(5),
            )),
            governor: parking_lot::Mutex::new(Governor::new()),
            sync_engine: Arc::new(SyncEngine::default()),
            writable: true,
            shares: RwLock::new(Vec::new()),
            name_to_index: DashMap::new(),
        }
    }

    /// Add a share to the mounted list with a specified index from ConnectionManager
    /// The index MUST match the index assigned by ConnectionManager to ensure consistency
    pub fn add_share_with_index(&self, info: ShareInfo, index: u16, mount_name: Option<String>) {
        let mut shares = self.shares.write();

        // Generate mount name if not provided
        let mount_name = mount_name.unwrap_or_else(|| {
            let base_name = if info.host_name.is_empty() {
                info.name.clone()
            } else {
                format!("{}_{}", info.host_name, info.name)
            };

            // Ensure unique name
            let mut name = base_name.clone();
            let mut counter = 1;
            while self.name_to_index.contains_key(&name) {
                name = format!("{}_{}", base_name, counter);
                counter += 1;
            }
            name
        });

        self.name_to_index.insert(mount_name.clone(), index);

        // Ensure shares vec can hold this index
        // We use a sparse representation - some indices may be None
        while shares.len() <= index as usize {
            // Add placeholder entries if needed
            let placeholder_index = shares.len() as u16;
            shares.push(MountedShare {
                info: ShareInfo::new("_placeholder_", ""),
                index: placeholder_index,
                mount_name: String::new(),
                connected: false,
            });
        }

        shares[index as usize] = MountedShare {
            info,
            index,
            mount_name: mount_name.clone(),
            connected: true,
        };

        info!("Added share at index {}: {}", index, mount_name);
    }

    /// Add a share to the mounted list (legacy API - generates sequential index)
    /// WARNING: This may cause index mismatches with ConnectionManager
    /// Prefer using add_share_with_index when working with ConnectionManager
    pub fn add_share(&self, info: ShareInfo, mount_name: Option<String>) {
        let index = {
            let shares = self.shares.read();
            shares.len() as u16
        };
        self.add_share_with_index(info, index, mount_name);
    }

    /// Remove a share by index
    pub fn remove_share(&self, index: u16) {
        let mut shares = self.shares.write();
        if (index as usize) < shares.len() {
            let share = &shares[index as usize];
            self.name_to_index.remove(&share.mount_name);
            shares[index as usize].connected = false;
            info!("Removed share at index {}", index);
        }
    }

    /// Get all mounted shares
    pub fn get_shares(&self) -> Vec<MountedShare> {
        self.shares.read().clone()
    }

    /// Check if an inode is the virtual root
    fn is_virtual_root(&self, ino: u64) -> bool {
        ino == FUSE_ROOT_INODE
    }

    /// Convert a packed GlobalInode back to components
    fn unpack_inode(&self, ino: u64) -> (u16, Inode) {
        let global = GlobalInode::from_packed(ino);
        (global.share_index, global.local_inode)
    }

    /// Pack share index and local inode into a GlobalInode
    fn pack_inode(&self, share_index: u16, local_inode: Inode) -> u64 {
        GlobalInode {
            share_index,
            local_inode,
        }
        .to_packed()
    }

    /// Create FileAttr for the virtual root directory
    fn virtual_root_attr(&self) -> FuserAttr {
        let now = std::time::SystemTime::now();
        FuserAttr {
            ino: FUSE_ROOT_INODE,
            size: 0,
            blocks: 0,
            atime: now,
            mtime: now,
            ctime: now,
            crtime: now,
            kind: FuserFileType::Directory,
            perm: 0o755,
            nlink: 2,
            // SAFETY: libc::getuid() and libc::getgid() are thread-safe syscall wrappers
            // that always succeed and return valid uid_t/gid_t values. They have no
            // preconditions and cannot cause undefined behavior.
            uid: unsafe { libc::getuid() },
            gid: unsafe { libc::getgid() },
            rdev: 0,
            blksize: 512,
            flags: 0,
        }
    }

    /// Convert our FileAttr to fuser's FileAttr with proper inode namespacing
    fn to_fuser_attr(&self, attr: &FileAttr, share_index: u16) -> FuserAttr {
        let kind = match attr.file_type {
            FileType::File => FuserFileType::RegularFile,
            FileType::Directory => FuserFileType::Directory,
            FileType::Symlink => FuserFileType::Symlink,
        };

        // Pack the inode with share index
        let global_ino = self.pack_inode(share_index, attr.inode);

        FuserAttr {
            ino: global_ino,
            size: attr.size,
            blocks: attr.size.div_ceil(512),
            atime: UNIX_EPOCH + Duration::new(attr.atime, attr.atime_nsec),
            mtime: UNIX_EPOCH + Duration::new(attr.mtime, attr.mtime_nsec),
            ctime: UNIX_EPOCH + Duration::new(attr.ctime, attr.ctime_nsec),
            crtime: UNIX_EPOCH,
            kind,
            perm: attr.mode as u16,
            nlink: attr.nlink,
            uid: attr.uid,
            gid: attr.gid,
            rdev: 0,
            blksize: 512,
            flags: 0,
        }
    }

    /// Get sync engine
    pub fn sync_engine(&self) -> Arc<SyncEngine> {
        self.sync_engine.clone()
    }

    /// Check if writes are enabled
    pub fn is_writable(&self) -> bool {
        self.writable
    }

    /// Fetch a chunk from cache or network
    fn fetch_chunk(&self, share_index: u16, chunk_id: ChunkId) -> Result<Vec<u8>, i32> {
        // Check cache first
        if let Some(data) = self.cache.chunks.get(&chunk_id) {
            trace!("fetch_chunk: cache hit for {:?}", chunk_id);
            return Ok((*data).clone());
        }

        // Cache miss - fetch from connection manager
        trace!("fetch_chunk: cache miss for {:?}, fetching", chunk_id);

        match self
            .connection_manager
            .read_chunk_blocking(share_index, chunk_id)
        {
            Ok(data) => {
                self.cache.chunks.insert(chunk_id, data.clone());
                Ok(data)
            }
            Err(e) => {
                error!("fetch_chunk error: {:?}", e);
                Err(libc::EIO)
            }
        }
    }

    /// Read data spanning potentially multiple chunks
    fn read_stitched(
        &self,
        share_index: u16,
        ino: Inode,
        offset: u64,
        size: u32,
    ) -> Result<Vec<u8>, i32> {
        let chunk_size = teleport_core::CHUNK_SIZE as u64;
        let start_chunk = offset / chunk_size;
        let end_offset = offset + size as u64;
        let end_chunk = (end_offset.saturating_sub(1)) / chunk_size;

        // Single chunk case
        if start_chunk == end_chunk {
            let chunk_id = ChunkId::new(ino, start_chunk);
            let chunk_data = self.fetch_chunk(share_index, chunk_id)?;

            let start_in_chunk = (offset % chunk_size) as usize;
            let available = chunk_data.len().saturating_sub(start_in_chunk);
            let to_read = std::cmp::min(size as usize, available);

            return Ok(chunk_data[start_in_chunk..start_in_chunk + to_read].to_vec());
        }

        // Multi-chunk case
        let mut result = Vec::with_capacity(size as usize);
        let mut remaining = size as usize;
        let mut current_offset = offset;

        for chunk_idx in start_chunk..=end_chunk {
            if remaining == 0 {
                break;
            }

            let chunk_id = ChunkId::new(ino, chunk_idx);
            let chunk_data = self.fetch_chunk(share_index, chunk_id)?;

            let start_in_chunk = (current_offset % chunk_size) as usize;
            let available = chunk_data.len().saturating_sub(start_in_chunk);
            let to_read = std::cmp::min(remaining, available);

            if to_read == 0 {
                break;
            }

            result.extend_from_slice(&chunk_data[start_in_chunk..start_in_chunk + to_read]);
            remaining -= to_read;
            current_offset += to_read as u64;
        }

        Ok(result)
    }
}

impl Filesystem for MultiShareFS {
    fn lookup(&mut self, _req: &Request<'_>, parent: u64, name: &OsStr, reply: ReplyEntry) {
        let name = match name.to_str() {
            Some(n) => n.to_string(),
            None => {
                reply.error(libc::EINVAL);
                return;
            }
        };

        debug!("lookup: parent={}, name={}", parent, name);

        // Handle lookup in virtual root
        if self.is_virtual_root(parent) {
            // Looking for a share name
            if let Some(index) = self.name_to_index.get(&name) {
                let shares = self.shares.read();
                if let Some(share) = shares.get(*index as usize) {
                    if share.connected {
                        // Return a directory entry for this share's root
                        let global_ino = self.pack_inode(share.index, teleport_core::ROOT_INODE);
                        let now = std::time::SystemTime::now();
                        let attr = FuserAttr {
                            ino: global_ino,
                            size: 0,
                            blocks: 0,
                            atime: now,
                            mtime: now,
                            ctime: now,
                            crtime: now,
                            kind: FuserFileType::Directory,
                            perm: 0o755,
                            nlink: 2,
                            // SAFETY: libc::getuid() and libc::getgid() are thread-safe syscall wrappers
                            // that always succeed and return valid uid_t/gid_t values. They have no
                            // preconditions and cannot cause undefined behavior.
                            uid: unsafe { libc::getuid() },
                            gid: unsafe { libc::getgid() },
                            rdev: 0,
                            blksize: 512,
                            flags: 0,
                        };
                        reply.entry(&TTL, &attr, 0);
                        return;
                    }
                }
            }
            reply.error(libc::ENOENT);
            return;
        }

        // Normal lookup within a share
        let (share_index, local_parent) = self.unpack_inode(parent);

        match self
            .connection_manager
            .lookup_blocking(share_index, local_parent, &name)
        {
            Ok(attr) => {
                let fuser_attr = self.to_fuser_attr(&attr, share_index);
                self.cache.attrs.insert(attr.inode, attr);
                reply.entry(&TTL, &fuser_attr, 0);
            }
            Err(crate::connection_manager::ConnectionError::NotFound) => {
                reply.error(libc::ENOENT);
            }
            Err(e) => {
                error!("lookup error: {:?}", e);
                reply.error(libc::EIO);
            }
        }
    }

    fn getattr(&mut self, _req: &Request<'_>, ino: u64, reply: ReplyAttr) {
        trace!("getattr: ino={}", ino);

        // Handle virtual root
        if self.is_virtual_root(ino) {
            reply.attr(&TTL, &self.virtual_root_attr());
            return;
        }

        let (share_index, local_ino) = self.unpack_inode(ino);

        // Check cache
        if let Some(attr) = self.cache.attrs.get(local_ino) {
            reply.attr(&TTL, &self.to_fuser_attr(&attr, share_index));
            return;
        }

        match self
            .connection_manager
            .getattr_blocking(share_index, local_ino)
        {
            Ok(attr) => {
                let fuser_attr = self.to_fuser_attr(&attr, share_index);
                self.cache.attrs.insert(local_ino, attr);
                reply.attr(&TTL, &fuser_attr);
            }
            Err(crate::connection_manager::ConnectionError::NotFound) => {
                reply.error(libc::ENOENT);
            }
            Err(e) => {
                error!("getattr error: {:?}", e);
                reply.error(libc::EIO);
            }
        }
    }

    fn read(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        _fh: u64,
        offset: i64,
        size: u32,
        _flags: i32,
        _lock_owner: Option<u64>,
        reply: ReplyData,
    ) {
        let offset = offset as u64;
        trace!("read: ino={}, offset={}, size={}", ino, offset, size);

        if self.is_virtual_root(ino) {
            reply.error(libc::EISDIR);
            return;
        }

        let (share_index, local_ino) = self.unpack_inode(ino);

        // Record access for governor
        let chunk_id = ChunkId::from_offset(local_ino, offset);
        let _prefetch_targets = {
            let mut gov = self.governor.lock();
            gov.record_access(&chunk_id)
        };

        match self.read_stitched(share_index, local_ino, offset, size) {
            Ok(data) => {
                reply.data(&data);
            }
            Err(errno) => {
                reply.error(errno);
            }
        }
    }

    fn readdir(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        _fh: u64,
        offset: i64,
        mut reply: ReplyDirectory,
    ) {
        debug!("readdir: ino={}, offset={}", ino, offset);

        // Handle virtual root - list all shares
        if self.is_virtual_root(ino) {
            let shares = self.shares.read();
            let mut current_offset = offset as usize;

            // Add . and ..
            if current_offset == 0 {
                if reply.add(FUSE_ROOT_INODE, 1, FuserFileType::Directory, ".") {
                    reply.ok();
                    return;
                }
                current_offset = 1;
            }
            if current_offset == 1 {
                if reply.add(FUSE_ROOT_INODE, 2, FuserFileType::Directory, "..") {
                    reply.ok();
                    return;
                }
                current_offset = 2;
            }

            // Add shares as directories
            for (i, share) in shares.iter().enumerate() {
                let entry_offset = i + 2;
                if entry_offset < current_offset {
                    continue;
                }
                if !share.connected {
                    continue;
                }

                let share_root_ino = self.pack_inode(share.index, teleport_core::ROOT_INODE);
                if reply.add(
                    share_root_ino,
                    (entry_offset + 1) as i64,
                    FuserFileType::Directory,
                    &share.mount_name,
                ) {
                    break;
                }
            }

            reply.ok();
            return;
        }

        // Normal readdir within a share
        let (share_index, local_ino) = self.unpack_inode(ino);

        // Check cache
        if let Some(entries) = self.cache.dirs.get(local_ino) {
            self.reply_dir_entries(share_index, ino, local_ino, &entries, offset, reply);
            return;
        }

        match self
            .connection_manager
            .readdir_blocking(share_index, local_ino, offset as u64)
        {
            Ok(entries) => {
                self.cache.dirs.insert(local_ino, entries.clone());
                self.reply_dir_entries(share_index, ino, local_ino, &entries, offset, reply);
            }
            Err(crate::connection_manager::ConnectionError::NotFound) => {
                reply.error(libc::ENOENT);
            }
            Err(e) => {
                error!("readdir error: {:?}", e);
                reply.error(libc::EIO);
            }
        }
    }

    fn open(&mut self, _req: &Request<'_>, ino: u64, _flags: i32, reply: fuser::ReplyOpen) {
        trace!("open: ino={}", ino);
        if self.is_virtual_root(ino) {
            reply.error(libc::EISDIR);
            return;
        }
        reply.opened(0, 0);
    }

    fn release(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        _fh: u64,
        _flags: i32,
        _lock_owner: Option<u64>,
        _flush: bool,
        reply: fuser::ReplyEmpty,
    ) {
        trace!("release: ino={}", ino);
        if !self.is_virtual_root(ino) {
            let (_, local_ino) = self.unpack_inode(ino);
            self.governor.lock().clear_inode(local_ino);
        }
        reply.ok();
    }

    fn opendir(&mut self, _req: &Request<'_>, ino: u64, _flags: i32, reply: fuser::ReplyOpen) {
        trace!("opendir: ino={}", ino);
        reply.opened(0, 0);
    }

    fn releasedir(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        _fh: u64,
        _flags: i32,
        reply: fuser::ReplyEmpty,
    ) {
        trace!("releasedir: ino={}", ino);
        reply.ok();
    }

    fn write(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        _fh: u64,
        offset: i64,
        data: &[u8],
        _write_flags: u32,
        _flags: i32,
        _lock_owner: Option<u64>,
        reply: ReplyWrite,
    ) {
        let offset = offset as u64;
        debug!("write: ino={}, offset={}, size={}", ino, offset, data.len());

        if self.is_virtual_root(ino) {
            reply.error(libc::EISDIR);
            return;
        }

        if !self.writable {
            warn!("write rejected: filesystem is read-only");
            reply.error(libc::EROFS);
            return;
        }

        let (share_index, local_ino) = self.unpack_inode(ino);

        // Check if share is writable
        {
            let shares = self.shares.read();
            if let Some(share) = shares.get(share_index as usize) {
                if !share.info.writable {
                    reply.error(libc::EROFS);
                    return;
                }
            }
        }

        // Handle write similar to single-share implementation
        let chunk_size = teleport_core::CHUNK_SIZE as u64;
        let start_chunk = offset / chunk_size;
        let end_offset = offset + data.len() as u64;
        let end_chunk = if end_offset == 0 {
            0
        } else {
            (end_offset - 1) / chunk_size
        };

        let mut written = 0usize;
        let mut current_offset = offset;

        for chunk_idx in start_chunk..=end_chunk {
            let chunk_id = ChunkId::new(local_ino, chunk_idx);
            let chunk_start = chunk_idx * chunk_size;

            let offset_in_chunk = (current_offset - chunk_start) as usize;
            let space_in_chunk = chunk_size as usize - offset_in_chunk;
            let remaining_data = data.len() - written;
            let to_write = std::cmp::min(space_in_chunk, remaining_data);

            // Get existing chunk data
            let mut chunk_data = if let Some(cached) = self.cache.chunks.get(&chunk_id) {
                (*cached).clone()
            } else if let Some(dirty) = self.sync_engine.get_dirty_chunk(&chunk_id) {
                dirty
            } else {
                match self.fetch_chunk(share_index, chunk_id) {
                    Ok(d) => d,
                    Err(libc::ENOENT) => Vec::new(),
                    Err(e) => {
                        reply.error(e);
                        return;
                    }
                }
            };

            // Extend if needed
            let required_len = offset_in_chunk.saturating_add(to_write);
            if chunk_data.len() < required_len {
                chunk_data.resize(required_len, 0);
            }

            // Bounds check before slice operations to prevent panics
            let data_end = written.saturating_add(to_write);
            if data_end > data.len() || offset_in_chunk.saturating_add(to_write) > chunk_data.len()
            {
                error!("write: bounds check failed - data_end={}, data.len()={}, chunk end={}, chunk.len()={}",
                       data_end, data.len(), offset_in_chunk + to_write, chunk_data.len());
                reply.error(libc::EIO);
                return;
            }

            // Write data - now safe due to bounds check above
            chunk_data[offset_in_chunk..offset_in_chunk + to_write]
                .copy_from_slice(&data[written..data_end]);

            // Mark dirty
            self.sync_engine.mark_dirty(chunk_id, chunk_data.clone());
            self.cache.chunks.insert(chunk_id, chunk_data);

            written += to_write;
            current_offset += to_write as u64;
        }

        self.cache.attrs.invalidate(local_ino);
        debug!("write: wrote {} bytes", written);
        reply.written(written as u32);
    }

    fn flush(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        _fh: u64,
        _lock_owner: u64,
        reply: fuser::ReplyEmpty,
    ) {
        debug!("flush: ino={}", ino);
        if !self.is_virtual_root(ino) {
            let (_, local_ino) = self.unpack_inode(ino);
            if self.sync_engine.has_dirty_chunks(local_ino) {
                debug!("flush: {} has dirty chunks", ino);
            }
        }
        reply.ok();
    }

    fn fsync(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        _fh: u64,
        _datasync: bool,
        reply: fuser::ReplyEmpty,
    ) {
        debug!("fsync: ino={}", ino);
        reply.ok();
    }
}

impl MultiShareFS {
    /// Helper to reply with directory entries
    fn reply_dir_entries(
        &self,
        share_index: u16,
        parent_ino: u64,
        local_parent: Inode,
        entries: &[DirEntry],
        offset: i64,
        mut reply: ReplyDirectory,
    ) {
        let mut current_offset = offset as usize;

        // Add . and ..
        if current_offset == 0 {
            if reply.add(parent_ino, 1, FuserFileType::Directory, ".") {
                reply.ok();
                return;
            }
            current_offset = 1;
        }
        if current_offset == 1 {
            // Parent - for share root, parent is virtual root
            let parent_parent = if local_parent == teleport_core::ROOT_INODE {
                FUSE_ROOT_INODE
            } else {
                parent_ino // Simplified - would need to track parent mapping
            };
            if reply.add(parent_parent, 2, FuserFileType::Directory, "..") {
                reply.ok();
                return;
            }
            current_offset = 2;
        }

        // Add entries
        for (i, entry) in entries.iter().enumerate() {
            let entry_offset = i + 2;
            if entry_offset < current_offset {
                continue;
            }

            let kind = match entry.file_type {
                FileType::File => FuserFileType::RegularFile,
                FileType::Directory => FuserFileType::Directory,
                FileType::Symlink => FuserFileType::Symlink,
            };

            let global_ino = self.pack_inode(share_index, entry.inode);
            if reply.add(global_ino, (entry_offset + 1) as i64, kind, &entry.name) {
                break;
            }
        }

        reply.ok();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_inode_packing() {
        let fs = MultiShareFS::new(Arc::new(ConnectionManager::new()));

        // Test packing and unpacking
        let share_index: u16 = 5;
        let local_inode: Inode = 12345;

        let packed = fs.pack_inode(share_index, local_inode);
        let (unpacked_share, unpacked_inode) = fs.unpack_inode(packed);

        assert_eq!(unpacked_share, share_index);
        assert_eq!(unpacked_inode, local_inode);
    }

    #[test]
    fn test_virtual_root_detection() {
        let fs = MultiShareFS::new(Arc::new(ConnectionManager::new()));

        assert!(fs.is_virtual_root(FUSE_ROOT_INODE));
        assert!(!fs.is_virtual_root(2));
        // share_index=1 with local_inode=1 produces a different packed value
        assert!(!fs.is_virtual_root(fs.pack_inode(1, 1)));
        // share_index=0 with local_inode=2 also produces a different value
        assert!(!fs.is_virtual_root(fs.pack_inode(0, 2)));
    }

    #[test]
    fn test_add_share() {
        let fs = MultiShareFS::new(Arc::new(ConnectionManager::new()));

        let info = ShareInfo::new("test-share", "test-host");
        fs.add_share_with_index(info.clone(), 1, None); // Start at index 1 (0 is virtual root)

        let shares = fs.get_shares();
        // Two entries: placeholder at 0, real share at 1
        assert_eq!(shares.len(), 2);
        assert_eq!(shares[1].info.name, "test-share");
        assert_eq!(shares[1].index, 1);
        assert!(shares[1].connected);
    }

    #[test]
    fn test_unique_mount_names() {
        let fs = MultiShareFS::new(Arc::new(ConnectionManager::new()));

        // Add two shares with the same name from different hosts
        let info1 = ShareInfo::new("share", "host1");
        let info2 = ShareInfo::new("share", "host1");

        fs.add_share_with_index(info1, 1, None);
        fs.add_share_with_index(info2, 2, None);

        let shares = fs.get_shares();
        assert_eq!(shares.len(), 3); // placeholder at 0, shares at 1 and 2
                                     // Second should have unique name
        assert_ne!(shares[1].mount_name, shares[2].mount_name);
    }
}
