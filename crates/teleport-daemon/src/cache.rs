//! Two-tier caching system
//!
//! L1: In-memory LRU cache for hot data (fast, limited ~500MB)
//! L2: Disk cache for persistent storage (slower, larger ~10GB)
//!
//! Phase 4 adds HybridChunkCache that combines both tiers.

use std::collections::HashMap;
use std::num::NonZeroUsize;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use lru::LruCache;
use parking_lot::RwLock;
use tracing::{debug, trace, warn};

use teleport_core::{ChunkId, DirEntry, FileAttr, Inode, CHUNK_SIZE};

use crate::disk_cache::DiskCache;

/// Maximum concurrent disk write threads
const MAX_DISK_WRITE_THREADS: usize = 4;

/// Default chunk cache size: ~4000 chunks = ~500MB
pub const DEFAULT_CHUNK_CACHE_ENTRIES: usize = 4000;

/// Default chunk cache TTL (5 minutes)
pub const DEFAULT_CHUNK_TTL_SECS: u64 = 300;

/// Cache entry with TTL
#[derive(Clone)]
struct CacheEntry<T> {
    data: T,
    expires_at: Instant,
}

impl<T> CacheEntry<T> {
    fn new(data: T, ttl: Duration) -> Self {
        Self {
            data,
            expires_at: Instant::now() + ttl,
        }
    }

    fn is_expired(&self) -> bool {
        Instant::now() > self.expires_at
    }
}

/// Attribute cache (inode → FileAttr)
pub struct AttrCache {
    entries: RwLock<HashMap<Inode, CacheEntry<FileAttr>>>,
    ttl: Duration,
    max_entries: usize,
}

impl AttrCache {
    pub fn new(ttl: Duration, max_entries: usize) -> Self {
        Self {
            entries: RwLock::new(HashMap::new()),
            ttl,
            max_entries,
        }
    }

    pub fn get(&self, inode: Inode) -> Option<FileAttr> {
        let entries = self.entries.read();
        entries.get(&inode).and_then(|entry| {
            if entry.is_expired() {
                None
            } else {
                Some(entry.data.clone())
            }
        })
    }

    pub fn insert(&self, inode: Inode, attr: FileAttr) {
        let mut entries = self.entries.write();

        // Evict expired entries if at capacity
        if entries.len() >= self.max_entries {
            entries.retain(|_, v| !v.is_expired());
        }

        // Still at capacity? Remove oldest
        if entries.len() >= self.max_entries {
            if let Some(key) = entries.keys().next().copied() {
                entries.remove(&key);
            }
        }

        entries.insert(inode, CacheEntry::new(attr, self.ttl));
    }

    pub fn invalidate(&self, inode: Inode) {
        self.entries.write().remove(&inode);
    }

    pub fn invalidate_all(&self) {
        self.entries.write().clear();
    }
}

/// Directory entry cache (parent inode → entries)
pub struct DirCache {
    entries: RwLock<HashMap<Inode, CacheEntry<Vec<DirEntry>>>>,
    ttl: Duration,
    max_entries: usize,
}

impl DirCache {
    pub fn new(ttl: Duration, max_entries: usize) -> Self {
        Self {
            entries: RwLock::new(HashMap::new()),
            ttl,
            max_entries,
        }
    }

    pub fn get(&self, parent: Inode) -> Option<Vec<DirEntry>> {
        let entries = self.entries.read();
        entries.get(&parent).and_then(|entry| {
            if entry.is_expired() {
                None
            } else {
                Some(entry.data.clone())
            }
        })
    }

    pub fn insert(&self, parent: Inode, dir_entries: Vec<DirEntry>) {
        let mut entries = self.entries.write();

        if entries.len() >= self.max_entries {
            entries.retain(|_, v| !v.is_expired());
        }

        if entries.len() >= self.max_entries {
            if let Some(key) = entries.keys().next().copied() {
                entries.remove(&key);
            }
        }

        entries.insert(parent, CacheEntry::new(dir_entries, self.ttl));
    }

    pub fn invalidate(&self, parent: Inode) {
        self.entries.write().remove(&parent);
    }

    pub fn invalidate_all(&self) {
        self.entries.write().clear();
    }
}

/// LRU Chunk data cache (L1 - in memory)
///
/// Uses proper LRU eviction to keep hot chunks in memory.
/// Optimized for streaming workloads.
pub struct ChunkCache {
    /// LRU cache: ChunkId → Arc<Vec<u8>>
    cache: RwLock<LruCache<ChunkId, Arc<Vec<u8>>>>,
    /// Current size in bytes
    current_bytes: RwLock<usize>,
    /// Maximum size in bytes
    max_bytes: usize,
}

impl ChunkCache {
    /// Create a new chunk cache with specified capacity
    pub fn new(_ttl: Duration, max_bytes: usize) -> Self {
        // Calculate max entries based on max bytes and chunk size
        let max_entries = max_bytes / CHUNK_SIZE;
        let capacity = NonZeroUsize::new(max_entries.max(1)).unwrap();

        Self {
            cache: RwLock::new(LruCache::new(capacity)),
            current_bytes: RwLock::new(0),
            max_bytes,
        }
    }

    /// Create with a specific entry count
    pub fn with_capacity(max_entries: usize) -> Self {
        let capacity = NonZeroUsize::new(max_entries.max(1)).unwrap();
        Self {
            cache: RwLock::new(LruCache::new(capacity)),
            current_bytes: RwLock::new(0),
            max_bytes: max_entries * CHUNK_SIZE,
        }
    }

    /// Get a chunk from cache (promotes to front of LRU)
    pub fn get(&self, chunk_id: &ChunkId) -> Option<Arc<Vec<u8>>> {
        self.cache.write().get(chunk_id).cloned()
    }

    /// Peek at a chunk without affecting LRU order
    pub fn peek(&self, chunk_id: &ChunkId) -> Option<Arc<Vec<u8>>> {
        self.cache.read().peek(chunk_id).cloned()
    }

    /// Check if chunk exists in cache (without affecting LRU)
    pub fn contains(&self, chunk_id: &ChunkId) -> bool {
        self.cache.read().contains(chunk_id)
    }

    /// Insert a chunk into cache
    pub fn insert(&self, chunk_id: ChunkId, data: Vec<u8>) {
        self.insert_arc(chunk_id, Arc::new(data));
    }

    /// Insert a chunk into cache from an existing Arc (avoids clone)
    pub fn insert_arc(&self, chunk_id: ChunkId, data: Arc<Vec<u8>>) {
        let data_len = data.len();

        let mut cache = self.cache.write();
        let mut current_bytes = self.current_bytes.write();

        // Evict entries until we have space
        while *current_bytes + data_len > self.max_bytes {
            if let Some((_, evicted)) = cache.pop_lru() {
                *current_bytes = current_bytes.saturating_sub(evicted.len());
            } else {
                break;
            }
        }

        // Check if we already have this chunk (update)
        if let Some(old) = cache.pop(&chunk_id) {
            *current_bytes = current_bytes.saturating_sub(old.len());
        }

        // Insert new entry
        if *current_bytes + data_len <= self.max_bytes {
            cache.put(chunk_id, data);
            *current_bytes += data_len;
        }
    }

    /// Invalidate a specific chunk
    pub fn invalidate(&self, chunk_id: &ChunkId) {
        // Acquire both locks up-front to ensure atomic update
        // Lock ordering: cache first, then current_bytes (consistent with insert)
        let mut cache = self.cache.write();
        let mut current_bytes = self.current_bytes.write();
        if let Some(entry) = cache.pop(chunk_id) {
            *current_bytes = current_bytes.saturating_sub(entry.len());
        }
    }

    /// Invalidate all chunks for an inode
    pub fn invalidate_inode(&self, inode: Inode) {
        let mut cache = self.cache.write();
        let mut current_bytes = self.current_bytes.write();

        // Collect keys to remove
        let to_remove: Vec<ChunkId> = cache
            .iter()
            .filter(|(k, _)| k.inode == inode)
            .map(|(k, _)| *k)
            .collect();

        for key in to_remove {
            if let Some(entry) = cache.pop(&key) {
                *current_bytes = current_bytes.saturating_sub(entry.len());
            }
        }
    }

    /// Get current cache size in bytes
    pub fn current_size(&self) -> usize {
        *self.current_bytes.read()
    }

    /// Get current entry count
    pub fn len(&self) -> usize {
        self.cache.read().len()
    }

    /// Check if cache is empty
    pub fn is_empty(&self) -> bool {
        self.cache.read().is_empty()
    }

    /// Clear the entire cache
    pub fn clear(&self) {
        let mut cache = self.cache.write();
        cache.clear();
        *self.current_bytes.write() = 0;
    }
}

/// Hybrid chunk cache combining RAM and Disk tiers
///
/// L1: Fast in-memory LRU cache
/// L2: Persistent disk cache
///
/// Lookup order: RAM → Disk → Miss
/// On disk hit: promote to RAM
/// On insert: write to RAM, async write to disk
pub struct HybridChunkCache {
    /// L1: RAM cache (fast, limited)
    ram_cache: ChunkCache,
    /// L2: Disk cache (slower, larger)
    disk_cache: Option<Arc<DiskCache>>,
    /// Statistics (Arc for sharing with disk write threads)
    stats: Arc<HybridCacheStats>,
}

/// Statistics for hybrid cache
pub struct HybridCacheStats {
    ram_hits: AtomicU64,
    disk_hits: AtomicU64,
    misses: AtomicU64,
    disk_writes: AtomicU64,
    /// Current number of active disk write threads
    active_disk_threads: AtomicUsize,
    /// Number of disk writes dropped due to thread limit
    dropped_writes: AtomicU64,
}

impl Default for HybridCacheStats {
    fn default() -> Self {
        Self {
            ram_hits: AtomicU64::new(0),
            disk_hits: AtomicU64::new(0),
            misses: AtomicU64::new(0),
            disk_writes: AtomicU64::new(0),
            active_disk_threads: AtomicUsize::new(0),
            dropped_writes: AtomicU64::new(0),
        }
    }
}

impl HybridChunkCache {
    /// Create a new hybrid cache with disk persistence
    pub fn new(ram_capacity: usize) -> Self {
        let disk_cache = match DiskCache::new() {
            Ok(dc) => {
                debug!(
                    "Disk cache initialized: {} entries, {} bytes",
                    dc.entry_count(),
                    dc.total_size()
                );
                Some(Arc::new(dc))
            }
            Err(e) => {
                warn!("Failed to initialize disk cache: {} - running RAM-only", e);
                None
            }
        };

        Self {
            ram_cache: ChunkCache::with_capacity(ram_capacity),
            disk_cache,
            stats: Arc::new(HybridCacheStats::default()),
        }
    }

    /// Create with a custom disk cache (for testing)
    pub fn with_disk_cache(ram_capacity: usize, disk_cache: Arc<DiskCache>) -> Self {
        Self {
            ram_cache: ChunkCache::with_capacity(ram_capacity),
            disk_cache: Some(disk_cache),
            stats: Arc::new(HybridCacheStats::default()),
        }
    }

    /// Create RAM-only cache (no disk persistence)
    pub fn ram_only(ram_capacity: usize) -> Self {
        Self {
            ram_cache: ChunkCache::with_capacity(ram_capacity),
            disk_cache: None,
            stats: Arc::new(HybridCacheStats::default()),
        }
    }

    /// Get disk cache reference (for GC)
    pub fn disk_cache(&self) -> Option<Arc<DiskCache>> {
        self.disk_cache.clone()
    }

    /// Multi-tier lookup: RAM → Disk → Miss
    pub fn get(&self, chunk_id: &ChunkId) -> Option<Arc<Vec<u8>>> {
        // Try L1 (RAM) first
        if let Some(data) = self.ram_cache.get(chunk_id) {
            self.stats.ram_hits.fetch_add(1, Ordering::Relaxed);
            trace!("hybrid_cache: RAM hit for {:?}", chunk_id);
            return Some(data);
        }

        // Try L2 (Disk)
        if let Some(ref disk_cache) = self.disk_cache {
            match disk_cache.read(chunk_id) {
                Ok(Some(data)) => {
                    self.stats.disk_hits.fetch_add(1, Ordering::Relaxed);
                    trace!(
                        "hybrid_cache: Disk hit for {:?}, promoting to RAM",
                        chunk_id
                    );

                    // Promote to RAM cache - wrap in Arc once and share it
                    // This avoids cloning the full Vec<u8> data
                    let arc_data = Arc::new(data);
                    self.ram_cache.insert_arc(*chunk_id, arc_data.clone());

                    return Some(arc_data);
                }
                Ok(None) => {
                    // Not on disk
                }
                Err(e) => {
                    warn!("hybrid_cache: Disk read error for {:?}: {}", chunk_id, e);
                }
            }
        }

        self.stats.misses.fetch_add(1, Ordering::Relaxed);
        trace!("hybrid_cache: miss for {:?}", chunk_id);
        None
    }

    /// Check if chunk exists in any tier (without affecting LRU)
    pub fn contains(&self, chunk_id: &ChunkId) -> bool {
        if self.ram_cache.contains(chunk_id) {
            return true;
        }

        if let Some(ref disk_cache) = self.disk_cache {
            if disk_cache.contains(chunk_id) {
                return true;
            }
        }

        false
    }

    /// Insert into both RAM and disk (async disk write)
    ///
    /// Disk writes are bounded to MAX_DISK_WRITE_THREADS concurrent operations.
    /// If the limit is reached, the disk write is dropped (RAM still updated).
    pub fn insert(&self, chunk_id: ChunkId, data: Vec<u8>) {
        // Insert into RAM immediately
        self.ram_cache.insert(chunk_id, data.clone());

        // Async write to disk (bounded fire and forget)
        if let Some(ref disk_cache) = self.disk_cache {
            // Check if we can spawn a new thread (bounded concurrency)
            let current = self.stats.active_disk_threads.load(Ordering::Relaxed);
            if current >= MAX_DISK_WRITE_THREADS {
                // Drop the disk write if at capacity - RAM still has it
                self.stats.dropped_writes.fetch_add(1, Ordering::Relaxed);
                trace!(
                    "hybrid_cache: Disk write dropped for {:?} (at thread limit {})",
                    chunk_id,
                    MAX_DISK_WRITE_THREADS
                );
                return;
            }

            // Increment active count (may slightly overshoot due to race, but bounded)
            self.stats
                .active_disk_threads
                .fetch_add(1, Ordering::Relaxed);
            self.stats.disk_writes.fetch_add(1, Ordering::Relaxed);

            let disk_cache = disk_cache.clone();
            let stats = self.stats.clone();

            std::thread::spawn(move || {
                // Perform the write
                if let Err(e) = disk_cache.write(chunk_id, &data) {
                    warn!("hybrid_cache: Disk write error for {:?}: {}", chunk_id, e);
                } else {
                    trace!("hybrid_cache: Disk write complete for {:?}", chunk_id);
                }

                // Decrement active count (stats is Arc, so this is safe)
                stats.active_disk_threads.fetch_sub(1, Ordering::Relaxed);
            });
        }
    }

    /// Invalidate from both tiers
    pub fn invalidate(&self, chunk_id: &ChunkId) {
        self.ram_cache.invalidate(chunk_id);

        if let Some(ref disk_cache) = self.disk_cache {
            let _ = disk_cache.remove(chunk_id);
        }
    }

    /// Invalidate all chunks for an inode
    pub fn invalidate_inode(&self, inode: Inode) {
        self.ram_cache.invalidate_inode(inode);
        // Note: Disk invalidation by inode would require index scan
        // For now, we only invalidate RAM; disk entries will be evicted by GC
    }

    /// Clear RAM cache (disk cache managed by GC)
    pub fn clear(&self) {
        self.ram_cache.clear();
    }

    /// Get cache statistics
    pub fn get_stats(&self) -> (u64, u64, u64, u64) {
        (
            self.stats.ram_hits.load(Ordering::Relaxed),
            self.stats.disk_hits.load(Ordering::Relaxed),
            self.stats.misses.load(Ordering::Relaxed),
            self.stats.disk_writes.load(Ordering::Relaxed),
        )
    }

    /// Get current RAM cache size
    pub fn ram_size(&self) -> usize {
        self.ram_cache.current_size()
    }

    /// Get current disk cache size
    pub fn disk_size(&self) -> u64 {
        self.disk_cache
            .as_ref()
            .map(|dc| dc.total_size())
            .unwrap_or(0)
    }
}

/// Combined cache manager (RAM-only chunk cache)
pub struct CacheManager {
    pub attrs: AttrCache,
    pub dirs: DirCache,
    pub chunks: ChunkCache,
}

impl CacheManager {
    pub fn new(attr_ttl: Duration, dir_ttl: Duration, chunk_ttl: Duration) -> Self {
        Self {
            attrs: AttrCache::new(attr_ttl, 10_000),
            dirs: DirCache::new(dir_ttl, 1_000),
            chunks: ChunkCache::new(chunk_ttl, 512 * 1024 * 1024), // 512MB L1 cache
        }
    }

    /// Create with custom chunk cache capacity
    pub fn with_chunk_capacity(
        attr_ttl: Duration,
        dir_ttl: Duration,
        chunk_entries: usize,
    ) -> Self {
        Self {
            attrs: AttrCache::new(attr_ttl, 10_000),
            dirs: DirCache::new(dir_ttl, 1_000),
            chunks: ChunkCache::with_capacity(chunk_entries),
        }
    }

    /// Invalidate all caches for an inode
    pub fn invalidate_inode(&self, inode: Inode) {
        self.attrs.invalidate(inode);
        self.dirs.invalidate(inode);
        self.chunks.invalidate_inode(inode);
    }

    /// Clear all caches
    pub fn clear(&self) {
        self.attrs.invalidate_all();
        self.dirs.invalidate_all();
        self.chunks.clear();
    }
}

impl Default for CacheManager {
    fn default() -> Self {
        Self::new(
            Duration::from_secs(1),
            Duration::from_secs(1),
            Duration::from_secs(DEFAULT_CHUNK_TTL_SECS),
        )
    }
}

/// Combined cache manager with hybrid (RAM + Disk) chunk cache
///
/// Phase 4: Provides persistent caching across restarts
pub struct HybridCacheManager {
    pub attrs: AttrCache,
    pub dirs: DirCache,
    pub chunks: HybridChunkCache,
}

impl HybridCacheManager {
    /// Create with default settings (512MB RAM + 10GB disk)
    pub fn new(attr_ttl: Duration, dir_ttl: Duration) -> Self {
        Self {
            attrs: AttrCache::new(attr_ttl, 10_000),
            dirs: DirCache::new(dir_ttl, 1_000),
            chunks: HybridChunkCache::new(DEFAULT_CHUNK_CACHE_ENTRIES),
        }
    }

    /// Create with custom RAM cache capacity
    pub fn with_ram_capacity(attr_ttl: Duration, dir_ttl: Duration, ram_entries: usize) -> Self {
        Self {
            attrs: AttrCache::new(attr_ttl, 10_000),
            dirs: DirCache::new(dir_ttl, 1_000),
            chunks: HybridChunkCache::new(ram_entries),
        }
    }

    /// Create RAM-only (no disk persistence)
    pub fn ram_only(attr_ttl: Duration, dir_ttl: Duration, ram_entries: usize) -> Self {
        Self {
            attrs: AttrCache::new(attr_ttl, 10_000),
            dirs: DirCache::new(dir_ttl, 1_000),
            chunks: HybridChunkCache::ram_only(ram_entries),
        }
    }

    /// Get disk cache for GC
    pub fn disk_cache(&self) -> Option<Arc<DiskCache>> {
        self.chunks.disk_cache()
    }

    /// Invalidate all caches for an inode
    pub fn invalidate_inode(&self, inode: Inode) {
        self.attrs.invalidate(inode);
        self.dirs.invalidate(inode);
        self.chunks.invalidate_inode(inode);
    }

    /// Clear all caches
    pub fn clear(&self) {
        self.attrs.invalidate_all();
        self.dirs.invalidate_all();
        self.chunks.clear();
    }

    /// Get cache statistics
    pub fn stats(&self) -> HybridCacheManagerStats {
        let (ram_hits, disk_hits, misses, disk_writes) = self.chunks.get_stats();
        HybridCacheManagerStats {
            ram_hits,
            disk_hits,
            misses,
            disk_writes,
            ram_size_bytes: self.chunks.ram_size(),
            disk_size_bytes: self.chunks.disk_size(),
        }
    }
}

impl Default for HybridCacheManager {
    fn default() -> Self {
        Self::new(Duration::from_secs(1), Duration::from_secs(1))
    }
}

/// Statistics for HybridCacheManager
#[derive(Debug, Clone)]
pub struct HybridCacheManagerStats {
    pub ram_hits: u64,
    pub disk_hits: u64,
    pub misses: u64,
    pub disk_writes: u64,
    pub ram_size_bytes: usize,
    pub disk_size_bytes: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_attr_cache_basic() {
        let cache = AttrCache::new(Duration::from_secs(60), 100);

        let attr = FileAttr::file(42, 1024);
        cache.insert(42, attr.clone());

        let cached = cache.get(42);
        assert!(cached.is_some());
        assert_eq!(cached.unwrap().size, 1024);
    }

    #[test]
    fn test_attr_cache_expiry() {
        let cache = AttrCache::new(Duration::from_millis(10), 100);

        let attr = FileAttr::file(42, 1024);
        cache.insert(42, attr);

        // Should be present immediately
        assert!(cache.get(42).is_some());

        // Wait for expiry
        std::thread::sleep(Duration::from_millis(20));

        // Should be expired
        assert!(cache.get(42).is_none());
    }

    #[test]
    fn test_chunk_cache_basic() {
        let cache = ChunkCache::with_capacity(100);

        let chunk_id = ChunkId::new(1, 0);
        let data = vec![42u8; 100];

        cache.insert(chunk_id, data.clone());

        assert!(cache.contains(&chunk_id));
        let cached = cache.get(&chunk_id);
        assert!(cached.is_some());
        assert_eq!(&*cached.unwrap(), &data);
    }

    #[test]
    fn test_chunk_cache_lru_eviction() {
        // Cache that holds exactly 2 chunks
        let cache = ChunkCache::with_capacity(2);

        let chunk1 = ChunkId::new(1, 0);
        let chunk2 = ChunkId::new(1, 1);
        let chunk3 = ChunkId::new(1, 2);

        cache.insert(chunk1, vec![1u8; CHUNK_SIZE]);
        cache.insert(chunk2, vec![2u8; CHUNK_SIZE]);

        assert!(cache.contains(&chunk1));
        assert!(cache.contains(&chunk2));

        // Access chunk1 to make it recently used
        let _ = cache.get(&chunk1);

        // Insert chunk3 - should evict chunk2 (LRU)
        cache.insert(chunk3, vec![3u8; CHUNK_SIZE]);

        assert!(cache.contains(&chunk1)); // Still there (recently used)
        assert!(!cache.contains(&chunk2)); // Evicted (LRU)
        assert!(cache.contains(&chunk3)); // Just inserted
    }

    #[test]
    fn test_chunk_cache_size_limit() {
        let cache = ChunkCache::new(Duration::from_secs(60), 1024); // 1KB limit

        // Insert 512 bytes
        cache.insert(ChunkId::new(1, 0), vec![0u8; 512]);
        assert_eq!(cache.current_size(), 512);

        // Insert another 512 bytes
        cache.insert(ChunkId::new(2, 0), vec![0u8; 512]);
        assert_eq!(cache.current_size(), 1024);

        // Insert 256 more - should evict
        cache.insert(ChunkId::new(3, 0), vec![0u8; 256]);
        assert!(cache.current_size() <= 1024);
    }

    #[test]
    fn test_chunk_cache_contains_vs_get() {
        let cache = ChunkCache::with_capacity(2);

        let chunk1 = ChunkId::new(1, 0);
        let chunk2 = ChunkId::new(1, 1);
        let chunk3 = ChunkId::new(1, 2);

        cache.insert(chunk1, vec![1u8; CHUNK_SIZE]);
        cache.insert(chunk2, vec![2u8; CHUNK_SIZE]);

        // contains() should not affect LRU order
        assert!(cache.contains(&chunk1));
        assert!(cache.contains(&chunk2));

        // Insert chunk3 - should evict chunk1 (still LRU despite contains())
        cache.insert(chunk3, vec![3u8; CHUNK_SIZE]);

        assert!(!cache.contains(&chunk1)); // Evicted
        assert!(cache.contains(&chunk2));
        assert!(cache.contains(&chunk3));
    }

    #[test]
    fn test_chunk_cache_peek() {
        let cache = ChunkCache::with_capacity(2);

        let chunk1 = ChunkId::new(1, 0);
        let chunk2 = ChunkId::new(1, 1);
        let chunk3 = ChunkId::new(1, 2);

        cache.insert(chunk1, vec![1u8; CHUNK_SIZE]);
        cache.insert(chunk2, vec![2u8; CHUNK_SIZE]);

        // peek() should not affect LRU order
        let _ = cache.peek(&chunk1);

        // Insert chunk3 - chunk1 should still be evicted
        cache.insert(chunk3, vec![3u8; CHUNK_SIZE]);

        assert!(!cache.contains(&chunk1)); // Evicted (peek didn't promote)
        assert!(cache.contains(&chunk2));
        assert!(cache.contains(&chunk3));
    }

    #[test]
    fn test_invalidation() {
        let manager = CacheManager::new(
            Duration::from_secs(60),
            Duration::from_secs(60),
            Duration::from_secs(60),
        );

        let attr = FileAttr::file(42, 1024);
        manager.attrs.insert(42, attr);
        manager.chunks.insert(ChunkId::new(42, 0), vec![0u8; 128]);
        manager.chunks.insert(ChunkId::new(42, 1), vec![0u8; 128]);

        assert!(manager.attrs.get(42).is_some());
        assert!(manager.chunks.get(&ChunkId::new(42, 0)).is_some());

        manager.invalidate_inode(42);

        assert!(manager.attrs.get(42).is_none());
        assert!(manager.chunks.get(&ChunkId::new(42, 0)).is_none());
        assert!(manager.chunks.get(&ChunkId::new(42, 1)).is_none());
    }

    #[test]
    fn test_chunk_cache_update_existing() {
        let cache = ChunkCache::with_capacity(10);

        let chunk_id = ChunkId::new(1, 0);
        cache.insert(chunk_id, vec![1u8; 100]);
        let initial_size = cache.current_size();

        // Update with different data
        cache.insert(chunk_id, vec![2u8; 100]);

        // Size should remain the same (not double)
        assert_eq!(cache.current_size(), initial_size);

        // Should have new data
        let data = cache.get(&chunk_id).unwrap();
        assert_eq!(data[0], 2u8);
    }
}
