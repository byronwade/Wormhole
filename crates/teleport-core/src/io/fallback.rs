//! Fallback I/O implementation using standard Rust/tokio APIs.

use super::AsyncIO;
use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::Path;

/// Fallback I/O implementation using standard Rust APIs.
pub struct FallbackIO;

impl FallbackIO {
    pub fn new() -> Self {
        Self
    }
}

impl Default for FallbackIO {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl AsyncIO for FallbackIO {
    async fn read_file(&self, path: &Path, offset: u64, buf: &mut [u8]) -> io::Result<usize> {
        let path = path.to_path_buf();
        let buf_len = buf.len();

        let result = tokio::task::spawn_blocking(move || {
            let mut file = File::open(&path)?;
            file.seek(SeekFrom::Start(offset))?;
            let mut local_buf = vec![0u8; buf_len];
            let n = file.read(&mut local_buf)?;
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
        _socket_fd: i32,
        offset: u64,
        len: usize,
    ) -> io::Result<usize> {
        let mut file = file.try_clone()?;

        tokio::task::spawn_blocking(move || {
            file.seek(SeekFrom::Start(offset))?;
            let mut buf = vec![0u8; len.min(1024 * 1024)];
            let n = file.read(&mut buf)?;
            Ok::<_, io::Error>(n)
        })
        .await
        .map_err(|e| io::Error::new(io::ErrorKind::Other, e))?
    }

    async fn writev(&self, file: &File, bufs: &[&[u8]], offset: u64) -> io::Result<usize> {
        let owned_bufs: Vec<Vec<u8>> = bufs.iter().map(|b| b.to_vec()).collect();
        let mut file = file.try_clone()?;

        tokio::task::spawn_blocking(move || {
            file.seek(SeekFrom::Start(offset))?;
            let mut total = 0;
            for buf in &owned_bufs {
                total += file.write(buf)?;
            }
            Ok::<_, io::Error>(total)
        })
        .await
        .map_err(|e| io::Error::new(io::ErrorKind::Other, e))?
    }

    fn name(&self) -> &'static str {
        "Fallback (standard I/O)"
    }
}
