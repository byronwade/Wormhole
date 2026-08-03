//! Content-addressed cache facade over `teleport-blobs`.
//!
//! Complements the legacy `ChunkId`-keyed disk cache with BLAKE3-keyed blobs
//! for dedup and resume.

use std::collections::HashSet;
use std::sync::{Arc, OnceLock};

use parking_lot::RwLock;
use teleport_blobs::{BlobError, BlobStore};
use teleport_core::ContentHash;
use tracing::debug;

/// Hashes explicitly published by a verified share-path seed (read/manifest).
///
/// `BulkChunkRequest` must only serve hashes in this set so clients cannot
/// fish arbitrary blobs out of the process-global content store.
fn published_hashes() -> &'static RwLock<HashSet<[u8; 32]>> {
    static PUBLISHED: OnceLock<RwLock<HashSet<[u8; 32]>>> = OnceLock::new();
    PUBLISHED.get_or_init(|| RwLock::new(HashSet::new()))
}

/// Mark a content hash as authorized for BulkChunk serving.
pub fn grant_published_hash(hash: &ContentHash) {
    published_hashes().write().insert(*hash.as_bytes());
}

/// Returns true when `hash` was published via a verified seed path.
pub fn is_published_hash(hash: &ContentHash) -> bool {
    published_hashes().read().contains(hash.as_bytes())
}

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
        grant_published_hash(&hash);
        debug!(%hash, size = data.len(), "content store put");
        Ok(hash)
    }

    pub fn put_verified(&self, hash: &ContentHash, data: &[u8]) -> Result<(), BlobError> {
        self.inner.put_verified(hash, data)?;
        grant_published_hash(hash);
        Ok(())
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
        assert!(is_published_hash(&h));
    }

    #[test]
    fn grant_published_hash_is_idempotent() {
        let unique = ContentHash::compute(b"grant-api-smoke-test-blob");
        grant_published_hash(&unique);
        assert!(is_published_hash(&unique));
        grant_published_hash(&unique);
        assert!(is_published_hash(&unique));
    }
}
