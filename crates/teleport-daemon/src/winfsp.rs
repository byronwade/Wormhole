//! WinFSP filesystem implementation for Windows
//!
//! This module implements the winfsp FileSystemContext trait, bridging
//! to the async networking layer via FuseAsyncBridge.
//!
//! # Architecture
//!
//! ```text
//! Windows Application (Explorer, etc.)
//!         │
//!         ▼
//! ┌─────────────────────────────────┐
//! │   WinFSP FileSystemContext      │
//! │   (WormholeWinFS)               │
//! └──────────────┬──────────────────┘
//!                │
//!                ▼
//! ┌─────────────────────────────────┐
//! │   FuseAsyncBridge               │
//! │   (platform-agnostic)           │
//! └──────────────┬──────────────────┘
//!                │
//!                ▼
//! ┌─────────────────────────────────┐
//! │   BridgeHandler + Client        │
//! │   (QUIC networking)             │
//! └─────────────────────────────────┘
//! ```

use std::ffi::c_void;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex;
use tracing::{debug, error, trace, warn};
use winfsp::filesystem::{
    DirBuffer, DirInfo, DirMarker, FileInfo, FileSecurity, FileSystemContext, OpenFileInfo,
    VolumeInfo, WideNameInfo,
};
use winfsp::host::{FileSystemHost, VolumeParams};
use winfsp::U16CStr;

use teleport_core::{ChunkId, FileAttr, FileType, Inode, CHUNK_SIZE};

use crate::bridge::{FuseAsyncBridge, FuseError};
use crate::cache::HybridCacheManager;
use crate::governor::{Governor, MAX_PREFETCH_CONCURRENT};
use crate::sync_engine::SyncEngine;

// Windows type aliases from winfsp-sys
type FILE_ACCESS_RIGHTS = u32;
type FILE_FLAGS_AND_ATTRIBUTES = u32;

// NTSTATUS codes
const STATUS_SUCCESS: i32 = 0;
const STATUS_OBJECT_NAME_NOT_FOUND: i32 = 0xC0000034_u32 as i32;
const STATUS_ACCESS_DENIED: i32 = 0xC0000022_u32 as i32;
const STATUS_MEDIA_WRITE_PROTECTED: i32 = 0xC00000A2_u32 as i32;
const STATUS_NOT_IMPLEMENTED: i32 = 0xC0000002_u32 as i32;
const STATUS_INTERNAL_ERROR: i32 = 0xC00000E5_u32 as i32;

/// File context for open file handles
/// WinFSP requires this to track open files
pub struct WormholeFileContext {
    /// Inode of the open file
    pub inode: Inode,
    /// Whether file is a directory
    pub is_directory: bool,
    /// Current directory enumeration position (for directories)
    pub dir_offset: AtomicU64,
}

impl WormholeFileContext {
    fn new(inode: Inode, is_directory: bool) -> Self {
        Self {
            inode,
            is_directory,
            dir_offset: AtomicU64::new(0),
        }
    }
}

/// Wormhole WinFSP filesystem with caching and prefetch support
pub struct WormholeWinFS {
    bridge: FuseAsyncBridge,
    cache: Arc<HybridCacheManager>,
    governor: Mutex<Governor>,
    /// Sync engine for tracking dirty chunks
    sync_engine: Arc<SyncEngine>,
    /// Whether write operations are enabled
    writable: bool,
    /// Counter for in-flight prefetch threads
    prefetch_inflight: Arc<AtomicU64>,
    /// Volume label
    volume_label: String,
}

impl WormholeWinFS {
    /// Create a new WinFSP filesystem
    pub fn new(bridge: FuseAsyncBridge) -> Self {
        Self::new_internal(bridge, false)
    }

    /// Create with write support enabled
    pub fn new_writable(bridge: FuseAsyncBridge) -> Self {
        Self::new_internal(bridge, true)
    }

    fn new_internal(bridge: FuseAsyncBridge, writable: bool) -> Self {
        Self {
            bridge,
            cache: Arc::new(HybridCacheManager::new(
                Duration::from_secs(5),
                Duration::from_secs(5),
            )),
            governor: Mutex::new(Governor::new()),
            sync_engine: Arc::new(SyncEngine::default()),
            writable,
            prefetch_inflight: Arc::new(AtomicU64::new(0)),
            volume_label: "Wormhole".to_string(),
        }
    }

    /// Get the sync engine
    pub fn sync_engine(&self) -> Arc<SyncEngine> {
        self.sync_engine.clone()
    }

    /// Get disk cache for GC
    pub fn disk_cache(&self) -> Option<Arc<crate::disk_cache::DiskCache>> {
        self.cache.disk_cache()
    }

    /// Convert FileAttr to WinFSP FileInfo
    fn attr_to_file_info(attr: &FileAttr, info: &mut FileInfo) {
        // File attributes
        info.file_attributes = match attr.file_type {
            FileType::Directory => 0x10, // FILE_ATTRIBUTE_DIRECTORY
            FileType::File => 0x80,      // FILE_ATTRIBUTE_NORMAL
            FileType::Symlink => 0x400,  // FILE_ATTRIBUTE_REPARSE_POINT
        };

        // File size
        info.file_size = attr.size;
        info.allocation_size = ((attr.size + 4095) / 4096) * 4096; // Round to 4KB

        // Timestamps (convert Unix epoch to Windows FILETIME)
        // FILETIME is 100-nanosecond intervals since January 1, 1601
        const EPOCH_DIFF: u64 = 116444736000000000; // 100-ns intervals from 1601 to 1970

        let atime = (attr.atime as u64) * 10_000_000 + EPOCH_DIFF;
        let mtime = (attr.mtime as u64) * 10_000_000 + EPOCH_DIFF;
        let ctime = (attr.ctime as u64) * 10_000_000 + EPOCH_DIFF;

        info.last_access_time = atime;
        info.last_write_time = mtime;
        info.change_time = ctime;
        info.creation_time = ctime;

        // Index number (inode)
        info.index_number = attr.inode;
    }

    /// Fetch a single chunk with caching
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
            .read(chunk_id.inode, offset, CHUNK_SIZE as u32)?;
        self.cache.chunks.insert(chunk_id, data.clone());
        Ok(data)
    }

    /// Read data spanning potentially multiple chunks
    fn read_stitched(&self, ino: Inode, offset: u64, size: u32) -> Result<Vec<u8>, FuseError> {
        let chunk_size = CHUNK_SIZE as u64;
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

        // Multi-chunk case
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
                break;
            }

            result.extend_from_slice(&chunk_data[start_in_chunk..start_in_chunk + to_read]);
            remaining -= to_read;
            current_offset += to_read as u64;
        }

        Ok(result)
    }

    /// Trigger background prefetch for sequential access patterns
    fn prefetch_chunks(&self, targets: Vec<ChunkId>) {
        for chunk_id in targets {
            if self.cache.chunks.contains(&chunk_id) {
                continue;
            }

            let current = self.prefetch_inflight.load(Ordering::Acquire);
            if current >= MAX_PREFETCH_CONCURRENT as u64 {
                trace!("prefetch: at limit, skipping chunk {:?}", chunk_id);
                continue;
            }

            if self
                .prefetch_inflight
                .compare_exchange(current, current + 1, Ordering::AcqRel, Ordering::Acquire)
                .is_err()
            {
                continue;
            }

            let bridge = self.bridge.clone();
            let cache = self.cache.clone();
            let inflight_counter = self.prefetch_inflight.clone();

            std::thread::spawn(move || {
                let offset = chunk_id.byte_offset();
                let result = bridge.read(chunk_id.inode, offset, CHUNK_SIZE as u32);
                inflight_counter.fetch_sub(1, Ordering::Release);

                if let Ok(data) = result {
                    cache.chunks.insert(chunk_id, data);
                }
            });
        }
    }

    /// Resolve a path string to (parent_inode, filename)
    fn resolve_path(&self, path: &str) -> Result<(Inode, String), winfsp::FspError> {
        let path = path.trim_start_matches('\\').trim_start_matches('/');

        if path.is_empty() {
            // Root directory
            return Ok((1, ".".to_string()));
        }

        let parts: Vec<&str> = path.split(|c| c == '\\' || c == '/').collect();

        if parts.len() == 1 {
            // File in root
            return Ok((1, parts[0].to_string()));
        }

        // Walk the path to find the parent inode
        let mut current_inode: Inode = 1; // Root

        for i in 0..parts.len() - 1 {
            let name = parts[i];
            if name.is_empty() {
                continue;
            }

            match self.bridge.lookup(current_inode, name.to_string()) {
                Ok(attr) => {
                    current_inode = attr.inode;
                }
                Err(FuseError::NotFound) => {
                    return Err(FspError::NTSTATUS(STATUS_OBJECT_NAME_NOT_FOUND));
                }
                Err(e) => {
                    return Err(FspError::NTSTATUS(e.to_ntstatus()));
                }
            }
        }

        Ok((current_inode, parts.last().unwrap().to_string()))
    }
}

// Import FspError for creating errors
use winfsp::FspError;

impl FileSystemContext for WormholeWinFS {
    type FileContext = WormholeFileContext;

    fn get_volume_info(&self, out_volume_info: &mut VolumeInfo) -> winfsp::Result<()> {
        // Total and free space (report large values since this is a network FS)
        out_volume_info.total_size = 1024 * 1024 * 1024 * 1024; // 1 TB
        out_volume_info.free_size = 512 * 1024 * 1024 * 1024; // 512 GB free

        // Set volume label
        out_volume_info.set_volume_label(&self.volume_label);

        Ok(())
    }

    fn get_security_by_name(
        &self,
        file_name: &U16CStr,
        _security_descriptor: Option<&mut [c_void]>,
        _resolve_reparse_points: impl FnOnce(&U16CStr) -> Option<FileSecurity>,
    ) -> winfsp::Result<FileSecurity> {
        let path = file_name.to_string_lossy();
        debug!("get_security_by_name: {}", path);

        // For now, return empty security (all access allowed)
        // In production, we'd map Unix permissions to Windows ACLs
        Ok(FileSecurity {
            attributes: 0x80, // FILE_ATTRIBUTE_NORMAL
            reparse: false,
            sz_security_descriptor: 0,
        })
    }

    fn open(
        &self,
        file_name: &U16CStr,
        _create_options: u32,
        _granted_access: FILE_ACCESS_RIGHTS,
        file_info: &mut OpenFileInfo,
    ) -> winfsp::Result<Self::FileContext> {
        let path = file_name.to_string_lossy();
        debug!("open: {}", path);

        // Parse path to get parent and name
        let (parent_inode, name) = self.resolve_path(&path)?;

        // Lookup the file
        let attr = match self.bridge.lookup(parent_inode, name) {
            Ok(attr) => attr,
            Err(FuseError::NotFound) => {
                return Err(FspError::NTSTATUS(STATUS_OBJECT_NAME_NOT_FOUND))
            }
            Err(e) => {
                error!("open error: {:?}", e);
                return Err(FspError::NTSTATUS(e.to_ntstatus()));
            }
        };

        // Fill in file info using AsMut trait
        let info: &mut FileInfo = file_info.as_mut();
        Self::attr_to_file_info(&attr, info);

        let is_directory = matches!(attr.file_type, FileType::Directory);
        Ok(WormholeFileContext::new(attr.inode, is_directory))
    }

    fn close(&self, context: Self::FileContext) {
        debug!("close: inode={}", context.inode);
        // Clear governor state for this file
        self.governor.lock().clear_inode(context.inode);
    }

    fn read(
        &self,
        context: &Self::FileContext,
        buffer: &mut [u8],
        offset: u64,
    ) -> winfsp::Result<u32> {
        trace!(
            "read: inode={}, offset={}, size={}",
            context.inode,
            offset,
            buffer.len()
        );

        // Record access for governor
        let chunk_id = ChunkId::from_offset(context.inode, offset);
        let prefetch_targets = {
            let mut gov = self.governor.lock();
            gov.record_access(&chunk_id)
        };

        // Trigger prefetch if sequential pattern detected
        if !prefetch_targets.is_empty() {
            self.prefetch_chunks(prefetch_targets);
        }

        match self.read_stitched(context.inode, offset, buffer.len() as u32) {
            Ok(data) => {
                let bytes_read = std::cmp::min(data.len(), buffer.len());
                buffer[..bytes_read].copy_from_slice(&data[..bytes_read]);
                Ok(bytes_read as u32)
            }
            Err(e) => {
                error!("read error: {:?}", e);
                Err(FspError::NTSTATUS(e.to_ntstatus()))
            }
        }
    }

    fn write(
        &self,
        context: &Self::FileContext,
        buffer: &[u8],
        offset: u64,
        _write_to_end_of_file: bool,
        _constrained_io: bool,
        file_info: &mut FileInfo,
    ) -> winfsp::Result<u32> {
        debug!(
            "write: inode={}, offset={}, size={}",
            context.inode,
            offset,
            buffer.len()
        );

        if !self.writable {
            warn!("write rejected: filesystem is read-only");
            return Err(FspError::NTSTATUS(STATUS_MEDIA_WRITE_PROTECTED));
        }

        // Write to cache and mark dirty
        let chunk_size = CHUNK_SIZE as u64;
        let start_chunk = offset / chunk_size;
        let end_offset = offset + buffer.len() as u64;
        let end_chunk = if end_offset == 0 {
            0
        } else {
            (end_offset - 1) / chunk_size
        };

        let mut written = 0usize;
        let mut current_offset = offset;

        for chunk_idx in start_chunk..=end_chunk {
            let chunk_id = ChunkId::new(context.inode, chunk_idx);
            let chunk_start = chunk_idx * chunk_size;

            let offset_in_chunk = (current_offset - chunk_start) as usize;
            let space_in_chunk = CHUNK_SIZE - offset_in_chunk;
            let remaining_data = buffer.len() - written;
            let to_write = std::cmp::min(space_in_chunk, remaining_data);

            // Get existing chunk data or create new
            let mut chunk_data = if let Some(cached) = self.cache.chunks.get(&chunk_id) {
                (*cached).clone()
            } else if let Some(dirty) = self.sync_engine.get_dirty_chunk(&chunk_id) {
                dirty
            } else {
                match self.fetch_chunk(chunk_id) {
                    Ok(d) => d,
                    Err(FuseError::NotFound) => Vec::new(),
                    Err(e) => return Err(FspError::NTSTATUS(e.to_ntstatus())),
                }
            };

            // Extend if necessary
            let required_len = offset_in_chunk + to_write;
            if chunk_data.len() < required_len {
                chunk_data.resize(required_len, 0);
            }

            // Write data
            chunk_data[offset_in_chunk..offset_in_chunk + to_write]
                .copy_from_slice(&buffer[written..written + to_write]);

            // Mark dirty
            self.sync_engine.mark_dirty(chunk_id, chunk_data.clone());
            self.cache.chunks.insert(chunk_id, chunk_data);

            written += to_write;
            current_offset += to_write as u64;
        }

        // Invalidate attr cache and update file_info
        self.cache.attrs.invalidate(context.inode);

        // Get updated file info
        if let Ok(attr) = self.bridge.getattr(context.inode) {
            Self::attr_to_file_info(&attr, file_info);
        }

        Ok(written as u32)
    }

    fn read_directory(
        &self,
        context: &Self::FileContext,
        _pattern: Option<&U16CStr>,
        marker: DirMarker<'_>,
        buffer: &mut [u8],
    ) -> winfsp::Result<u32> {
        debug!(
            "read_directory: inode={}, has_marker={}",
            context.inode,
            !marker.is_none()
        );

        // Get directory entries
        let entries = match self.bridge.readdir(context.inode, 0) {
            Ok(e) => e,
            Err(e) => {
                error!("readdir error: {:?}", e);
                return Err(FspError::NTSTATUS(e.to_ntstatus()));
            }
        };

        // Create a DirBuffer to hold entries
        let dir_buffer = DirBuffer::new();

        // Acquire the buffer for writing - acquire returns Result, not Option
        match dir_buffer.acquire(marker.is_none(), None) {
            Ok(mut lock) => {
                // Add "." entry
                let mut dot_info: DirInfo = DirInfo::new();
                dot_info.file_info_mut().file_attributes = 0x10; // FILE_ATTRIBUTE_DIRECTORY
                dot_info.set_name(".");
                lock.write(&mut dot_info);

                // Add ".." entry
                let mut dotdot_info: DirInfo = DirInfo::new();
                dotdot_info.file_info_mut().file_attributes = 0x10;
                dotdot_info.set_name("..");
                lock.write(&mut dotdot_info);

                // Add actual entries
                for entry in entries {
                    let mut dir_info: DirInfo = DirInfo::new();

                    // Get file info for this entry
                    match self.bridge.getattr(entry.inode) {
                        Ok(attr) => {
                            Self::attr_to_file_info(&attr, dir_info.file_info_mut());
                        }
                        Err(_) => {
                            // Use basic info from entry
                            dir_info.file_info_mut().file_attributes = match entry.file_type {
                                FileType::Directory => 0x10,
                                FileType::File => 0x80,
                                FileType::Symlink => 0x400,
                            };
                        }
                    }

                    dir_info.set_name(&entry.name);
                    lock.write(&mut dir_info);
                }
            }
            Err(e) => {
                // Buffer acquisition failed
                debug!("Failed to acquire dir buffer: {:?}", e);
            }
        }

        // Read from dir buffer into output buffer
        let bytes_written = dir_buffer.read(marker, buffer);

        Ok(bytes_written)
    }

    fn get_file_info(
        &self,
        context: &Self::FileContext,
        file_info: &mut FileInfo,
    ) -> winfsp::Result<()> {
        trace!("get_file_info: inode={}", context.inode);

        // Check cache first
        if let Some(attr) = self.cache.attrs.get(context.inode) {
            Self::attr_to_file_info(&attr, file_info);
            return Ok(());
        }

        match self.bridge.getattr(context.inode) {
            Ok(attr) => {
                self.cache.attrs.insert(context.inode, attr.clone());
                Self::attr_to_file_info(&attr, file_info);
                Ok(())
            }
            Err(e) => {
                error!("getattr error: {:?}", e);
                Err(FspError::NTSTATUS(e.to_ntstatus()))
            }
        }
    }

    fn set_file_size(
        &self,
        context: &Self::FileContext,
        new_size: u64,
        _set_allocation_size: bool,
        file_info: &mut FileInfo,
    ) -> winfsp::Result<()> {
        debug!(
            "set_file_size: inode={}, new_size={}",
            context.inode, new_size
        );

        if !self.writable {
            return Err(FspError::NTSTATUS(STATUS_MEDIA_WRITE_PROTECTED));
        }

        match self
            .bridge
            .setattr(context.inode, Some(new_size), None, None, None)
        {
            Ok(attr) => {
                self.cache.attrs.insert(context.inode, attr.clone());
                Self::attr_to_file_info(&attr, file_info);
                Ok(())
            }
            Err(e) => Err(FspError::NTSTATUS(e.to_ntstatus())),
        }
    }

    fn flush(
        &self,
        context: Option<&Self::FileContext>,
        _file_info: &mut FileInfo,
    ) -> winfsp::Result<()> {
        if let Some(ctx) = context {
            debug!("flush: inode={}", ctx.inode);
            if self.sync_engine.has_dirty_chunks(ctx.inode) {
                debug!("flush: has dirty chunks, sync pending");
            }
        } else {
            debug!("flush: global flush");
        }

        Ok(())
    }

    fn cleanup(&self, context: &Self::FileContext, _file_name: Option<&U16CStr>, _flags: u32) {
        debug!("cleanup: inode={}", context.inode);
        // Called before close - opportunity to flush
    }

    fn create(
        &self,
        file_name: &U16CStr,
        _create_options: u32,
        _granted_access: FILE_ACCESS_RIGHTS,
        _file_attributes: FILE_FLAGS_AND_ATTRIBUTES,
        _security_descriptor: Option<&[c_void]>,
        _allocation_size: u64,
        _extra_buffer: Option<&[u8]>,
        _extra_buffer_is_reparse_point: bool,
        file_info: &mut OpenFileInfo,
    ) -> winfsp::Result<Self::FileContext> {
        let path = file_name.to_string_lossy();
        debug!("create: {}", path);

        if !self.writable {
            return Err(FspError::NTSTATUS(STATUS_MEDIA_WRITE_PROTECTED));
        }

        let (parent_inode, name) = self.resolve_path(&path)?;

        match self.bridge.create_file(parent_inode, name, 0o644) {
            Ok(attr) => {
                self.cache.attrs.insert(attr.inode, attr.clone());
                self.cache.dirs.invalidate(parent_inode);

                let info: &mut FileInfo = file_info.as_mut();
                Self::attr_to_file_info(&attr, info);

                Ok(WormholeFileContext::new(attr.inode, false))
            }
            Err(e) => Err(FspError::NTSTATUS(e.to_ntstatus())),
        }
    }

    fn rename(
        &self,
        context: &Self::FileContext,
        _file_name: &U16CStr,
        new_file_name: &U16CStr,
        _replace_if_exists: bool,
    ) -> winfsp::Result<()> {
        let new_path = new_file_name.to_string_lossy();
        debug!("rename: inode={} -> {}", context.inode, new_path);

        if !self.writable {
            return Err(FspError::NTSTATUS(STATUS_MEDIA_WRITE_PROTECTED));
        }

        // TODO: Implement rename via bridge
        // For now, return not implemented
        Err(FspError::NTSTATUS(STATUS_NOT_IMPLEMENTED))
    }

    fn overwrite(
        &self,
        context: &Self::FileContext,
        _file_attributes: FILE_FLAGS_AND_ATTRIBUTES,
        _replace_file_attributes: bool,
        _allocation_size: u64,
        _extra_buffer: Option<&[u8]>,
        file_info: &mut FileInfo,
    ) -> winfsp::Result<()> {
        debug!("overwrite: inode={}", context.inode);

        if !self.writable {
            return Err(FspError::NTSTATUS(STATUS_MEDIA_WRITE_PROTECTED));
        }

        // Truncate to 0
        match self
            .bridge
            .setattr(context.inode, Some(0), None, None, None)
        {
            Ok(attr) => {
                self.cache.attrs.insert(context.inode, attr.clone());
                Self::attr_to_file_info(&attr, file_info);
                Ok(())
            }
            Err(e) => Err(FspError::NTSTATUS(e.to_ntstatus())),
        }
    }
}

/// Create and start a WinFSP filesystem host
pub fn mount_winfsp(
    bridge: FuseAsyncBridge,
    mount_point: &str,
    writable: bool,
) -> winfsp::Result<FileSystemHost<WormholeWinFS>> {
    let fs = if writable {
        WormholeWinFS::new_writable(bridge)
    } else {
        WormholeWinFS::new(bridge)
    };

    // Create volume parameters
    let mut params = VolumeParams::new();
    params.filesystem_name("Wormhole");
    params.prefix(mount_point);

    let mut host = FileSystemHost::new(params, fs)?;
    host.mount(mount_point)?;

    Ok(host)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_attr_to_file_info() {
        let attr = FileAttr::file(42, 1024);
        let mut info = FileInfo::default();
        WormholeWinFS::attr_to_file_info(&attr, &mut info);

        assert_eq!(info.file_size, 1024);
        assert_eq!(info.index_number, 42);
        assert_eq!(info.file_attributes, 0x80); // FILE_ATTRIBUTE_NORMAL
    }

    #[test]
    fn test_attr_to_file_info_directory() {
        let attr = FileAttr::directory(1);
        let mut info = FileInfo::default();
        WormholeWinFS::attr_to_file_info(&attr, &mut info);

        assert_eq!(info.index_number, 1);
        assert_eq!(info.file_attributes, 0x10); // FILE_ATTRIBUTE_DIRECTORY
    }
}
