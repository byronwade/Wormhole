//! Linux-specific I/O implementation.
//!
//! This module provides Linux-optimized I/O using:
//! - sendfile(2) for zero-copy file-to-socket transfers
//! - io_uring for high-performance async I/O (future)
//!
//! Linux sendfile is simpler than macOS:
//! `ssize_t sendfile(int out_fd, int in_fd, off_t *offset, size_t count);`

use super::AsyncIO;
use std::fs::File;
use std::io;
use std::os::unix::io::AsRawFd;
use std::path::Path;

/// Linux I/O implementation using sendfile and other optimized syscalls.
pub struct LinuxIO;

impl LinuxIO {
    /// Create a new Linux I/O handler.
    pub fn new() -> Self {
        Self
    }

    /// Perform a synchronous sendfile operation.
    ///
    /// Linux sendfile signature:
    /// ```c
    /// ssize_t sendfile(int out_fd, int in_fd, off_t *offset, size_t count);
    /// ```
    pub fn sendfile_sync(
        file_fd: i32,
        socket_fd: i32,
        offset: u64,
        len: usize,
    ) -> io::Result<usize> {
        let mut off = offset as i64;

        let result = unsafe {
            libc::sendfile(socket_fd, file_fd, &mut off, len)
        };

        if result < 0 {
            Err(io::Error::last_os_error())
        } else {
            Ok(result as usize)
        }
    }

    /// Read file at offset using pread.
    fn pread_sync(file: &File, offset: u64, buf: &mut [u8]) -> io::Result<usize> {
        let fd = file.as_raw_fd();
        let result = unsafe {
            libc::pread(
                fd,
                buf.as_mut_ptr() as *mut libc::c_void,
                buf.len(),
                offset as i64,
            )
        };

        if result < 0 {
            Err(io::Error::last_os_error())
        } else {
            Ok(result as usize)
        }
    }

    /// Write multiple buffers at offset using pwritev.
    fn pwritev_sync(file: &File, bufs: &[&[u8]], offset: u64) -> io::Result<usize> {
        let fd = file.as_raw_fd();

        let iovecs: Vec<libc::iovec> = bufs
            .iter()
            .map(|buf| libc::iovec {
                iov_base: buf.as_ptr() as *mut libc::c_void,
                iov_len: buf.len(),
            })
            .collect();

        let result = unsafe {
            libc::pwritev(fd, iovecs.as_ptr(), iovecs.len() as i32, offset as i64)
        };

        if result < 0 {
            Err(io::Error::last_os_error())
        } else {
            Ok(result as usize)
        }
    }
}

impl Default for LinuxIO {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl AsyncIO for LinuxIO {
    async fn read_file(&self, path: &Path, offset: u64, buf: &mut [u8]) -> io::Result<usize> {
        let path = path.to_path_buf();
        let buf_len = buf.len();

        let result = tokio::task::spawn_blocking(move || {
            let file = File::open(&path)?;
            let mut local_buf = vec![0u8; buf_len];
            let n = Self::pread_sync(&file, offset, &mut local_buf)?;
            Ok::<_, io::Error>((local_buf, n))
        })
        .await
        .map_err(|e| io::Error::new(io::ErrorKind::Other, e))??;

        buf[..result.1].copy_from_slice(&result.0[..result.1]);
        Ok(result.1)
    }

    async fn sendfile(
        &self,
        file: &File,
        socket_fd: i32,
        offset: u64,
        len: usize,
    ) -> io::Result<usize> {
        let file_fd = file.as_raw_fd();

        tokio::task::spawn_blocking(move || {
            Self::sendfile_sync(file_fd, socket_fd, offset, len)
        })
        .await
        .map_err(|e| io::Error::new(io::ErrorKind::Other, e))?
    }

    async fn writev(&self, file: &File, bufs: &[&[u8]], offset: u64) -> io::Result<usize> {
        let owned_bufs: Vec<Vec<u8>> = bufs.iter().map(|b| b.to_vec()).collect();
        let file_fd = file.as_raw_fd();

        tokio::task::spawn_blocking(move || {
            use std::os::unix::io::FromRawFd;
            let file = unsafe { File::from_raw_fd(file_fd) };

            let refs: Vec<&[u8]> = owned_bufs.iter().map(|v| v.as_slice()).collect();
            let result = Self::pwritev_sync(&file, &refs, offset);

            std::mem::forget(file);

            result
        })
        .await
        .map_err(|e| io::Error::new(io::ErrorKind::Other, e))?
    }

    fn name(&self) -> &'static str {
        "Linux (sendfile)"
    }
}
