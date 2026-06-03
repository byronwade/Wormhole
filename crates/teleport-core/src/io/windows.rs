//! Windows-specific I/O implementation.
//!
//! This module provides Windows-optimized I/O using:
//! - TransmitFile for zero-copy file-to-socket transfers
//! - Overlapped I/O for async operations
//!
//! Currently a stub - uses fallback I/O.

use super::fallback::FallbackIO;
use super::AsyncIO;
use std::fs::File;
use std::io;
use std::path::Path;

/// Windows I/O implementation.
///
/// TODO: Implement TransmitFile and overlapped I/O.
pub struct WindowsIO {
    fallback: FallbackIO,
}

impl WindowsIO {
    /// Create a new Windows I/O handler.
    pub fn new() -> Self {
        Self {
            fallback: FallbackIO::new(),
        }
    }
}

impl Default for WindowsIO {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl AsyncIO for WindowsIO {
    async fn read_file(&self, path: &Path, offset: u64, buf: &mut [u8]) -> io::Result<usize> {
        self.fallback.read_file(path, offset, buf).await
    }

    async fn sendfile(
        &self,
        file: &File,
        socket_fd: i32,
        offset: u64,
        len: usize,
    ) -> io::Result<usize> {
        // TODO: Implement using TransmitFile
        // For now, use fallback
        self.fallback.sendfile(file, socket_fd, offset, len).await
    }

    async fn writev(&self, file: &File, bufs: &[&[u8]], offset: u64) -> io::Result<usize> {
        self.fallback.writev(file, bufs, offset).await
    }

    fn name(&self) -> &'static str {
        "Windows (fallback)"
    }
}
