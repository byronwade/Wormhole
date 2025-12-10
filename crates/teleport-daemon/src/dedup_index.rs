//! Phase 8: Content-Addressed Deduplication Index
//!
//! Provides fast lookup of content chunks by their BLAKE3 hash.
//! Used to skip transfer of chunks that already exist on the destination.
//!
//! # Design
//! - In-memory hash table for fast lookups
//! - LRU eviction to bound memory usage
//! - Optional persistence to disk for cache warmth across restarts
//!
//! # Usage
//! ```ignore
//! let index = DedupIndex::new(100_000); // Max 100k entries
//!
//! // Register a chunk location
//! index.insert(hash, "/path/to/file", offset);
//!
//! // Check if we have a chunk
//! if let Some((path, offset)) = index.lookup(&hash) {
//!     // Read from local cache instead of network
//! }
//! ```

use dashmap::DashMap;
use parking_lot::RwLock;
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use teleport_core::types::ContentHash;

/// Location of a content chunk on disk
#[derive(Debug, Clone)]
pub struct ChunkLocation {
    /// Path to the file containing this chunk
    pub path: PathBuf,
    /// Byte offset within the file
    pub offset: u64,
    /// Size of the chunk in bytes
    pub size: u32,
}

/// Content-addressed deduplication index.
///
/// Maps content hashes to their locations on disk for fast dedup lookups.
pub struct DedupIndex {
    /// Hash → Location mapping (concurrent access)
    index: DashMap<ContentHash, ChunkLocation>,

    /// LRU order tracking (protected by lock)
    lru_order: RwLock<VecDeque<ContentHash>>,

    /// Maximum number of entries before eviction
    max_entries: usize,

    /// Statistics
    stats: DedupStats,
}

/// Statistics for dedup index operations
#[derive(Debug, Default)]
pub struct DedupStats {
    /// Number of successful lookups (cache hits)
    pub hits: AtomicU64,
    /// Number of failed lookups (cache misses)
    pub misses: AtomicU64,
    /// Number of insertions
    pub insertions: AtomicU64,
    /// Number of evictions
    pub evictions: AtomicU64,
    /// Bytes saved by dedup (not transferred)
    pub bytes_saved: AtomicU64,
}

impl DedupIndex {
    /// Create a new dedup index with the specified maximum entry count.
    ///
    /// # Arguments
    /// * `max_entries` - Maximum entries before LRU eviction kicks in
    pub fn new(max_entries: usize) -> Self {
        Self {
            index: DashMap::with_capacity(max_entries.min(10_000)),
            lru_order: RwLock::new(VecDeque::with_capacity(max_entries.min(10_000))),
            max_entries,
            stats: DedupStats::default(),
        }
    }

    /// Look up a chunk by its content hash.
    ///
    /// Returns the chunk location if found, updating LRU order.
    pub fn lookup(&self, hash: &ContentHash) -> Option<ChunkLocation> {
        if let Some(entry) = self.index.get(hash) {
            self.stats.hits.fetch_add(1, Ordering::Relaxed);

            // Update LRU order (move to back = most recently used)
            self.touch_lru(hash);

            Some(entry.clone())
        } else {
            self.stats.misses.fetch_add(1, Ordering::Relaxed);
            None
        }
    }

    /// Check if a hash exists without updating LRU order.
    ///
    /// Useful for batch existence checks.
    pub fn contains(&self, hash: &ContentHash) -> bool {
        self.index.contains_key(hash)
    }

    /// Insert a chunk location into the index.
    ///
    /// If the index is at capacity, evicts the least recently used entry.
    pub fn insert(&self, hash: ContentHash, path: PathBuf, offset: u64, size: u32) {
        // Check if we need to evict
        if self.index.len() >= self.max_entries {
            self.evict_lru();
        }

        let location = ChunkLocation { path, offset, size };
        self.index.insert(hash, location);

        // Add to LRU tracking
        {
            let mut lru = self.lru_order.write();
            lru.push_back(hash);
        }

        self.stats.insertions.fetch_add(1, Ordering::Relaxed);
    }

    /// Record bytes saved by deduplication.
    pub fn record_bytes_saved(&self, bytes: u64) {
        self.stats.bytes_saved.fetch_add(bytes, Ordering::Relaxed);
    }

    /// Get current index size.
    pub fn len(&self) -> usize {
        self.index.len()
    }

    /// Check if index is empty.
    pub fn is_empty(&self) -> bool {
        self.index.is_empty()
    }

    /// Clear all entries from the index.
    pub fn clear(&self) {
        self.index.clear();
        let mut lru = self.lru_order.write();
        lru.clear();
    }

    /// Get statistics snapshot.
    pub fn stats(&self) -> DedupStatsSnapshot {
        DedupStatsSnapshot {
            hits: self.stats.hits.load(Ordering::Relaxed),
            misses: self.stats.misses.load(Ordering::Relaxed),
            insertions: self.stats.insertions.load(Ordering::Relaxed),
            evictions: self.stats.evictions.load(Ordering::Relaxed),
            bytes_saved: self.stats.bytes_saved.load(Ordering::Relaxed),
            current_entries: self.index.len(),
            max_entries: self.max_entries,
        }
    }

    /// Batch check for existing hashes.
    ///
    /// Returns a vector of hashes that are NOT in the index (need transfer).
    pub fn find_missing(&self, hashes: &[ContentHash]) -> Vec<ContentHash> {
        hashes
            .iter()
            .filter(|h| !self.index.contains_key(h))
            .copied()
            .collect()
    }

    /// Move hash to back of LRU queue (most recently used)
    fn touch_lru(&self, hash: &ContentHash) {
        let mut lru = self.lru_order.write();

        // Remove from current position (O(n) but happens infrequently)
        if let Some(pos) = lru.iter().position(|h| h == hash) {
            lru.remove(pos);
        }

        // Add to back (most recently used)
        lru.push_back(*hash);
    }

    /// Evict least recently used entry
    fn evict_lru(&self) {
        let hash_to_evict = {
            let mut lru = self.lru_order.write();
            lru.pop_front()
        };

        if let Some(hash) = hash_to_evict {
            self.index.remove(&hash);
            self.stats.evictions.fetch_add(1, Ordering::Relaxed);
        }
    }
}

impl Default for DedupIndex {
    fn default() -> Self {
        // Default to 100k entries (~3.2MB for hashes alone)
        Self::new(100_000)
    }
}

/// Snapshot of dedup statistics (non-atomic, for reporting)
#[derive(Debug, Clone)]
pub struct DedupStatsSnapshot {
    pub hits: u64,
    pub misses: u64,
    pub insertions: u64,
    pub evictions: u64,
    pub bytes_saved: u64,
    pub current_entries: usize,
    pub max_entries: usize,
}

impl DedupStatsSnapshot {
    /// Calculate hit rate as a percentage
    pub fn hit_rate(&self) -> f64 {
        let total = self.hits + self.misses;
        if total == 0 {
            0.0
        } else {
            (self.hits as f64 / total as f64) * 100.0
        }
    }

    /// Format bytes saved as human-readable string
    pub fn bytes_saved_human(&self) -> String {
        const KB: u64 = 1024;
        const MB: u64 = KB * 1024;
        const GB: u64 = MB * 1024;

        if self.bytes_saved >= GB {
            format!("{:.2} GB", self.bytes_saved as f64 / GB as f64)
        } else if self.bytes_saved >= MB {
            format!("{:.2} MB", self.bytes_saved as f64 / MB as f64)
        } else if self.bytes_saved >= KB {
            format!("{:.2} KB", self.bytes_saved as f64 / KB as f64)
        } else {
            format!("{} bytes", self.bytes_saved)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_hash(seed: u8) -> ContentHash {
        let data = vec![seed; 64];
        ContentHash::compute(&data)
    }

    #[test]
    fn test_basic_insert_lookup() {
        let index = DedupIndex::new(100);
        let hash = make_hash(1);

        // Insert
        index.insert(hash, PathBuf::from("/test/file.dat"), 1024, 4096);

        // Lookup
        let location = index.lookup(&hash).expect("should find hash");
        assert_eq!(location.path, PathBuf::from("/test/file.dat"));
        assert_eq!(location.offset, 1024);
        assert_eq!(location.size, 4096);
    }

    #[test]
    fn test_miss() {
        let index = DedupIndex::new(100);
        let hash = make_hash(1);

        assert!(index.lookup(&hash).is_none());

        let stats = index.stats();
        assert_eq!(stats.misses, 1);
        assert_eq!(stats.hits, 0);
    }

    #[test]
    fn test_lru_eviction() {
        let index = DedupIndex::new(3);

        // Insert 3 entries (at capacity)
        let hash1 = make_hash(1);
        let hash2 = make_hash(2);
        let hash3 = make_hash(3);

        index.insert(hash1, PathBuf::from("/1"), 0, 100);
        index.insert(hash2, PathBuf::from("/2"), 0, 100);
        index.insert(hash3, PathBuf::from("/3"), 0, 100);

        assert_eq!(index.len(), 3);

        // Access hash1 to make it recently used
        let _ = index.lookup(&hash1);

        // Insert 4th entry, should evict hash2 (LRU)
        let hash4 = make_hash(4);
        index.insert(hash4, PathBuf::from("/4"), 0, 100);

        assert_eq!(index.len(), 3);
        assert!(index.contains(&hash1)); // Recently accessed
        assert!(!index.contains(&hash2)); // Should be evicted (LRU)
        assert!(index.contains(&hash3));
        assert!(index.contains(&hash4));
    }

    #[test]
    fn test_find_missing() {
        let index = DedupIndex::new(100);

        let hash1 = make_hash(1);
        let hash2 = make_hash(2);
        let hash3 = make_hash(3);

        index.insert(hash1, PathBuf::from("/1"), 0, 100);
        index.insert(hash3, PathBuf::from("/3"), 0, 100);

        let missing = index.find_missing(&[hash1, hash2, hash3]);
        assert_eq!(missing.len(), 1);
        assert_eq!(missing[0], hash2);
    }

    #[test]
    fn test_stats() {
        let index = DedupIndex::new(100);
        let hash = make_hash(1);

        // Miss
        let _ = index.lookup(&hash);

        // Insert
        index.insert(hash, PathBuf::from("/test"), 0, 100);

        // Hit
        let _ = index.lookup(&hash);
        let _ = index.lookup(&hash);

        let stats = index.stats();
        assert_eq!(stats.hits, 2);
        assert_eq!(stats.misses, 1);
        assert_eq!(stats.insertions, 1);
        assert!((stats.hit_rate() - 66.67).abs() < 0.1);
    }

    #[test]
    fn test_bytes_saved_human() {
        let stats = DedupStatsSnapshot {
            hits: 0,
            misses: 0,
            insertions: 0,
            evictions: 0,
            bytes_saved: 1_500_000_000,
            current_entries: 0,
            max_entries: 0,
        };

        assert!(stats.bytes_saved_human().contains("GB"));

        let stats2 = DedupStatsSnapshot {
            bytes_saved: 1_500_000,
            ..stats.clone()
        };
        assert!(stats2.bytes_saved_human().contains("MB"));

        let stats3 = DedupStatsSnapshot {
            bytes_saved: 1_500,
            ..stats
        };
        assert!(stats3.bytes_saved_human().contains("KB"));
    }

    #[test]
    fn test_clear() {
        let index = DedupIndex::new(100);
        let hash = make_hash(1);

        index.insert(hash, PathBuf::from("/test"), 0, 100);
        assert_eq!(index.len(), 1);

        index.clear();
        assert!(index.is_empty());
        assert!(!index.contains(&hash));
    }

    #[test]
    fn test_concurrent_access() {
        use std::sync::Arc;
        use std::thread;

        let index = Arc::new(DedupIndex::new(1000));
        let mut handles = vec![];

        // Spawn multiple writer threads
        for i in 0..4 {
            let idx = Arc::clone(&index);
            handles.push(thread::spawn(move || {
                for j in 0..100 {
                    let hash = make_hash((i * 100 + j) as u8);
                    idx.insert(hash, PathBuf::from(format!("/file_{}", i)), j as u64, 100);
                }
            }));
        }

        // Spawn multiple reader threads
        for i in 0..4 {
            let idx = Arc::clone(&index);
            handles.push(thread::spawn(move || {
                for j in 0..100 {
                    let hash = make_hash((i * 100 + j) as u8);
                    let _ = idx.lookup(&hash);
                }
            }));
        }

        for handle in handles {
            handle.join().expect("thread panicked");
        }

        // Verify some entries exist
        assert!(index.len() > 0);
    }
}
