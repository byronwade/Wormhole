# Phase 4 Architecture - Persistent Storage and Offline Capability

## New Dependencies

```toml
# Cargo.toml additions for teleport-daemon
[dependencies]
directories = "5.0"      # Platform-specific cache directories
fs2 = "0.4"              # File locking for atomic operations
hex = "0.4"              # Hex encoding for hashed filenames
sha2 = "0.10"            # SHA-256 for chunk path hashing
```

## Disk Cache Design

### disk_cache.rs - Persistent Chunk Storage

```rust
use directories::ProjectDirs;
use sha2::{Sha256, Digest};
use std::path::{Path, PathBuf};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};

pub struct DiskCache {
    cache_dir: PathBuf,
    index: Arc<RwLock<HashMap<ChunkId, DiskCacheEntry>>>,
}

struct DiskCacheEntry {
    file_path: PathBuf,
    size: u64,
    last_accessed: SystemTime,
}

impl DiskCache {
    pub fn new() -> Result<Self> {
        // Platform-specific cache directory
        // Linux: ~/.cache/wormhole/chunks/
        // macOS: ~/Library/Caches/wormhole/chunks/
        // Windows: %LOCALAPPDATA%\wormhole\chunks\
        let dirs = ProjectDirs::from("", "", "wormhole")
            .ok_or_else(|| anyhow!("Could not determine cache directory"))?;

        let cache_dir = dirs.cache_dir().join("chunks");
        fs::create_dir_all(&cache_dir)?;

        let mut index = HashMap::new();
        // Scan existing cache files on startup
        Self::scan_cache_dir(&cache_dir, &mut index)?;

        Ok(Self {
            cache_dir,
            index: Arc::new(RwLock::new(index)),
        })
    }

    /// Generate deterministic path for chunk
    fn chunk_path(&self, chunk_id: &ChunkId) -> PathBuf {
        // Hash: SHA256(file_path + chunk_index)
        let mut hasher = Sha256::new();
        hasher.update(chunk_id.file_path.as_bytes());
        hasher.update(&chunk_id.chunk_index.to_le_bytes());
        let hash = hex::encode(hasher.finalize());

        // Two-level directory structure to avoid too many files in one dir
        // e.g., ab/cdef1234...
        let dir1 = &hash[0..2];
        let dir2 = &hash[2..4];
        let filename = &hash[4..];

        self.cache_dir.join(dir1).join(dir2).join(filename)
    }

    /// Atomic write: tmp file + rename
    pub async fn write(&self, chunk_id: ChunkId, data: &[u8]) -> Result<()> {
        let target_path = self.chunk_path(&chunk_id);

        // Ensure parent directories exist
        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent)?;
        }

        // Write to temp file first
        let temp_path = target_path.with_extension("tmp");
        {
            let mut file = OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .open(&temp_path)?;

            file.write_all(data)?;
            file.sync_all()?;  // Ensure durability
        }

        // Atomic rename
        fs::rename(&temp_path, &target_path)?;

        // Update index
        self.index.write().insert(chunk_id, DiskCacheEntry {
            file_path: target_path,
            size: data.len() as u64,
            last_accessed: SystemTime::now(),
        });

        Ok(())
    }

    /// Read from disk cache
    pub async fn read(&self, chunk_id: &ChunkId) -> Result<Option<Vec<u8>>> {
        let entry = self.index.read().get(chunk_id).cloned();

        if let Some(entry) = entry {
            let mut file = File::open(&entry.file_path)?;
            let mut data = Vec::with_capacity(entry.size as usize);
            file.read_to_end(&mut data)?;

            // Update access time
            self.index.write()
                .get_mut(chunk_id)
                .map(|e| e.last_accessed = SystemTime::now());

            Ok(Some(data))
        } else {
            Ok(None)
        }
    }

    pub fn contains(&self, chunk_id: &ChunkId) -> bool {
        self.index.read().contains_key(chunk_id)
    }
}
```

## Hybrid Cache Architecture

### cache.rs - Multi-Tier Cache

```rust
pub struct HybridCache {
    // L1: Hot data in RAM (fast, limited)
    ram_cache: Arc<RwLock<LruCache<ChunkId, Arc<Vec<u8>>>>>,
    ram_capacity: usize,

    // L2: Warm data on disk (slower, larger)
    disk_cache: Arc<DiskCache>,

    // Statistics
    stats: Arc<RwLock<CacheStats>>,
}

#[derive(Default)]
struct CacheStats {
    ram_hits: u64,
    disk_hits: u64,
    misses: u64,
    disk_writes: u64,
}

impl HybridCache {
    pub fn new(ram_capacity: usize) -> Result<Self> {
        Ok(Self {
            ram_cache: Arc::new(RwLock::new(
                LruCache::new(NonZeroUsize::new(ram_capacity).unwrap())
            )),
            ram_capacity,
            disk_cache: Arc::new(DiskCache::new()?),
            stats: Arc::new(RwLock::new(CacheStats::default())),
        })
    }

    /// Multi-tier lookup: RAM → Disk → None
    pub async fn get(&self, chunk_id: &ChunkId) -> Option<Arc<Vec<u8>>> {
        // Try L1 (RAM)
        if let Some(data) = self.ram_cache.write().get(chunk_id).cloned() {
            self.stats.write().ram_hits += 1;
            return Some(data);
        }

        // Try L2 (Disk)
        if let Ok(Some(data)) = self.disk_cache.read(chunk_id).await {
            self.stats.write().disk_hits += 1;

            // Promote to RAM
            let arc_data = Arc::new(data);
            self.ram_cache.write().put(chunk_id.clone(), arc_data.clone());

            return Some(arc_data);
        }

        self.stats.write().misses += 1;
        None
    }

    /// Insert into both RAM and disk (async disk write)
    pub async fn insert(&self, chunk_id: ChunkId, data: Vec<u8>) {
        let arc_data = Arc::new(data.clone());

        // Insert into RAM immediately
        self.ram_cache.write().put(chunk_id.clone(), arc_data);

        // Async write to disk (fire and forget)
        let disk_cache = self.disk_cache.clone();
        let stats = self.stats.clone();
        tokio::spawn(async move {
            if let Ok(_) = disk_cache.write(chunk_id, &data).await {
                stats.write().disk_writes += 1;
            }
        });
    }

    pub fn contains(&self, chunk_id: &ChunkId) -> bool {
        self.ram_cache.read().contains(chunk_id) ||
        self.disk_cache.contains(chunk_id)
    }
}
```

## Garbage Collection

### gc.rs - Background Cache Cleanup

```rust
const MAX_CACHE_BYTES: u64 = 10 * 1024 * 1024 * 1024;  // 10GB
const GC_INTERVAL: Duration = Duration::from_secs(60);
const HIGH_WATERMARK: f64 = 0.9;   // Start GC at 90%
const LOW_WATERMARK: f64 = 0.7;    // GC until 70%

pub struct GarbageCollector {
    disk_cache: Arc<DiskCache>,
    max_bytes: u64,
}

impl GarbageCollector {
    pub fn new(disk_cache: Arc<DiskCache>) -> Self {
        Self {
            disk_cache,
            max_bytes: MAX_CACHE_BYTES,
        }
    }

    pub async fn run_gc_loop(self) {
        let mut interval = tokio::time::interval(GC_INTERVAL);

        loop {
            interval.tick().await;

            if let Err(e) = self.maybe_gc().await {
                tracing::error!("GC error: {}", e);
            }
        }
    }

    async fn maybe_gc(&self) -> Result<()> {
        let current_size = self.disk_cache.total_size();
        let threshold = (self.max_bytes as f64 * HIGH_WATERMARK) as u64;

        if current_size > threshold {
            tracing::info!(
                "Starting GC: {} bytes / {} max ({}%)",
                current_size, self.max_bytes,
                (current_size as f64 / self.max_bytes as f64 * 100.0) as u32
            );

            self.gc_to_target().await?;
        }

        Ok(())
    }

    async fn gc_to_target(&self) -> Result<()> {
        let target_size = (self.max_bytes as f64 * LOW_WATERMARK) as u64;
        let mut current_size = self.disk_cache.total_size();

        // Get all entries sorted by last access time (oldest first)
        let mut entries: Vec<_> = self.disk_cache.index.read()
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();

        entries.sort_by_key(|(_, entry)| entry.last_accessed);

        let mut evicted = 0u64;
        for (chunk_id, entry) in entries {
            if current_size <= target_size {
                break;
            }

            // Remove from disk
            if let Err(e) = fs::remove_file(&entry.file_path) {
                tracing::warn!("Failed to remove cache file: {}", e);
                continue;
            }

            // Remove from index
            self.disk_cache.index.write().remove(&chunk_id);

            evicted += entry.size;
            current_size -= entry.size;
        }

        tracing::info!("GC complete: evicted {} bytes", evicted);
        Ok(())
    }
}
```

## Cache Architecture Diagram

```
┌───────────────────────────────────────────────────────────────────────────┐
│                           FUSE Read Request                                │
└───────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                         HybridCache.get(ChunkId)                           │
└───────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
            │  L1: RAM    │ │  L2: Disk   │ │  L3: Net    │
            │  LruCache   │ │  DiskCache  │ │  QUIC Host  │
            │  ~500MB     │ │  ~10GB      │ │  ∞          │
            │  <1ms       │ │  1-10ms     │ │  10-500ms   │
            └─────────────┘ └─────────────┘ └─────────────┘
                    │               │               │
                    │     ┌─────────┴─────────┐     │
                    │     │ Promote to RAM    │     │
                    │     └───────────────────┘     │
                    │                               │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                        Return Data to FUSE                                 │
└───────────────────────────────────────────────────────────────────────────┘

                    ┌───────────────────────────────┐
                    │       Background Tasks         │
                    ├───────────────────────────────┤
                    │  • Async disk writes          │
                    │  • GC every 60 seconds        │
                    │  • Prefetch to disk + RAM     │
                    └───────────────────────────────┘
```

## Disk Cache File Layout

```
~/.cache/wormhole/
└── chunks/
    ├── ab/
    │   ├── cd/
    │   │   ├── ef123456789...  # Chunk data
    │   │   └── ef123456789...
    │   └── de/
    │       └── ...
    ├── bc/
    │   └── ...
    └── index.json              # Optional: persist index for faster startup
```

## Offline Mode Considerations

Phase 4 focuses on chunk caching, not full offline support:
- **What works offline**: Previously cached file chunks can be read
- **What doesn't work offline**: Metadata still fetched from host at mount time
- **Future work**: Persist DirEntry tree for true offline remount

### Metadata Persistence (Future)

```rust
// Potential Phase 4.5 addition
pub struct MetadataCache {
    share_id: String,  // Hash of share URL or ID
    tree: DirEntry,
    cached_at: SystemTime,
    host_addr: SocketAddr,
}

// Would allow:
// 1. Mount with stale metadata when host offline
// 2. Background refresh when host comes online
// 3. Conflict detection when metadata changes
```

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| MAX_CACHE_BYTES | 10GB | Maximum disk cache size |
| HIGH_WATERMARK | 90% | Start GC when cache reaches this |
| LOW_WATERMARK | 70% | GC until cache reaches this |
| GC_INTERVAL | 60s | How often to check cache size |
| RAM_CAPACITY | 4000 chunks | ~500MB RAM cache |

## Integrity Verification (Optional Enhancement)

```rust
// Can add BLAKE3 hashing for chunk integrity
use blake3;

impl DiskCache {
    pub async fn write_with_hash(&self, chunk_id: ChunkId, data: &[u8]) -> Result<()> {
        let hash = blake3::hash(data);
        // Store hash alongside data or in filename
        // Verify on read
    }
}
```
