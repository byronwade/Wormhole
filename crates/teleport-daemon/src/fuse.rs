//! FUSE filesystem implementation
//!
//! This module implements the fuser::Filesystem trait, bridging
//! to the async networking layer via FuseAsyncBridge.
//!
//! Phase 3 additions:
//! - Governor for sequential access detection
//! - Background prefetching for streaming workloads
//! - LRU chunk cache integration
//!
//! Phase 4 additions:
//! - HybridCacheManager (RAM + Disk caching)
//! - Persistent cache survives restarts
//! - Disk hits promote to RAM

use std::ffi::OsStr;
use std::sync::Arc;
use std::time::{Duration, UNIX_EPOCH};

use fuser::{
    FileAttr as FuserAttr, FileType as FuserFileType, Filesystem, ReplyAttr, ReplyData,
    ReplyDirectory, ReplyEntry, Request,
};
use parking_lot::Mutex;
use tracing::{debug, error, info, trace};

use teleport_core::{ChunkId, FileAttr, FileType, Inode};

use crate::bridge::{FuseAsyncBridge, FuseError};
use crate::cache::HybridCacheManager;
use crate::governor::Governor;

/// TTL for FUSE kernel cache
const TTL: Duration = Duration::from_secs(1);

/// Wormhole FUSE filesystem with prefetch support and hybrid caching
pub struct WormholeFS {
    bridge: FuseAsyncBridge,
    cache: Arc<HybridCacheManager>,
    governor: Mutex<Governor>,
}

impl WormholeFS {
    pub fn new(bridge: FuseAsyncBridge) -> Self {
        info!("Initializing WormholeFS with HybridCacheManager (RAM + Disk)");
        Self {
            bridge,
            cache: Arc::new(HybridCacheManager::new(
                Duration::from_secs(5),
                Duration::from_secs(5),
            )),
            governor: Mutex::new(Governor::new()),
        }
    }

    /// Create with a shared cache (for testing or custom configuration)
    pub fn with_cache(bridge: FuseAsyncBridge, cache: Arc<HybridCacheManager>) -> Self {
        Self {
            bridge,
            cache,
            governor: Mutex::new(Governor::new()),
        }
    }

    /// Get disk cache for GC
    pub fn disk_cache(&self) -> Option<Arc<crate::disk_cache::DiskCache>> {
        self.cache.disk_cache()
    }

    /// Get cache statistics
    pub fn cache_stats(&self) -> crate::cache::HybridCacheManagerStats {
        self.cache.stats()
    }

    /// Convert our FileAttr to fuser's FileAttr
    fn to_fuser_attr(attr: &FileAttr) -> FuserAttr {
        let kind = match attr.file_type {
            FileType::File => FuserFileType::RegularFile,
            FileType::Directory => FuserFileType::Directory,
            FileType::Symlink => FuserFileType::Symlink,
        };

        FuserAttr {
            ino: attr.inode,
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

    /// Trigger background prefetch for sequential access patterns
    fn prefetch_chunks(&self, targets: Vec<ChunkId>) {
        for chunk_id in targets {
            // Skip if already cached
            if self.cache.chunks.contains(&chunk_id) {
                continue;
            }

            // Fire off background fetch
            // The bridge.read() will cache the result automatically
            trace!("prefetch: scheduling chunk {:?}", chunk_id);

            // Clone what we need for the background fetch
            let bridge = self.bridge.clone();
            let cache = self.cache.clone();

            // Spawn background prefetch (fire-and-forget)
            std::thread::spawn(move || {
                let offset = chunk_id.byte_offset();
                if let Ok(data) = bridge.read(chunk_id.inode, offset, teleport_core::CHUNK_SIZE as u32)
                {
                    cache.chunks.insert(chunk_id, data);
                    trace!("prefetch: completed chunk {:?}", chunk_id);
                }
            });
        }
    }

    /// Fetch a single chunk, using cache if available
    fn fetch_chunk(&self, chunk_id: ChunkId) -> Result<Vec<u8>, FuseError> {
        // Check cache first
        if let Some(data) = self.cache.chunks.get(&chunk_id) {
            trace!("fetch_chunk: cache hit for {:?}", chunk_id);
            return Ok((*data).clone());
        }

        // Cache miss - fetch from network
        let offset = chunk_id.byte_offset();
        trace!("fetch_chunk: cache miss for {:?}, fetching", chunk_id);

        let data = self.bridge.read(chunk_id.inode, offset, teleport_core::CHUNK_SIZE as u32)?;
        self.cache.chunks.insert(chunk_id, data.clone());
        Ok(data)
    }

    /// Read data spanning potentially multiple chunks and stitch together
    fn read_stitched(&self, ino: Inode, offset: u64, size: u32) -> Result<Vec<u8>, FuseError> {
        let chunk_size = teleport_core::CHUNK_SIZE as u64;
        let start_chunk = offset / chunk_size;
        let end_offset = offset + size as u64;
        let end_chunk = (end_offset.saturating_sub(1)) / chunk_size;

        // Single chunk case - most common
        if start_chunk == end_chunk {
            let chunk_id = ChunkId::new(ino, start_chunk);
            let chunk_data = self.fetch_chunk(chunk_id)?;

            let start_in_chunk = (offset % chunk_size) as usize;
            let available = chunk_data.len().saturating_sub(start_in_chunk);
            let to_read = std::cmp::min(size as usize, available);

            return Ok(chunk_data[start_in_chunk..start_in_chunk + to_read].to_vec());
        }

        // Multi-chunk case - stitch data from multiple chunks
        trace!(
            "read_stitched: spanning chunks {} to {} for offset={} size={}",
            start_chunk,
            end_chunk,
            offset,
            size
        );

        let mut result = Vec::with_capacity(size as usize);
        let mut remaining = size as usize;
        let mut current_offset = offset;

        for chunk_idx in start_chunk..=end_chunk {
            if remaining == 0 {
                break;
            }

            let chunk_id = ChunkId::new(ino, chunk_idx);
            let chunk_data = self.fetch_chunk(chunk_id)?;

            let start_in_chunk = (current_offset % chunk_size) as usize;
            let available = chunk_data.len().saturating_sub(start_in_chunk);
            let to_read = std::cmp::min(remaining, available);

            if to_read == 0 {
                // Hit EOF
                break;
            }

            result.extend_from_slice(&chunk_data[start_in_chunk..start_in_chunk + to_read]);
            remaining -= to_read;
            current_offset += to_read as u64;
        }

        Ok(result)
    }
}

impl Filesystem for WormholeFS {
    fn lookup(&mut self, _req: &Request<'_>, parent: Inode, name: &OsStr, reply: ReplyEntry) {
        let name = match name.to_str() {
            Some(n) => n.to_string(),
            None => {
                reply.error(libc::EINVAL);
                return;
            }
        };

        debug!("lookup: parent={}, name={}", parent, name);

        // Check cache first
        // (In a full implementation, we'd cache name→inode mappings)

        match self.bridge.lookup(parent, name.clone()) {
            Ok(attr) => {
                self.cache.attrs.insert(attr.inode, attr.clone());
                reply.entry(&TTL, &Self::to_fuser_attr(&attr), 0);
            }
            Err(FuseError::NotFound) => {
                trace!("lookup not found: {}", name);
                reply.error(libc::ENOENT);
            }
            Err(e) => {
                error!("lookup error: {:?}", e);
                reply.error(e.to_errno());
            }
        }
    }

    fn getattr(&mut self, _req: &Request<'_>, ino: Inode, reply: ReplyAttr) {
        trace!("getattr: ino={}", ino);

        // Check cache first
        if let Some(attr) = self.cache.attrs.get(ino) {
            reply.attr(&TTL, &Self::to_fuser_attr(&attr));
            return;
        }

        match self.bridge.getattr(ino) {
            Ok(attr) => {
                self.cache.attrs.insert(ino, attr.clone());
                reply.attr(&TTL, &Self::to_fuser_attr(&attr));
            }
            Err(FuseError::NotFound) => {
                reply.error(libc::ENOENT);
            }
            Err(e) => {
                error!("getattr error: {:?}", e);
                reply.error(e.to_errno());
            }
        }
    }

    fn read(
        &mut self,
        _req: &Request<'_>,
        ino: Inode,
        _fh: u64,
        offset: i64,
        size: u32,
        _flags: i32,
        _lock_owner: Option<u64>,
        reply: ReplyData,
    ) {
        let offset = offset as u64;
        trace!("read: ino={}, offset={}, size={}", ino, offset, size);

        // Record access for governor and get prefetch targets
        let chunk_id = ChunkId::from_offset(ino, offset);
        let prefetch_targets = {
            let mut gov = self.governor.lock();
            gov.record_access(&chunk_id)
        };

        // Trigger background prefetch if sequential pattern detected
        if !prefetch_targets.is_empty() {
            trace!(
                "read: sequential pattern detected, prefetching {} chunks",
                prefetch_targets.len()
            );
            self.prefetch_chunks(prefetch_targets);
        }

        // Use read_stitched to handle both single and multi-chunk reads
        match self.read_stitched(ino, offset, size) {
            Ok(data) => {
                reply.data(&data);
            }
            Err(FuseError::NotFound) => {
                reply.error(libc::ENOENT);
            }
            Err(e) => {
                error!("read error: {:?}", e);
                reply.error(e.to_errno());
            }
        }
    }

    fn readdir(
        &mut self,
        _req: &Request<'_>,
        ino: Inode,
        _fh: u64,
        offset: i64,
        mut reply: ReplyDirectory,
    ) {
        debug!("readdir: ino={}, offset={}", ino, offset);

        // Check cache
        if let Some(entries) = self.cache.dirs.get(ino) {
            let mut current_offset = offset as usize;

            // Add . and .. first
            if current_offset == 0 {
                if reply.add(ino, 1, FuserFileType::Directory, ".") {
                    reply.ok();
                    return;
                }
                current_offset = 1;
            }
            if current_offset == 1 {
                // Parent inode - simplified, use same inode
                if reply.add(ino, 2, FuserFileType::Directory, "..") {
                    reply.ok();
                    return;
                }
                current_offset = 2;
            }

            // Add directory entries
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

                if reply.add(entry.inode, (entry_offset + 1) as i64, kind, &entry.name) {
                    break;
                }
            }

            reply.ok();
            return;
        }

        // Fetch from network
        match self.bridge.readdir(ino, offset as u64) {
            Ok(entries) => {
                // Cache entries
                self.cache.dirs.insert(ino, entries.clone());

                let mut current_offset = offset as usize;

                // Add . and ..
                if current_offset == 0 {
                    if reply.add(ino, 1, FuserFileType::Directory, ".") {
                        reply.ok();
                        return;
                    }
                    current_offset = 1;
                }
                if current_offset == 1 {
                    if reply.add(ino, 2, FuserFileType::Directory, "..") {
                        reply.ok();
                        return;
                    }
                    current_offset = 2;
                }

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

                    if reply.add(entry.inode, (entry_offset + 1) as i64, kind, &entry.name) {
                        break;
                    }
                }

                reply.ok();
            }
            Err(FuseError::NotFound) => {
                reply.error(libc::ENOENT);
            }
            Err(e) => {
                error!("readdir error: {:?}", e);
                reply.error(e.to_errno());
            }
        }
    }

    fn open(&mut self, _req: &Request<'_>, ino: Inode, _flags: i32, reply: fuser::ReplyOpen) {
        trace!("open: ino={}", ino);
        // We don't track file handles - stateless
        reply.opened(0, 0);
    }

    fn release(
        &mut self,
        _req: &Request<'_>,
        ino: Inode,
        _fh: u64,
        _flags: i32,
        _lock_owner: Option<u64>,
        _flush: bool,
        reply: fuser::ReplyEmpty,
    ) {
        trace!("release: ino={}", ino);
        // Clear governor state for this file
        self.governor.lock().clear_inode(ino);
        reply.ok();
    }

    fn opendir(&mut self, _req: &Request<'_>, ino: Inode, _flags: i32, reply: fuser::ReplyOpen) {
        trace!("opendir: ino={}", ino);
        reply.opened(0, 0);
    }

    fn releasedir(
        &mut self,
        _req: &Request<'_>,
        ino: Inode,
        _fh: u64,
        _flags: i32,
        reply: fuser::ReplyEmpty,
    ) {
        trace!("releasedir: ino={}", ino);
        reply.ok();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_attr_conversion() {
        let attr = FileAttr::file(42, 1024);
        let fuser_attr = WormholeFS::to_fuser_attr(&attr);

        assert_eq!(fuser_attr.ino, 42);
        assert_eq!(fuser_attr.size, 1024);
        assert!(matches!(fuser_attr.kind, FuserFileType::RegularFile));
    }

    #[test]
    fn test_dir_attr_conversion() {
        let attr = FileAttr::directory(1);
        let fuser_attr = WormholeFS::to_fuser_attr(&attr);

        assert_eq!(fuser_attr.ino, 1);
        assert!(matches!(fuser_attr.kind, FuserFileType::Directory));
    }
}
