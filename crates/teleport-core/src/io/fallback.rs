//! Phase 8: Fallback I/O Implementation
//!
//! Standard tokio-based I/O for platforms without optimized syscalls.
//! Uses regular read/write operations with userspace buffers.
//!
//! This implementation is used on:
//! - Linux (until io_uring support is added)
//! - Windows (until TransmitFile support is added)
//! - Any platform where the optimized implementation fails

use super::{AsyncIO, SendfileResult};
use async_trait::async_trait;
use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom, Write};

/// Fallback I/O implementation using standard file operations.
///
/// All operations go through userspace buffers. This is less efficient
/// than zero-copy implementations but works on all platforms.
pub struct FallbackIO {
    /// Chunk size for simulated sendfile (default 64KB)
    sendfile_chunk_size: usize,
}

impl FallbackIO {
    /// Default chunk size for sendfile simulation
    const DEFAULT_SENDFILE_CHUNK: usize = 64 * 1024;

    /// Creates a new fallback I/O instance.
    pub fn new() -> Self {
        Self {
            sendfile_chunk_size: Self::DEFAULT_SENDFILE_CHUNK,
        }
    }

    /// Creates a fallback I/O instance with custom chunk size.
    pub fn with_chunk_size(sendfile_chunk_size: usize) -> Self {
        Self { sendfile_chunk_size }
    }

    /// Synchronous pread implementation using seek + read.
    fn pread_sync(file: &File, offset: u64, buf: &mut [u8]) -> io::Result<usize> {
        // Clone file handle to avoid modifying original position
        let mut file = file.try_clone()?;
        file.seek(SeekFrom::Start(offset))?;
        file.read(buf)
    }

    /// Synchronous pwrite implementation using seek + write.
    fn pwrite_sync(file: &File, offset: u64, buf: &[u8]) -> io::Result<usize> {
        let mut file = file.try_clone()?;
        file.seek(SeekFrom::Start(offset))?;
        file.write(buf)
    }
}

impl Default for FallbackIO {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl AsyncIO for FallbackIO {
    async fn read_at(&self, file: &File, offset: u64, buf: &mut [u8]) -> io::Result<usize> {
        // Clone file to use in blocking task
        let file = file.try_clone()?;
        let buf_len = buf.len();

        // Allocate a buffer in the blocking task and copy out
        let result = tokio::task::spawn_blocking(move || {
            let mut temp_buf = vec![0u8; buf_len];
            let n = Self::pread_sync(&file, offset, &mut temp_buf)?;
            temp_buf.truncate(n);
            Ok::<_, io::Error>(temp_buf)
        })
        .await
        .map_err(|e| io::Error::new(io::ErrorKind::Other, e))??;

        let n = result.len();
        buf[..n].copy_from_slice(&result);
        Ok(n)
    }

    async fn write_at(&self, file: &File, offset: u64, buf: &[u8]) -> io::Result<usize> {
        let file = file.try_clone()?;
        let buf = buf.to_vec();

        tokio::task::spawn_blocking(move || Self::pwrite_sync(&file, offset, &buf))
            .await
            .map_err(|e| io::Error::new(io::ErrorKind::Other, e))?
    }

    async fn sendfile(
        &self,
        file: &File,
        out_fd: i32,
        offset: u64,
        len: usize,
    ) -> io::Result<SendfileResult> {
        // Simulate sendfile by reading into buffer and writing to fd
        let file = file.try_clone()?;
        let chunk_size = self.sendfile_chunk_size;

        tokio::task::spawn_blocking(move || {
            let mut total_sent = 0usize;
            let mut current_offset = offset;
            let mut buf = vec![0u8; chunk_size.min(len)];

            while total_sent < len {
                let to_read = (len - total_sent).min(chunk_size);
                let buf_slice = &mut buf[..to_read];

                // Read from file
                let n_read = Self::pread_sync(&file, current_offset, buf_slice)?;
                if n_read == 0 {
                    break; // EOF
                }

                // Write to output fd
                let n_written = unsafe {
                    libc::write(out_fd, buf_slice.as_ptr() as *const libc::c_void, n_read)
                };

                if n_written < 0 {
                    return Err(io::Error::last_os_error());
                }

                let n_written = n_written as usize;
                total_sent += n_written;
                current_offset += n_written as u64;

                // Partial write means we should stop
                if n_written < n_read {
                    break;
                }
            }

            Ok(SendfileResult {
                bytes_sent: total_sent,
                completed: total_sent >= len,
            })
        })
        .await
        .map_err(|e| io::Error::new(io::ErrorKind::Other, e))?
    }

    fn name(&self) -> &'static str {
        "Fallback tokio I/O"
    }

    fn supports_zero_copy(&self) -> bool {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write as IoWrite;
    use tempfile::NamedTempFile;

    #[tokio::test]
    async fn test_fallback_io_name() {
        let io = FallbackIO::new();
        assert_eq!(io.name(), "Fallback tokio I/O");
        assert!(!io.supports_zero_copy());
    }

    #[tokio::test]
    async fn test_fallback_read_at() {
        let mut temp = NamedTempFile::new().unwrap();
        temp.write_all(b"Hello, Fallback World!").unwrap();
        temp.flush().unwrap();

        let file = File::open(temp.path()).unwrap();
        let io = FallbackIO::new();

        // Read from beginning
        let mut buf = [0u8; 5];
        let n = io.read_at(&file, 0, &mut buf).await.unwrap();
        assert_eq!(n, 5);
        assert_eq!(&buf, b"Hello");

        // Read from middle
        let mut buf = [0u8; 8];
        let n = io.read_at(&file, 7, &mut buf).await.unwrap();
        assert_eq!(n, 8);
        assert_eq!(&buf, b"Fallback");
    }

    #[tokio::test]
    async fn test_fallback_write_at() {
        let temp = NamedTempFile::new().unwrap();
        let path = temp.path().to_path_buf();

        let file = std::fs::OpenOptions::new()
            .write(true)
            .open(&path)
            .unwrap();

        let io = FallbackIO::new();

        // Write at different offsets
        let n = io.write_at(&file, 0, b"Hello").await.unwrap();
        assert_eq!(n, 5);

        let n = io.write_at(&file, 5, b" World").await.unwrap();
        assert_eq!(n, 6);

        // Verify contents
        let contents = std::fs::read(&path).unwrap();
        assert_eq!(&contents, b"Hello World");
    }

    #[tokio::test]
    async fn test_fallback_large_read() {
        let mut temp = NamedTempFile::new().unwrap();

        // Create 1MB of data
        let data: Vec<u8> = (0..1024 * 1024).map(|i| (i % 256) as u8).collect();
        temp.write_all(&data).unwrap();
        temp.flush().unwrap();

        let file = File::open(temp.path()).unwrap();
        let io = FallbackIO::new();

        // Read in chunks
        let mut result = Vec::new();
        let mut offset = 0u64;
        let chunk_size = 64 * 1024;

        while offset < data.len() as u64 {
            let mut buf = vec![0u8; chunk_size];
            let n = io.read_at(&file, offset, &mut buf).await.unwrap();
            if n == 0 {
                break;
            }
            result.extend_from_slice(&buf[..n]);
            offset += n as u64;
        }

        assert_eq!(result.len(), data.len());
        assert_eq!(result, data);
    }

    #[tokio::test]
    async fn test_concurrent_fallback_reads() {
        let mut temp = NamedTempFile::new().unwrap();
        let data = (0..1000u32)
            .flat_map(|i| i.to_le_bytes())
            .collect::<Vec<_>>();
        temp.write_all(&data).unwrap();
        temp.flush().unwrap();

        let path = temp.path().to_path_buf();

        // Spawn multiple concurrent reads
        let mut handles = Vec::new();
        for i in 0..10 {
            let offset = (i * 400) as u64; // 100 u32s apart
            let path = path.clone();

            handles.push(tokio::spawn(async move {
                let file = File::open(&path).unwrap();
                let io = FallbackIO::new();
                let mut buf = [0u8; 4];
                let n = io.read_at(&file, offset, &mut buf).await.unwrap();
                assert_eq!(n, 4);
                u32::from_le_bytes(buf)
            }));
        }

        // Verify all reads completed correctly
        for (i, handle) in handles.into_iter().enumerate() {
            let value = handle.await.unwrap();
            assert_eq!(value, (i * 100) as u32);
        }
    }

    #[tokio::test]
    async fn test_fallback_simulated_sendfile() {
        use std::os::unix::io::AsRawFd;
        use std::os::unix::net::UnixStream;

        let mut temp = NamedTempFile::new().unwrap();
        let data = b"Test data for sendfile simulation";
        temp.write_all(data).unwrap();
        temp.flush().unwrap();

        let file = File::open(temp.path()).unwrap();
        let io = FallbackIO::new();

        // Create a pipe to write to
        let (reader, writer) = UnixStream::pair().unwrap();
        let writer_fd = writer.as_raw_fd();

        // Sendfile to the pipe
        let result = io
            .sendfile(&file, writer_fd, 0, data.len())
            .await
            .unwrap();

        assert_eq!(result.bytes_sent, data.len());
        assert!(result.completed);

        // Read from the other end
        drop(writer); // Close writer so reader gets EOF
        let mut received = Vec::new();
        let mut reader = reader;
        std::io::Read::read_to_end(&mut reader, &mut received).unwrap();

        assert_eq!(received, data);
    }
}
