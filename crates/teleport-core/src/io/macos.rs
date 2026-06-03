//! macOS-specific I/O implementation using sendfile.

use super::AsyncIO;
use std::fs::File;
use std::io;
use std::os::unix::io::AsRawFd;
use std::path::Path;

/// macOS I/O implementation using sendfile and other optimized syscalls.
pub struct MacOSIO;

impl MacOSIO {
    pub fn new() -> Self {
        Self
    }

    /// Perform a synchronous sendfile operation.
    pub fn sendfile_sync(
        file_fd: i32,
        socket_fd: i32,
        offset: i64,
        len: usize,
    ) -> io::Result<usize> {
        let mut sent: i64 = len as i64;
        const SF_NODISKIO: i32 = 1;

        let result = unsafe {
            libc::sendfile(
                file_fd,
                socket_fd,
                offset,
                &mut sent,
                std::ptr::null_mut(),
                SF_NODISKIO,
            )
        };

        if result == -1 {
            let err = io::Error::last_os_error();
            if err.raw_os_error() == Some(libc::EAGAIN) && sent > 0 {
                return Ok(sent as usize);
            }
            Err(err)
        } else {
            Ok(sent as usize)
        }
    }

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

    fn pwritev_sync(file: &File, bufs: &[&[u8]], offset: u64) -> io::Result<usize> {
        let fd = file.as_raw_fd();

        let iovecs: Vec<libc::iovec> = bufs
            .iter()
            .map(|buf| libc::iovec {
                iov_base: buf.as_ptr() as *mut libc::c_void,
                iov_len: buf.len(),
            })
            .collect();

        let result =
            unsafe { libc::pwritev(fd, iovecs.as_ptr(), iovecs.len() as i32, offset as i64) };

        if result < 0 {
            Err(io::Error::last_os_error())
        } else {
            Ok(result as usize)
        }
    }
}

impl Default for MacOSIO {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl AsyncIO for MacOSIO {
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
        .map_err(io::Error::other)??;

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
            Self::sendfile_sync(file_fd, socket_fd, offset as i64, len)
        })
        .await
        .map_err(io::Error::other)?
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
        .map_err(io::Error::other)?
    }

    fn name(&self) -> &'static str {
        "macOS (sendfile)"
    }
}
