//! Garbage Collection - Background cache cleanup
//!
//! Periodically checks disk cache size and evicts oldest entries
//! when the cache exceeds the high watermark, cleaning up until
//! reaching the low watermark.
//!
//! # Configuration
//! - MAX_CACHE_BYTES: 10GB maximum disk cache size
//! - HIGH_WATERMARK: 90% - start GC when cache reaches this
//! - LOW_WATERMARK: 70% - GC until cache reaches this
//! - GC_INTERVAL: 60 seconds between checks

use std::sync::Arc;
use std::time::Duration;

use tokio::time::interval;
use tracing::{debug, error, info, warn};

use crate::disk_cache::DiskCache;

/// Maximum disk cache size in bytes (10GB)
pub const MAX_CACHE_BYTES: u64 = 10 * 1024 * 1024 * 1024;

/// GC interval in seconds
pub const GC_INTERVAL_SECS: u64 = 60;

/// Start GC when cache reaches this percentage
pub const HIGH_WATERMARK: f64 = 0.9;

/// GC until cache reaches this percentage
pub const LOW_WATERMARK: f64 = 0.7;

/// Garbage collector for disk cache
pub struct GarbageCollector {
    disk_cache: Arc<DiskCache>,
    max_bytes: u64,
    high_watermark: f64,
    low_watermark: f64,
}

impl GarbageCollector {
    /// Create a new garbage collector with default settings
    pub fn new(disk_cache: Arc<DiskCache>) -> Self {
        Self {
            disk_cache,
            max_bytes: MAX_CACHE_BYTES,
            high_watermark: HIGH_WATERMARK,
            low_watermark: LOW_WATERMARK,
        }
    }

    /// Create with custom configuration
    pub fn with_config(
        disk_cache: Arc<DiskCache>,
        max_bytes: u64,
        high_watermark: f64,
        low_watermark: f64,
    ) -> Self {
        Self {
            disk_cache,
            max_bytes,
            high_watermark,
            low_watermark,
        }
    }

    /// Run the garbage collection loop (call from a tokio task)
    pub async fn run_loop(self) {
        let mut tick = interval(Duration::from_secs(GC_INTERVAL_SECS));

        loop {
            tick.tick().await;

            if let Err(e) = self.maybe_gc() {
                error!("GC error: {}", e);
            }
        }
    }

    /// Check if GC is needed and run if so
    pub fn maybe_gc(&self) -> Result<(), GcError> {
        let current_size = self.disk_cache.total_size();
        let threshold = (self.max_bytes as f64 * self.high_watermark) as u64;

        if current_size > threshold {
            let percent = (current_size as f64 / self.max_bytes as f64 * 100.0) as u32;
            info!(
                "Starting GC: {} bytes / {} max ({}%)",
                current_size, self.max_bytes, percent
            );

            self.gc_to_target()?;
        } else {
            debug!(
                "GC check: {} bytes / {} max - below threshold",
                current_size, self.max_bytes
            );
        }

        Ok(())
    }

    /// Run GC until cache size is below low watermark
    fn gc_to_target(&self) -> Result<(), GcError> {
        let target_size = (self.max_bytes as f64 * self.low_watermark) as u64;
        let mut current_size = self.disk_cache.total_size();

        // Get all entries sorted by last access time (oldest first)
        let entries = self.disk_cache.entries_by_access_time();

        let mut evicted_count = 0u64;
        let mut evicted_bytes = 0u64;

        for (chunk_id, entry) in entries {
            if current_size <= target_size {
                break;
            }

            match self.disk_cache.remove(&chunk_id) {
                Ok(true) => {
                    evicted_count += 1;
                    evicted_bytes += entry.size;
                    current_size = current_size.saturating_sub(entry.size);
                }
                Ok(false) => {
                    // Entry was already removed
                }
                Err(e) => {
                    warn!("Failed to evict chunk {:?}: {}", chunk_id, e);
                }
            }
        }

        info!(
            "GC complete: evicted {} entries ({} bytes), cache now {} bytes",
            evicted_count, evicted_bytes, current_size
        );

        Ok(())
    }

    /// Force immediate GC regardless of watermarks
    pub fn force_gc(&self) -> Result<GcStats, GcError> {
        let start_size = self.disk_cache.total_size();
        self.gc_to_target()?;
        let end_size = self.disk_cache.total_size();

        Ok(GcStats {
            bytes_freed: start_size.saturating_sub(end_size),
            bytes_remaining: end_size,
        })
    }

    /// Get current cache statistics
    pub fn stats(&self) -> CacheStats {
        let current_size = self.disk_cache.total_size();
        let entry_count = self.disk_cache.entry_count();

        CacheStats {
            current_bytes: current_size,
            max_bytes: self.max_bytes,
            entry_count,
            usage_percent: (current_size as f64 / self.max_bytes as f64 * 100.0) as u32,
        }
    }
}

/// Statistics returned from GC run
#[derive(Debug, Clone)]
pub struct GcStats {
    /// Bytes freed during GC
    pub bytes_freed: u64,
    /// Bytes remaining after GC
    pub bytes_remaining: u64,
}

/// Current cache statistics
#[derive(Debug, Clone)]
pub struct CacheStats {
    /// Current cache size in bytes
    pub current_bytes: u64,
    /// Maximum allowed cache size
    pub max_bytes: u64,
    /// Number of cached entries
    pub entry_count: usize,
    /// Usage percentage
    pub usage_percent: u32,
}

/// GC errors
#[derive(Debug)]
pub enum GcError {
    /// IO error during GC
    Io(String),
}

impl std::fmt::Display for GcError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GcError::Io(e) => write!(f, "GC IO error: {}", e),
        }
    }
}

impl std::error::Error for GcError {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::disk_cache::DiskCache;
    use teleport_core::ChunkId;
    use tempfile::TempDir;

    #[test]
    fn test_gc_below_threshold() {
        let temp_dir = TempDir::new().unwrap();
        let disk_cache = Arc::new(DiskCache::with_dir(temp_dir.path().to_path_buf()).unwrap());

        // Small max size for testing
        let gc = GarbageCollector::with_config(disk_cache.clone(), 1000, 0.9, 0.7);

        // Add small amount of data (below threshold)
        disk_cache.write(ChunkId::new(1, 0), &vec![0; 100]).unwrap();

        // GC should not evict anything
        gc.maybe_gc().unwrap();
        assert!(disk_cache.contains(&ChunkId::new(1, 0)));
    }

    #[test]
    fn test_gc_above_threshold() {
        let temp_dir = TempDir::new().unwrap();
        let disk_cache = Arc::new(DiskCache::with_dir(temp_dir.path().to_path_buf()).unwrap());

        // Very small max size for testing (100 bytes, 90% threshold = 90 bytes)
        let gc = GarbageCollector::with_config(disk_cache.clone(), 100, 0.9, 0.7);

        // Add data that exceeds threshold
        disk_cache.write(ChunkId::new(1, 0), &vec![0; 50]).unwrap();
        disk_cache.write(ChunkId::new(1, 1), &vec![0; 50]).unwrap();

        assert_eq!(disk_cache.total_size(), 100);

        // GC should evict to reach 70 bytes target
        gc.maybe_gc().unwrap();

        // Should have evicted at least one chunk
        assert!(disk_cache.total_size() <= 70);
    }

    #[test]
    fn test_gc_stats() {
        let temp_dir = TempDir::new().unwrap();
        let disk_cache = Arc::new(DiskCache::with_dir(temp_dir.path().to_path_buf()).unwrap());

        let gc = GarbageCollector::with_config(disk_cache.clone(), 1000, 0.9, 0.7);

        disk_cache.write(ChunkId::new(1, 0), &vec![0; 100]).unwrap();
        disk_cache.write(ChunkId::new(1, 1), &vec![0; 200]).unwrap();

        let stats = gc.stats();
        assert_eq!(stats.current_bytes, 300);
        assert_eq!(stats.max_bytes, 1000);
        assert_eq!(stats.entry_count, 2);
        assert_eq!(stats.usage_percent, 30);
    }

    #[test]
    fn test_force_gc() {
        let temp_dir = TempDir::new().unwrap();
        let disk_cache = Arc::new(DiskCache::with_dir(temp_dir.path().to_path_buf()).unwrap());

        // Low watermark of 30% of 1000 = 300 bytes
        let gc = GarbageCollector::with_config(disk_cache.clone(), 1000, 0.9, 0.3);

        // Add 500 bytes of data
        disk_cache.write(ChunkId::new(1, 0), &vec![0; 250]).unwrap();
        disk_cache.write(ChunkId::new(1, 1), &vec![0; 250]).unwrap();

        let stats = gc.force_gc().unwrap();

        // Should have freed some data
        assert!(stats.bytes_freed > 0);
        assert!(stats.bytes_remaining <= 300);
    }
}
