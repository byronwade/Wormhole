//! Platform-specific I/O abstraction for high-performance file transfers.
//!
//! This module provides an abstraction layer over platform-specific I/O operations
//! like sendfile (macOS/Linux) and TransmitFile (Windows) for zero-copy file transfers.

use std::fs::File;
use std::io;
use std::path::Path;

#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(target_os = "linux")]
pub mod linux;

#[cfg(target_os = "windows")]
pub mod windows;

pub mod fallback;

/// Trait for platform-optimized async I/O operations.
///
/// Implementations can use platform-specific syscalls like sendfile for
/// zero-copy file-to-socket transfers.
#[async_trait::async_trait]
pub trait AsyncIO: Send + Sync {
    /// Read file contents into a buffer.
    async fn read_file(&self, path: &Path, offset: u64, buf: &mut [u8]) -> io::Result<usize>;

    /// Zero-copy file-to-socket transfer using platform-specific APIs.
    async fn sendfile(
        &self,
        file: &File,
        socket_fd: i32,
        offset: u64,
        len: usize,
    ) -> io::Result<usize>;

    /// Write multiple buffers to a file at a specific offset (scatter-gather I/O).
    async fn writev(&self, file: &File, bufs: &[&[u8]], offset: u64) -> io::Result<usize>;

    /// Get the name of this I/O backend for logging/debugging.
    fn name(&self) -> &'static str;
}

/// Get the best available I/O implementation for the current platform.
pub fn platform_io() -> Box<dyn AsyncIO> {
    #[cfg(target_os = "macos")]
    {
        Box::new(macos::MacOSIO::new())
    }

    #[cfg(target_os = "linux")]
    {
        Box::new(fallback::FallbackIO::new())
    }

    #[cfg(target_os = "windows")]
    {
        Box::new(fallback::FallbackIO::new())
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Box::new(fallback::FallbackIO::new())
    }
}

/// Statistics for I/O operations.
#[derive(Debug, Clone, Default)]
pub struct IoStats {
    pub bytes_read: u64,
    pub bytes_written: u64,
    pub sendfile_calls: u64,
    pub sendfile_bytes: u64,
    pub fallback_count: u64,
}
