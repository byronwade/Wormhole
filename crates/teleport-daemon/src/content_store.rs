//! Content-addressed cache facade over `teleport-blobs`.
//!
//! Complements the legacy `ChunkId`-keyed disk cache with BLAKE3-keyed blobs
//! for dedup and resume.

use std::sync::Arc;

use teleport_blobs::{BlobError, BlobStore};
use teleport_core::ContentHash;
use tracing::debug;

/// Shared content-addressed store for the daemon.
#[derive(Clone)]
pub struct ContentStore {
    inner: Arc<BlobStore>,
}

impl ContentStore {
    pub fn open_default() -> Result<Self, BlobError> {
        Ok(Self {
            inner: Arc::new(BlobStore::open_default()?),
        })
    }

    pub fn open(path: impl AsRef<std::path::Path>) -> Result<Self, BlobError> {
        Ok(Self {
            inner: Arc::new(BlobStore::open(path)?),
        })
    }

    pub fn put(&self, data: &[u8]) -> Result<ContentHash, BlobError> {
        let hash = self.inner.put(data)?;
        debug!(%hash, size = data.len(), "content store put");
        Ok(hash)
    }

    pub fn put_verified(&self, hash: &ContentHash, data: &[u8]) -> Result<(), BlobError> {
        self.inner.put_verified(hash, data)
    }

    pub fn get(&self, hash: &ContentHash) -> Result<Vec<u8>, BlobError> {
        self.inner.get(hash)
    }

    pub fn contains(&self, hash: &ContentHash) -> bool {
        self.inner.contains(hash)
    }

    pub fn missing(&self, hashes: &[ContentHash]) -> Vec<ContentHash> {
        self.inner.missing(hashes)
    }

    pub fn stats(&self) -> (usize, u64) {
        (self.inner.len(), self.inner.total_bytes())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn content_store_roundtrip() {
        let dir = TempDir::new().unwrap();
        let store = ContentStore::open(dir.path()).unwrap();
        let h = store.put(b"daemon-blob").unwrap();
        assert!(store.contains(&h));
        assert_eq!(store.get(&h).unwrap(), b"daemon-blob");
    }
}
