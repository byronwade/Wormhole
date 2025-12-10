//! Phase 8: Platform-Optimized I/O Abstraction
//!
//! Provides platform-specific implementations for high-performance file I/O:
//! - macOS: `sendfile()` for zero-copy file-to-socket transfers
//! - Linux: Standard I/O (io_uring planned for future)
//! - Windows: Standard I/O (TransmitFile planned for future)
//!
//! The `AsyncIO` trait abstracts these differences, allowing the transfer engine
//! to use the most efficient method available on each platform.

use async_trait::async_trait;
use std::fs::File;
use std::io;
use std::path::Path;

#[cfg(target_os = "macos")]
pub mod macos;

pub mod fallback;

/// Result type for sendfile operations
#[derive(Debug)]
pub struct SendfileResult {
    /// Number of bytes transferred
    pub bytes_sent: usize,
    /// Whether the transfer completed (false if interrupted)
    pub completed: bool,
}

/// Platform-optimized async I/O trait for high-performance file transfers.
///
/// Implementations provide zero-copy or near-zero-copy operations where possible.
#[async_trait]
pub trait AsyncIO: Send + Sync {
    /// Read from a file at a specific offset into the provided buffer.
    ///
    /// This is similar to `pread()` - it reads without modifying the file's
    /// current position, allowing concurrent reads from different offsets.
    ///
    /// # Arguments
    /// * `file` - The file to read from
    /// * `offset` - Byte offset to start reading from
    /// * `buf` - Buffer to read into
    ///
    /// # Returns
    /// Number of bytes actually read (may be less than buffer size at EOF)
    async fn read_at(&self, file: &File, offset: u64, buf: &mut [u8]) -> io::Result<usize>;

    /// Write to a file at a specific offset from the provided buffer.
    ///
    /// This is similar to `pwrite()` - it writes without modifying the file's
    /// current position, allowing concurrent writes to different offsets.
    ///
    /// # Arguments
    /// * `file` - The file to write to
    /// * `offset` - Byte offset to start writing at
    /// * `buf` - Buffer containing data to write
    ///
    /// # Returns
    /// Number of bytes actually written
    async fn write_at(&self, file: &File, offset: u64, buf: &[u8]) -> io::Result<usize>;

    /// Zero-copy file-to-file descriptor transfer (sendfile).
    ///
    /// On supported platforms, this transfers data directly from the file
    /// to the output descriptor without copying through userspace.
    ///
    /// # Arguments
    /// * `file` - Source file
    /// * `out_fd` - Output file descriptor (socket or file)
    /// * `offset` - Starting offset in source file
    /// * `len` - Number of bytes to transfer
    ///
    /// # Returns
    /// Result containing bytes sent and completion status
    async fn sendfile(
        &self,
        file: &File,
        out_fd: i32,
        offset: u64,
        len: usize,
    ) -> io::Result<SendfileResult>;

    /// Returns the name of this I/O implementation for diagnostics.
    fn name(&self) -> &'static str;

    /// Returns whether this implementation supports true zero-copy sendfile.
    fn supports_zero_copy(&self) -> bool;
}

/// Returns the best available I/O implementation for the current platform.
///
/// On macOS, this returns the `MacOSIO` implementation with sendfile support.
/// On other platforms, this returns the fallback implementation.
pub fn platform_io() -> Box<dyn AsyncIO> {
    #[cfg(target_os = "macos")]
    {
        Box::new(macos::MacOSIO::new())
    }

    #[cfg(not(target_os = "macos"))]
    {
        Box::new(fallback::FallbackIO::new())
    }
}

/// I/O statistics for performance monitoring.
#[derive(Debug, Clone, Default)]
pub struct IoStats {
    /// Total bytes read
    pub bytes_read: u64,
    /// Total bytes written
    pub bytes_written: u64,
    /// Total bytes sent via sendfile
    pub bytes_sendfile: u64,
    /// Number of read operations
    pub read_ops: u64,
    /// Number of write operations
    pub write_ops: u64,
    /// Number of sendfile operations
    pub sendfile_ops: u64,
    /// Number of sendfile fallbacks (when zero-copy wasn't possible)
    pub sendfile_fallbacks: u64,
}

/// Convenience function to read an entire file using platform I/O.
pub async fn read_file(path: &Path) -> io::Result<Vec<u8>> {
    let file = File::open(path)?;
    let metadata = file.metadata()?;
    let size = metadata.len() as usize;

    let mut buf = vec![0u8; size];
    let io = platform_io();

    let mut offset = 0;
    while offset < size {
        let n = io.read_at(&file, offset as u64, &mut buf[offset..]).await?;
        if n == 0 {
            break;
        }
        offset += n;
    }

    buf.truncate(offset);
    Ok(buf)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[tokio::test]
    async fn test_platform_io_name() {
        let io = platform_io();
        let name = io.name();
        assert!(!name.is_empty());

        #[cfg(target_os = "macos")]
        assert_eq!(name, "macOS sendfile");

        #[cfg(not(target_os = "macos"))]
        assert_eq!(name, "Fallback tokio I/O");
    }

    #[tokio::test]
    async fn test_read_at() {
        let mut temp = NamedTempFile::new().unwrap();
        temp.write_all(b"Hello, World!").unwrap();
        temp.flush().unwrap();

        let file = File::open(temp.path()).unwrap();
        let io = platform_io();

        let mut buf = [0u8; 5];
        let n = io.read_at(&file, 0, &mut buf).await.unwrap();
        assert_eq!(n, 5);
        assert_eq!(&buf, b"Hello");

        let n = io.read_at(&file, 7, &mut buf).await.unwrap();
        assert_eq!(n, 5);
        assert_eq!(&buf, b"World");
    }

    #[tokio::test]
    async fn test_write_at() {
        let temp = NamedTempFile::new().unwrap();
        let path = temp.path().to_path_buf();

        // Open for writing
        let file = std::fs::OpenOptions::new()
            .write(true)
            .open(&path)
            .unwrap();

        let io = platform_io();
        let data = b"Hello, World!";
        let n = io.write_at(&file, 0, data).await.unwrap();
        assert_eq!(n, data.len());

        // Verify by reading back
        let contents = std::fs::read(&path).unwrap();
        assert_eq!(&contents, data);
    }

    #[tokio::test]
    async fn test_read_file_helper() {
        let mut temp = NamedTempFile::new().unwrap();
        let content = b"Test file content for read_file helper";
        temp.write_all(content).unwrap();
        temp.flush().unwrap();

        let result = read_file(temp.path()).await.unwrap();
        assert_eq!(result, content);
    }
}
