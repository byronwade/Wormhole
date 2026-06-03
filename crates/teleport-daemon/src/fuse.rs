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
//!
//! Phase 7 additions:
//! - Write operations (write, setattr)
//! - SyncEngine for dirty chunk tracking
//! - Lock management for write coordination

use std::ffi::OsStr;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, UNIX_EPOCH};

use fuser::{
    FileAttr as FuserAttr, FileType as FuserFileType, Filesystem, ReplyAttr, ReplyData,
    ReplyDirectory, ReplyEntry, ReplyWrite, Request,
};
use parking_lot::Mutex;
use tracing::{debug, error, info, trace, warn};

use teleport_core::{ChunkId, FileAttr, FileType, Inode};

use crate::bridge::{FuseAsyncBridge, FuseError};
use crate::cache::HybridCacheManager;
use crate::governor::{Governor, MAX_PREFETCH_CONCURRENT};
use crate::sync_engine::SyncEngine;

/// TTL for FUSE kernel cache
const TTL: Duration = Duration::from_secs(1);

/// Wormhole FUSE filesystem with prefetch support and hybrid caching
pub struct WormholeFS {
    bridge: FuseAsyncBridge,
    cache: Arc<HybridCacheManager>,
    governor: Mutex<Governor>,
    /// Sync engine for tracking dirty chunks (Phase 7)
    sync_engine: Arc<SyncEngine>,
    /// Whether write operations are enabled
    writable: bool,
    /// SECURITY: Counter for in-flight prefetch threads to prevent DoS
    prefetch_inflight: Arc<AtomicUsize>,
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
            sync_engine: Arc::new(SyncEngine::default()),
            writable: false, // Read-only by default
            prefetch_inflight: Arc::new(AtomicUsize::new(0)),
        }
    }

    /// Create with write support enabled (Phase 7)
    pub fn new_writable(bridge: FuseAsyncBridge) -> Self {
        info!("Initializing WormholeFS with write support");
        Self {
            bridge,
            cache: Arc::new(HybridCacheManager::new(
                Duration::from_secs(5),
                Duration::from_secs(5),
            )),
            governor: Mutex::new(Governor::new()),
            sync_engine: Arc::new(SyncEngine::default()),
            writable: true,
            prefetch_inflight: Arc::new(AtomicUsize::new(0)),
        }
    }

    /// Create with a shared cache (for testing or custom configuration)
    pub fn with_cache(bridge: FuseAsyncBridge, cache: Arc<HybridCacheManager>) -> Self {
        Self {
            bridge,
            cache,
            governor: Mutex::new(Governor::new()),
            sync_engine: Arc::new(SyncEngine::default()),
            writable: false,
            prefetch_inflight: Arc::new(AtomicUsize::new(0)),
        }
    }

    /// Create with a shared cache and write support (Phase 7)
    pub fn with_cache_writable(bridge: FuseAsyncBridge, cache: Arc<HybridCacheManager>) -> Self {
        Self {
            bridge,
            cache,
            governor: Mutex::new(Governor::new()),
            sync_engine: Arc::new(SyncEngine::default()),
            writable: true,
            prefetch_inflight: Arc::new(AtomicUsize::new(0)),
        }
    }

    /// Get the sync engine (for external sync operations)
    pub fn sync_engine(&self) -> Arc<SyncEngine> {
        self.sync_engine.clone()
    }

    /// Check if write operations are enabled
    pub fn is_writable(&self) -> bool {
        self.writable
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
    ///
    /// SECURITY: Limited to MAX_PREFETCH_CONCURRENT threads to prevent DoS
    fn prefetch_chunks(&self, targets: Vec<ChunkId>) {
        for chunk_id in targets {
            // Skip if already cached
            if self.cache.chunks.contains(&chunk_id) {
                continue;
            }

            // SECURITY: Check if we're at the concurrent prefetch limit
            let current = self.prefetch_inflight.load(Ordering::Acquire);
            if current >= MAX_PREFETCH_CONCURRENT {
                trace!(
                    "prefetch: at limit ({}/{}), skipping chunk {:?}",
                    current,
                    MAX_PREFETCH_CONCURRENT,
                    chunk_id
                );
                continue;
            }

            // Try to increment the counter atomically
            // Use compare_exchange to avoid races
            if self
                .prefetch_inflight
                .compare_exchange(current, current + 1, Ordering::AcqRel, Ordering::Acquire)
                .is_err()
            {
                // Another thread beat us, skip this chunk
                trace!("prefetch: lost race, skipping chunk {:?}", chunk_id);
                continue;
            }

            // Fire off background fetch
            // The bridge.read() will cache the result automatically
            trace!(
                "prefetch: scheduling chunk {:?} ({}/{})",
                chunk_id,
                current + 1,
                MAX_PREFETCH_CONCURRENT
            );

            // Clone what we need for the background fetch
            let bridge = self.bridge.clone();
            let cache = self.cache.clone();
            let inflight_counter = self.prefetch_inflight.clone();

            // Spawn background prefetch (fire-and-forget)
            std::thread::spawn(move || {
                let offset = chunk_id.byte_offset();
                let result = bridge.read(chunk_id.inode, offset, teleport_core::CHUNK_SIZE as u32);

                // SECURITY: Always decrement counter when done, even on error
                inflight_counter.fetch_sub(1, Ordering::Release);

                if let Ok(data) = result {
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

        let data = self
            .bridge
            .read(chunk_id.inode, offset, teleport_core::CHUNK_SIZE as u32)?;
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

    fn getattr(&mut self, _req: &Request<'_>, ino: Inode, _fh: Option<u64>, reply: ReplyAttr) {
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

    /// Write data to a file (Phase 7)
    fn write(
        &mut self,
        _req: &Request<'_>,
        ino: Inode,
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

        // Check if writes are enabled
        if !self.writable {
            warn!("write rejected: filesystem is read-only");
            reply.error(libc::EROFS);
            return;
        }

        // Mark chunks as dirty in sync engine
        let chunk_size = teleport_core::CHUNK_SIZE as u64;
        let start_chunk = offset / chunk_size;
        let end_offset = offset + data.len() as u64;
        let end_chunk = if end_offset == 0 {
            0
        } else {
            (end_offset - 1) / chunk_size
        };

        // For now, we write locally to dirty cache and let sync engine handle write-back
        // In a full implementation, we'd:
        // 1. Acquire lock if not held
        // 2. Write locally
        // 3. Mark dirty for background sync

        // Handle writes that span multiple chunks
        let mut written = 0usize;
        let mut current_offset = offset;

        for chunk_idx in start_chunk..=end_chunk {
            let chunk_id = ChunkId::new(ino, chunk_idx);
            let chunk_start = chunk_idx * chunk_size;

            // Calculate what portion of data goes to this chunk
            let offset_in_chunk = (current_offset - chunk_start) as usize;
            let space_in_chunk = chunk_size as usize - offset_in_chunk;
            let remaining_data = data.len() - written;
            let to_write = std::cmp::min(space_in_chunk, remaining_data);

            // Get existing chunk data or create new
            let mut chunk_data = if let Some(cached) = self.cache.chunks.get(&chunk_id) {
                (*cached).clone()
            } else if let Some(dirty) = self.sync_engine.get_dirty_chunk(&chunk_id) {
                dirty
            } else {
                // Fetch from network
                match self.fetch_chunk(chunk_id) {
                    Ok(d) => d,
                    Err(FuseError::NotFound) => {
                        // New chunk - start empty
                        Vec::new()
                    }
                    Err(e) => {
                        error!("write: failed to fetch existing chunk: {:?}", e);
                        reply.error(e.to_errno());
                        return;
                    }
                }
            };

            // Extend chunk if necessary
            let required_len = offset_in_chunk + to_write;
            if chunk_data.len() < required_len {
                chunk_data.resize(required_len, 0);
            }

            // Write data into chunk
            chunk_data[offset_in_chunk..offset_in_chunk + to_write]
                .copy_from_slice(&data[written..written + to_write]);

            // Mark as dirty (will be synced later)
            self.sync_engine.mark_dirty(chunk_id, chunk_data.clone());

            // Also update local cache for immediate reads
            self.cache.chunks.insert(chunk_id, chunk_data);

            written += to_write;
            current_offset += to_write as u64;
        }

        // Invalidate attr cache since size may have changed
        self.cache.attrs.invalidate(ino);

        debug!("write: wrote {} bytes", written);
        reply.written(written as u32);
    }

    /// Flush cached writes to storage (Phase 7)
    fn flush(
        &mut self,
        _req: &Request<'_>,
        ino: Inode,
        _fh: u64,
        _lock_owner: u64,
        reply: fuser::ReplyEmpty,
    ) {
        debug!("flush: ino={}", ino);

        // For now, we rely on background sync
        // A full implementation would immediately sync dirty chunks for this inode
        if self.sync_engine.has_dirty_chunks(ino) {
            debug!(
                "flush: {} has dirty chunks, sync will happen in background",
                ino
            );
            // Could trigger immediate sync here via bridge.flush(ino)
        }

        reply.ok();
    }

    /// Synchronize file to disk (Phase 7)
    fn fsync(
        &mut self,
        _req: &Request<'_>,
        ino: Inode,
        _fh: u64,
        _datasync: bool,
        reply: fuser::ReplyEmpty,
    ) {
        debug!("fsync: ino={}", ino);

        // Similar to flush - rely on background sync for now
        if self.sync_engine.has_dirty_chunks(ino) {
            debug!("fsync: {} has dirty chunks pending", ino);
        }

        reply.ok();
    }

    /// Create a regular file (Phase 7)
    fn create(
        &mut self,
        _req: &Request<'_>,
        parent: Inode,
        name: &OsStr,
        mode: u32,
        _umask: u32,
        _flags: i32,
        reply: fuser::ReplyCreate,
    ) {
        let name = match name.to_str() {
            Some(n) => n.to_string(),
            None => {
                reply.error(libc::EINVAL);
                return;
            }
        };

        debug!("create: parent={}, name={}, mode={:o}", parent, name, mode);

        // Check if writes are enabled
        if !self.writable {
            warn!("create rejected: filesystem is read-only");
            reply.error(libc::EROFS);
            return;
        }

        match self.bridge.create_file(parent, name.clone(), mode) {
            Ok(attr) => {
                // Cache the new file's attributes
                self.cache.attrs.insert(attr.inode, attr.clone());
                // Invalidate parent directory cache
                self.cache.dirs.invalidate(parent);

                reply.created(&TTL, &Self::to_fuser_attr(&attr), 0, 0, 0);
            }
            Err(e) => {
                error!("create error: {:?}", e);
                reply.error(e.to_errno());
            }
        }
    }

    /// Create a file node (mknod) - redirect to create for regular files (Phase 7)
    fn mknod(
        &mut self,
        _req: &Request<'_>,
        parent: Inode,
        name: &OsStr,
        mode: u32,
        _umask: u32,
        _rdev: u32,
        reply: ReplyEntry,
    ) {
        let name = match name.to_str() {
            Some(n) => n.to_string(),
            None => {
                reply.error(libc::EINVAL);
                return;
            }
        };

        debug!("mknod: parent={}, name={}, mode={:o}", parent, name, mode);

        // Check if writes are enabled
        if !self.writable {
            warn!("mknod rejected: filesystem is read-only");
            reply.error(libc::EROFS);
            return;
        }

        // Only support regular files via mknod
        #[allow(clippy::unnecessary_cast)]
        let file_type = mode & libc::S_IFMT as u32;
        #[allow(clippy::unnecessary_cast)]
        if file_type != libc::S_IFREG as u32 && file_type != 0 {
            warn!("mknod: unsupported file type {:o}", file_type);
            reply.error(libc::ENOTSUP);
            return;
        }

        match self.bridge.create_file(parent, name.clone(), mode & 0o7777) {
            Ok(attr) => {
                self.cache.attrs.insert(attr.inode, attr.clone());
                self.cache.dirs.invalidate(parent);
                reply.entry(&TTL, &Self::to_fuser_attr(&attr), 0);
            }
            Err(e) => {
                error!("mknod error: {:?}", e);
                reply.error(e.to_errno());
            }
        }
    }

    /// Remove a file (Phase 7)
    fn unlink(
        &mut self,
        _req: &Request<'_>,
        parent: Inode,
        name: &OsStr,
        reply: fuser::ReplyEmpty,
    ) {
        let name = match name.to_str() {
            Some(n) => n.to_string(),
            None => {
                reply.error(libc::EINVAL);
                return;
            }
        };

        debug!("unlink: parent={}, name={}", parent, name);

        // Check if writes are enabled
        if !self.writable {
            warn!("unlink rejected: filesystem is read-only");
            reply.error(libc::EROFS);
            return;
        }

        match self.bridge.delete_file(parent, name.clone()) {
            Ok(()) => {
                // Invalidate parent directory cache
                self.cache.dirs.invalidate(parent);
                reply.ok();
            }
            Err(e) => {
                error!("unlink error: {:?}", e);
                reply.error(e.to_errno());
            }
        }
    }

    /// Create a directory (Phase 7)
    fn mkdir(
        &mut self,
        _req: &Request<'_>,
        parent: Inode,
        name: &OsStr,
        mode: u32,
        _umask: u32,
        reply: ReplyEntry,
    ) {
        let name = match name.to_str() {
            Some(n) => n.to_string(),
            None => {
                reply.error(libc::EINVAL);
                return;
            }
        };

        debug!("mkdir: parent={}, name={}, mode={:o}", parent, name, mode);

        // Check if writes are enabled
        if !self.writable {
            warn!("mkdir rejected: filesystem is read-only");
            reply.error(libc::EROFS);
            return;
        }

        match self.bridge.create_dir(parent, name.clone(), mode) {
            Ok(attr) => {
                self.cache.attrs.insert(attr.inode, attr.clone());
                self.cache.dirs.invalidate(parent);
                reply.entry(&TTL, &Self::to_fuser_attr(&attr), 0);
            }
            Err(e) => {
                error!("mkdir error: {:?}", e);
                reply.error(e.to_errno());
            }
        }
    }

    /// Remove a directory (Phase 7)
    fn rmdir(&mut self, _req: &Request<'_>, parent: Inode, name: &OsStr, reply: fuser::ReplyEmpty) {
        let name = match name.to_str() {
            Some(n) => n.to_string(),
            None => {
                reply.error(libc::EINVAL);
                return;
            }
        };

        debug!("rmdir: parent={}, name={}", parent, name);

        // Check if writes are enabled
        if !self.writable {
            warn!("rmdir rejected: filesystem is read-only");
            reply.error(libc::EROFS);
            return;
        }

        match self.bridge.delete_dir(parent, name.clone()) {
            Ok(()) => {
                self.cache.dirs.invalidate(parent);
                reply.ok();
            }
            Err(e) => {
                error!("rmdir error: {:?}", e);
                reply.error(e.to_errno());
            }
        }
    }

    /// Rename a file or directory (Phase 7)
    fn rename(
        &mut self,
        _req: &Request<'_>,
        parent: Inode,
        name: &OsStr,
        newparent: Inode,
        newname: &OsStr,
        _flags: u32,
        reply: fuser::ReplyEmpty,
    ) {
        let name = match name.to_str() {
            Some(n) => n.to_string(),
            None => {
                reply.error(libc::EINVAL);
                return;
            }
        };
        let newname = match newname.to_str() {
            Some(n) => n.to_string(),
            None => {
                reply.error(libc::EINVAL);
                return;
            }
        };

        debug!("rename: {}/{} -> {}/{}", parent, name, newparent, newname);

        // Check if writes are enabled
        if !self.writable {
            warn!("rename rejected: filesystem is read-only");
            reply.error(libc::EROFS);
            return;
        }

        match self
            .bridge
            .rename(parent, name.clone(), newparent, newname.clone())
        {
            Ok(()) => {
                // Invalidate both parent directories
                self.cache.dirs.invalidate(parent);
                if newparent != parent {
                    self.cache.dirs.invalidate(newparent);
                }
                reply.ok();
            }
            Err(e) => {
                error!("rename error: {:?}", e);
                reply.error(e.to_errno());
            }
        }
    }

    /// Set file attributes (Phase 7)
    fn setattr(
        &mut self,
        _req: &Request<'_>,
        ino: Inode,
        mode: Option<u32>,
        _uid: Option<u32>,
        _gid: Option<u32>,
        size: Option<u64>,
        atime: Option<fuser::TimeOrNow>,
        mtime: Option<fuser::TimeOrNow>,
        _ctime: Option<std::time::SystemTime>,
        _fh: Option<u64>,
        _crtime: Option<std::time::SystemTime>,
        _chgtime: Option<std::time::SystemTime>,
        _bkuptime: Option<std::time::SystemTime>,
        _flags: Option<u32>,
        reply: ReplyAttr,
    ) {
        debug!("setattr: ino={}, mode={:?}, size={:?}", ino, mode, size);

        // Check if any attributes require write permission
        let needs_write = mode.is_some() || size.is_some() || atime.is_some() || mtime.is_some();

        if needs_write && !self.writable {
            warn!("setattr rejected: filesystem is read-only");
            reply.error(libc::EROFS);
            return;
        }

        // Convert TimeOrNow to epoch seconds
        let atime_secs = atime.map(|t| match t {
            fuser::TimeOrNow::SpecificTime(st) => st
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
            fuser::TimeOrNow::Now => std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
        });

        let mtime_secs = mtime.map(|t| match t {
            fuser::TimeOrNow::SpecificTime(st) => st
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
            fuser::TimeOrNow::Now => std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
        });

        match self.bridge.setattr(ino, size, mode, mtime_secs, atime_secs) {
            Ok(attr) => {
                self.cache.attrs.insert(ino, attr.clone());
                reply.attr(&TTL, &Self::to_fuser_attr(&attr));
            }
            Err(e) => {
                error!("setattr error: {:?}", e);
                reply.error(e.to_errno());
            }
        }
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
