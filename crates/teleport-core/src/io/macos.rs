//! Phase 8: macOS-Specific I/O Implementation
//!
//! Uses macOS's `sendfile()` syscall for zero-copy file-to-socket transfers.
//! Falls back to `pread`/`pwrite` for file-to-file operations.
//!
//! # Performance Notes
//! - `sendfile()` on macOS transfers data directly from page cache to socket buffer
//! - No userspace copies required for file-to-socket transfers
//! - Uses `SF_NODISKIO` flag to avoid blocking on disk I/O when possible

use super::{AsyncIO, SendfileResult};
use async_trait::async_trait;
use std::fs::File;
use std::io;
use std::os::unix::io::AsRawFd;

/// macOS SF_NODISKIO flag - don't wait for disk I/O to complete
/// This allows sendfile to return EAGAIN if data isn't in cache
const SF_NODISKIO: i32 = 0x00000001;

/// macOS-optimized I/O implementation with sendfile support.
pub struct MacOSIO {
    /// Whether to use SF_NODISKIO flag (non-blocking disk I/O)
    use_nodiskio: bool,
}

impl MacOSIO {
    /// Creates a new macOS I/O instance with default settings.
    pub fn new() -> Self {
        Self { use_nodiskio: true }
    }

    /// Creates a macOS I/O instance with custom settings.
    ///
    /// # Arguments
    /// * `use_nodiskio` - If true, uses SF_NODISKIO to avoid blocking on disk
    pub fn with_config(use_nodiskio: bool) -> Self {
        Self { use_nodiskio }
    }

    /// Performs synchronous pread operation.
    fn pread_sync(fd: i32, buf: &mut [u8], offset: i64) -> io::Result<usize> {
        let result = unsafe {
            libc::pread(
                fd,
                buf.as_mut_ptr() as *mut libc::c_void,
                buf.len(),
                offset,
            )
        };

        if result < 0 {
            Err(io::Error::last_os_error())
        } else {
            Ok(result as usize)
        }
    }

    /// Performs synchronous pwrite operation.
    fn pwrite_sync(fd: i32, buf: &[u8], offset: i64) -> io::Result<usize> {
        let result = unsafe {
            libc::pwrite(
                fd,
                buf.as_ptr() as *const libc::c_void,
                buf.len(),
                offset,
            )
        };

        if result < 0 {
            Err(io::Error::last_os_error())
        } else {
            Ok(result as usize)
        }
    }

    /// Performs synchronous sendfile operation.
    ///
    /// macOS sendfile signature:
    /// ```c
    /// int sendfile(int fd, int s, off_t offset, off_t *len,
    ///              struct sf_hdtr *hdtr, int flags);
    /// ```
    ///
    /// Note: macOS sendfile is different from Linux - it sends from file descriptor
    /// `fd` to socket `s`, and `len` is both input (bytes to send) and output (bytes sent).
    fn sendfile_sync(
        file_fd: i32,
        socket_fd: i32,
        offset: i64,
        len: usize,
        use_nodiskio: bool,
    ) -> io::Result<SendfileResult> {
        let mut sent: libc::off_t = len as libc::off_t;

        let flags = if use_nodiskio {
            SF_NODISKIO
        } else {
            0
        };

        let result = unsafe {
            libc::sendfile(
                file_fd,
                socket_fd,
                offset,
                &mut sent,
                std::ptr::null_mut(), // No headers/trailers
                flags,
            )
        };

        if result == -1 {
            let err = io::Error::last_os_error();

            // EAGAIN with SF_NODISKIO means data wasn't in cache
            // We can still report partial progress
            if err.raw_os_error() == Some(libc::EAGAIN) && sent > 0 {
                return Ok(SendfileResult {
                    bytes_sent: sent as usize,
                    completed: false,
                });
            }

            // EINTR is retriable
            if err.raw_os_error() == Some(libc::EINTR) && sent > 0 {
                return Ok(SendfileResult {
                    bytes_sent: sent as usize,
                    completed: false,
                });
            }

            return Err(err);
        }

        Ok(SendfileResult {
            bytes_sent: sent as usize,
            completed: sent as usize >= len,
        })
    }
}

impl Default for MacOSIO {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl AsyncIO for MacOSIO {
    async fn read_at(&self, file: &File, offset: u64, buf: &mut [u8]) -> io::Result<usize> {
        let fd = file.as_raw_fd();
        let buf_len = buf.len();
        let offset = offset as i64;

        // Allocate a buffer in the blocking task and copy out
        let result = tokio::task::spawn_blocking(move || {
            let mut temp_buf = vec![0u8; buf_len];
            let n = Self::pread_sync(fd, &mut temp_buf, offset)?;
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
        let fd = file.as_raw_fd();

        // Copy buffer for the blocking task
        let buf = buf.to_vec();
        let offset = offset as i64;

        tokio::task::spawn_blocking(move || Self::pwrite_sync(fd, &buf, offset))
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
        let file_fd = file.as_raw_fd();
        let offset = offset as i64;
        let use_nodiskio = self.use_nodiskio;

        tokio::task::spawn_blocking(move || {
            Self::sendfile_sync(file_fd, out_fd, offset, len, use_nodiskio)
        })
        .await
        .map_err(|e| io::Error::new(io::ErrorKind::Other, e))?
    }

    fn name(&self) -> &'static str {
        "macOS sendfile"
    }

    fn supports_zero_copy(&self) -> bool {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[tokio::test]
    async fn test_macos_io_name() {
        let io = MacOSIO::new();
        assert_eq!(io.name(), "macOS sendfile");
        assert!(io.supports_zero_copy());
    }

    #[tokio::test]
    async fn test_pread() {
        let mut temp = NamedTempFile::new().unwrap();
        temp.write_all(b"Hello, macOS World!").unwrap();
        temp.flush().unwrap();

        let file = File::open(temp.path()).unwrap();
        let io = MacOSIO::new();

        // Read from beginning
        let mut buf = [0u8; 5];
        let n = io.read_at(&file, 0, &mut buf).await.unwrap();
        assert_eq!(n, 5);
        assert_eq!(&buf, b"Hello");

        // Read from middle
        let mut buf = [0u8; 5];
        let n = io.read_at(&file, 7, &mut buf).await.unwrap();
        assert_eq!(n, 5);
        assert_eq!(&buf, b"macOS");

        // Read at end
        let mut buf = [0u8; 10];
        let n = io.read_at(&file, 13, &mut buf).await.unwrap();
        assert_eq!(n, 6);
        assert_eq!(&buf[..6], b"World!");
    }

    #[tokio::test]
    async fn test_pwrite() {
        let temp = NamedTempFile::new().unwrap();
        let path = temp.path().to_path_buf();

        let file = std::fs::OpenOptions::new()
            .write(true)
            .open(&path)
            .unwrap();

        let io = MacOSIO::new();

        // Write at offset 0
        let n = io.write_at(&file, 0, b"Hello").await.unwrap();
        assert_eq!(n, 5);

        // Write at offset 5
        let n = io.write_at(&file, 5, b" World").await.unwrap();
        assert_eq!(n, 6);

        // Verify contents
        let contents = std::fs::read(&path).unwrap();
        assert_eq!(&contents, b"Hello World");
    }

    #[tokio::test]
    async fn test_concurrent_reads() {
        let mut temp = NamedTempFile::new().unwrap();
        let data = (0..1000u32)
            .flat_map(|i| i.to_le_bytes())
            .collect::<Vec<_>>();
        temp.write_all(&data).unwrap();
        temp.flush().unwrap();

        let file = File::open(temp.path()).unwrap();
        let _io = MacOSIO::new();

        // Spawn multiple concurrent reads
        let mut handles = Vec::new();
        for i in 0..10 {
            let offset = (i * 100) as u64;
            let _file_fd = file.as_raw_fd();
            let path = temp.path().to_path_buf();

            handles.push(tokio::spawn(async move {
                let file = File::open(&path).unwrap();
                let io = MacOSIO::new();
                let mut buf = [0u8; 4];
                let n = io.read_at(&file, offset, &mut buf).await.unwrap();
                assert_eq!(n, 4);
                u32::from_le_bytes(buf)
            }));
        }

        // Verify all reads completed correctly
        for (i, handle) in handles.into_iter().enumerate() {
            let value = handle.await.unwrap();
            assert_eq!(value, (i * 25) as u32); // 100 bytes = 25 u32s
        }
    }

    // Note: sendfile test requires a socket, which is more complex to set up
    // Integration tests would test the full sendfile path
}
