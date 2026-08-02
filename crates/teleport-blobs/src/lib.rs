//! Content-addressed blob store for Wormhole.
//!
//! Chunks are keyed by [`ContentHash`] (BLAKE3). This enables:
//! - Deduplication across files/peers
//! - Resume after reboot without re-fetching known hashes
//! - Future swap-in of iroh-blobs verified streaming

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use parking_lot::RwLock;
use teleport_core::{ContentHash, CHUNK_SIZE};
use thiserror::Error;
use tracing::{debug, trace};

#[derive(Error, Debug)]
pub enum BlobError {
    #[error("io: {0}")]
    Io(String),
    #[error("checksum mismatch")]
    ChecksumMismatch,
    #[error("not found: {0}")]
    NotFound(String),
    #[error("invalid path")]
    InvalidPath,
}

/// On-disk layout:
/// ```text
/// <root>/ab/cd/<full-hex>
/// ```
pub struct BlobStore {
    root: PathBuf,
    /// Approximate total bytes (best-effort).
    total_bytes: AtomicU64,
    /// In-memory bloom of known hashes (hex) for fast negative lookups.
    known: RwLock<std::collections::HashSet<[u8; 32]>>,
}

impl BlobStore {
    /// Open or create a blob store under `root`.
    pub fn open(root: impl AsRef<Path>) -> Result<Self, BlobError> {
        let root = root.as_ref().to_path_buf();
        fs::create_dir_all(&root).map_err(|e| BlobError::Io(e.to_string()))?;
        let store = Self {
            root,
            total_bytes: AtomicU64::new(0),
            known: RwLock::new(std::collections::HashSet::new()),
        };
        store.scan()?;
        Ok(store)
    }

    /// Default cache location: platform cache dir `/blobs`.
    pub fn open_default() -> Result<Self, BlobError> {
        let dirs =
            directories::ProjectDirs::from("", "", "wormhole").ok_or(BlobError::InvalidPath)?;
        Self::open(dirs.cache_dir().join("blobs"))
    }

    fn path_for(&self, hash: &ContentHash) -> PathBuf {
        let hex = hash.to_hex();
        self.root.join(&hex[..2]).join(&hex[2..4]).join(&hex)
    }

    fn scan(&self) -> Result<(), BlobError> {
        let mut total = 0u64;
        let mut known = std::collections::HashSet::new();
        if !self.root.exists() {
            return Ok(());
        }
        for l1 in fs::read_dir(&self.root).map_err(|e| BlobError::Io(e.to_string()))? {
            let l1 = l1.map_err(|e| BlobError::Io(e.to_string()))?;
            if !l1.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                continue;
            }
            for l2 in fs::read_dir(l1.path()).map_err(|e| BlobError::Io(e.to_string()))? {
                let l2 = l2.map_err(|e| BlobError::Io(e.to_string()))?;
                if !l2.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    continue;
                }
                for entry in fs::read_dir(l2.path()).map_err(|e| BlobError::Io(e.to_string()))? {
                    let entry = entry.map_err(|e| BlobError::Io(e.to_string()))?;
                    if let Some(hash) = ContentHash::from_hex(&entry.file_name().to_string_lossy())
                    {
                        known.insert(hash.0);
                        if let Ok(meta) = entry.metadata() {
                            total += meta.len();
                        }
                    }
                }
            }
        }
        *self.known.write() = known;
        self.total_bytes.store(total, Ordering::Relaxed);
        debug!(
            entries = self.known.read().len(),
            total, "blob store scanned"
        );
        Ok(())
    }

    pub fn contains(&self, hash: &ContentHash) -> bool {
        self.known.read().contains(&hash.0)
    }

    pub fn total_bytes(&self) -> u64 {
        self.total_bytes.load(Ordering::Relaxed)
    }

    pub fn len(&self) -> usize {
        self.known.read().len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Store bytes; returns content hash. Idempotent if already present.
    pub fn put(&self, data: &[u8]) -> Result<ContentHash, BlobError> {
        let hash = ContentHash::compute(data);
        if self.contains(&hash) {
            return Ok(hash);
        }
        let path = self.path_for(&hash);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| BlobError::Io(e.to_string()))?;
        }
        let tmp = path.with_extension("tmp");
        {
            let mut f = File::create(&tmp).map_err(|e| BlobError::Io(e.to_string()))?;
            f.write_all(data)
                .map_err(|e| BlobError::Io(e.to_string()))?;
            f.sync_all().map_err(|e| BlobError::Io(e.to_string()))?;
        }
        fs::rename(&tmp, &path).map_err(|e| BlobError::Io(e.to_string()))?;
        self.known.write().insert(hash.0);
        self.total_bytes
            .fetch_add(data.len() as u64, Ordering::Relaxed);
        trace!(hash = %hash, size = data.len(), "blob stored");
        Ok(hash)
    }

    /// Store with expected hash (verify integrity).
    pub fn put_verified(&self, expected: &ContentHash, data: &[u8]) -> Result<(), BlobError> {
        let actual = ContentHash::compute(data);
        if &actual != expected {
            return Err(BlobError::ChecksumMismatch);
        }
        self.put(data)?;
        Ok(())
    }

    /// Read blob by hash.
    pub fn get(&self, hash: &ContentHash) -> Result<Vec<u8>, BlobError> {
        let path = self.path_for(hash);
        let mut f = File::open(&path).map_err(|_| BlobError::NotFound(hash.to_hex()))?;
        let mut buf = Vec::new();
        f.read_to_end(&mut buf)
            .map_err(|e| BlobError::Io(e.to_string()))?;
        let actual = ContentHash::compute(&buf);
        if &actual != hash {
            return Err(BlobError::ChecksumMismatch);
        }
        Ok(buf)
    }

    /// Delete a blob if present.
    pub fn remove(&self, hash: &ContentHash) -> Result<(), BlobError> {
        let path = self.path_for(hash);
        if path.exists() {
            let len = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            fs::remove_file(&path).map_err(|e| BlobError::Io(e.to_string()))?;
            self.known.write().remove(&hash.0);
            self.total_bytes.fetch_sub(len, Ordering::Relaxed);
        }
        Ok(())
    }

    /// Which of `hashes` are missing locally.
    pub fn missing(&self, hashes: &[ContentHash]) -> Vec<ContentHash> {
        hashes
            .iter()
            .filter(|h| !self.contains(h))
            .cloned()
            .collect()
    }

    /// Split data into CHUNK_SIZE pieces and store each; returns hashes in order.
    pub fn put_chunked(&self, data: &[u8]) -> Result<Vec<ContentHash>, BlobError> {
        let mut hashes = Vec::new();
        for chunk in data.chunks(CHUNK_SIZE) {
            hashes.push(self.put(chunk)?);
        }
        Ok(hashes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn put_get_roundtrip() {
        let dir = TempDir::new().unwrap();
        let store = BlobStore::open(dir.path()).unwrap();
        let data = b"hello wormhole blobs";
        let hash = store.put(data).unwrap();
        assert!(store.contains(&hash));
        assert_eq!(store.get(&hash).unwrap(), data);
    }

    #[test]
    fn dedup() {
        let dir = TempDir::new().unwrap();
        let store = BlobStore::open(dir.path()).unwrap();
        let h1 = store.put(b"same").unwrap();
        let h2 = store.put(b"same").unwrap();
        assert_eq!(h1, h2);
        assert_eq!(store.len(), 1);
    }

    #[test]
    fn verified_mismatch() {
        let dir = TempDir::new().unwrap();
        let store = BlobStore::open(dir.path()).unwrap();
        let expected = ContentHash::compute(b"a");
        assert!(matches!(
            store.put_verified(&expected, b"b"),
            Err(BlobError::ChecksumMismatch)
        ));
    }

    #[test]
    fn chunked_and_missing() {
        let dir = TempDir::new().unwrap();
        let store = BlobStore::open(dir.path()).unwrap();
        let data = vec![7u8; CHUNK_SIZE + 100];
        let hashes = store.put_chunked(&data).unwrap();
        assert_eq!(hashes.len(), 2);
        assert!(store.missing(&hashes).is_empty());
        let other = ContentHash::compute(b"nope");
        assert_eq!(store.missing(&[other]), vec![other]);
    }

    #[test]
    fn persists_across_open() {
        let dir = TempDir::new().unwrap();
        let hash = {
            let store = BlobStore::open(dir.path()).unwrap();
            store.put(b"persist-me").unwrap()
        };
        let store2 = BlobStore::open(dir.path()).unwrap();
        assert!(store2.contains(&hash));
        assert_eq!(store2.get(&hash).unwrap(), b"persist-me");
    }
}
