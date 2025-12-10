//! Phase 8: Bulk Transfer Coordinator
//!
//! Orchestrates high-performance file transfers using:
//! - Content-addressed chunking (BLAKE3 dedup)
//! - Parallel streams for throughput
//! - Smart compression for compressible content
//! - Progress tracking for UI feedback
//!
//! # Transfer Flow
//! 1. Build manifest (list of content hashes for file)
//! 2. Exchange manifest to find missing chunks
//! 3. Transfer only missing chunks in parallel
//! 4. Reassemble file on destination

use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use teleport_core::buffer_pool::{BufferPool, BULK_CHUNK_SIZE};
use teleport_core::compression::{CompressionResult, SmartCompressor};
use teleport_core::types::{ContentChunk, ContentHash, FileManifest, Inode};

use crate::dedup_index::DedupIndex;
use crate::stream_pool::StreamPool;

/// Progress callback for transfer updates
pub type ProgressCallback = Box<dyn Fn(TransferProgress) + Send + Sync>;

/// Transfer progress information
#[derive(Debug, Clone)]
pub struct TransferProgress {
    /// Unique transfer ID
    pub transfer_id: u64,
    /// Total bytes in the transfer
    pub total_bytes: u64,
    /// Bytes already transferred
    pub bytes_done: u64,
    /// Current transfer speed (bytes/sec)
    pub speed_bps: f64,
    /// Estimated time remaining (seconds)
    pub eta_secs: Option<f64>,
    /// Number of chunks completed
    pub chunks_done: u32,
    /// Total number of chunks
    pub total_chunks: u32,
    /// Bytes saved by dedup (already existed)
    pub dedup_savings: u64,
    /// Bytes saved by compression
    pub compression_savings: u64,
}

impl TransferProgress {
    /// Calculate completion percentage
    pub fn percent(&self) -> f64 {
        if self.total_bytes == 0 {
            100.0
        } else {
            (self.bytes_done as f64 / self.total_bytes as f64) * 100.0
        }
    }

    /// Format speed as human-readable string
    pub fn speed_human(&self) -> String {
        const KB: f64 = 1024.0;
        const MB: f64 = KB * 1024.0;
        const GB: f64 = MB * 1024.0;

        if self.speed_bps >= GB {
            format!("{:.2} GB/s", self.speed_bps / GB)
        } else if self.speed_bps >= MB {
            format!("{:.2} MB/s", self.speed_bps / MB)
        } else if self.speed_bps >= KB {
            format!("{:.2} KB/s", self.speed_bps / KB)
        } else {
            format!("{:.0} B/s", self.speed_bps)
        }
    }
}

/// Transfer result with statistics
#[derive(Debug)]
pub struct TransferResult {
    /// Total bytes transferred
    pub bytes_transferred: u64,
    /// Total time taken
    pub duration_secs: f64,
    /// Average speed (bytes/sec)
    pub avg_speed_bps: f64,
    /// Chunks transferred
    pub chunks_transferred: u32,
    /// Chunks skipped (dedup)
    pub chunks_deduped: u32,
    /// Compression ratio achieved
    pub compression_ratio: f64,
    /// Bytes saved by dedup
    pub dedup_savings: u64,
}

impl TransferResult {
    /// Format as human-readable summary
    pub fn summary(&self) -> String {
        let speed = if self.avg_speed_bps >= 1_000_000.0 {
            format!("{:.2} MB/s", self.avg_speed_bps / 1_000_000.0)
        } else {
            format!("{:.2} KB/s", self.avg_speed_bps / 1_000.0)
        };

        format!(
            "Transferred {} chunks in {:.2}s ({}) - Deduped: {}, Compression: {:.1}x",
            self.chunks_transferred,
            self.duration_secs,
            speed,
            self.chunks_deduped,
            self.compression_ratio
        )
    }
}

/// Configuration for bulk transfers
#[derive(Debug, Clone)]
pub struct BulkTransferConfig {
    /// Chunk size for splitting files
    pub chunk_size: usize,
    /// Enable smart compression
    pub compression_enabled: bool,
    /// Compression level (1-22)
    pub compression_level: i32,
    /// Maximum concurrent chunk transfers
    pub max_parallel_chunks: usize,
}

impl Default for BulkTransferConfig {
    fn default() -> Self {
        Self {
            chunk_size: BULK_CHUNK_SIZE,
            compression_enabled: true,
            compression_level: 3,
            max_parallel_chunks: 16,
        }
    }
}

/// Statistics for transfer operations
#[derive(Debug, Default)]
pub struct TransferStats {
    /// Total transfers initiated
    pub transfers_started: AtomicU64,
    /// Successful transfers
    pub transfers_completed: AtomicU64,
    /// Failed transfers
    pub transfers_failed: AtomicU64,
    /// Total bytes transferred
    pub total_bytes: AtomicU64,
    /// Bytes saved by dedup
    pub dedup_savings: AtomicU64,
    /// Bytes saved by compression
    pub compression_savings: AtomicU64,
}

impl TransferStats {
    /// Get snapshot for reporting
    pub fn snapshot(&self) -> TransferStatsSnapshot {
        TransferStatsSnapshot {
            transfers_started: self.transfers_started.load(Ordering::Relaxed),
            transfers_completed: self.transfers_completed.load(Ordering::Relaxed),
            transfers_failed: self.transfers_failed.load(Ordering::Relaxed),
            total_bytes: self.total_bytes.load(Ordering::Relaxed),
            dedup_savings: self.dedup_savings.load(Ordering::Relaxed),
            compression_savings: self.compression_savings.load(Ordering::Relaxed),
        }
    }
}

/// Snapshot of transfer stats
#[derive(Debug, Clone)]
pub struct TransferStatsSnapshot {
    pub transfers_started: u64,
    pub transfers_completed: u64,
    pub transfers_failed: u64,
    pub total_bytes: u64,
    pub dedup_savings: u64,
    pub compression_savings: u64,
}

impl TransferStatsSnapshot {
    /// Calculate success rate
    pub fn success_rate(&self) -> f64 {
        let total = self.transfers_started;
        if total == 0 {
            100.0
        } else {
            (self.transfers_completed as f64 / total as f64) * 100.0
        }
    }

    /// Calculate overall savings percentage
    pub fn savings_percent(&self) -> f64 {
        let potential = self.total_bytes + self.dedup_savings + self.compression_savings;
        if potential == 0 {
            0.0
        } else {
            ((self.dedup_savings + self.compression_savings) as f64 / potential as f64) * 100.0
        }
    }
}

/// Bulk transfer coordinator
///
/// Manages high-performance transfers with dedup, compression, and parallelism.
pub struct BulkTransferCoordinator {
    /// Stream pool for parallel transfers
    stream_pool: Arc<StreamPool>,
    /// Dedup index for content-addressed chunks
    dedup_index: Arc<DedupIndex>,
    /// Buffer pool for zero-copy I/O
    buffer_pool: Arc<BufferPool>,
    /// Compressor for smart compression
    compressor: SmartCompressor,
    /// Configuration
    config: BulkTransferConfig,
    /// Statistics
    stats: Arc<TransferStats>,
    /// Next transfer ID
    next_transfer_id: AtomicU64,
}

impl BulkTransferCoordinator {
    /// Create a new bulk transfer coordinator
    pub fn new(
        stream_pool: Arc<StreamPool>,
        dedup_index: Arc<DedupIndex>,
        buffer_pool: Arc<BufferPool>,
    ) -> Self {
        Self {
            stream_pool,
            dedup_index,
            buffer_pool,
            compressor: SmartCompressor::new(),
            config: BulkTransferConfig::default(),
            stats: Arc::new(TransferStats::default()),
            next_transfer_id: AtomicU64::new(1),
        }
    }

    /// Create with custom configuration
    pub fn with_config(
        stream_pool: Arc<StreamPool>,
        dedup_index: Arc<DedupIndex>,
        buffer_pool: Arc<BufferPool>,
        config: BulkTransferConfig,
    ) -> Self {
        let compressor = SmartCompressor::with_level(config.compression_level);
        Self {
            stream_pool,
            dedup_index,
            buffer_pool,
            compressor,
            config,
            stats: Arc::new(TransferStats::default()),
            next_transfer_id: AtomicU64::new(1),
        }
    }

    /// Build a file manifest (list of content hashes)
    ///
    /// Reads the file and computes BLAKE3 hashes for each chunk.
    /// Takes an inode to associate with the manifest.
    pub fn build_manifest(&self, path: &Path, inode: Inode) -> std::io::Result<FileManifest> {
        use std::fs::File;
        use std::io::Read;

        let mut file = File::open(path)?;
        let metadata = file.metadata()?;
        let file_size = metadata.len();

        let mut chunks = Vec::new();
        let mut offset = 0u64;
        let chunk_size = self.config.chunk_size;

        // Allocate a buffer for reading (can't extract from PooledBuffer)
        let mut buf = vec![0u8; chunk_size];

        loop {
            let bytes_to_read = ((file_size - offset) as usize).min(chunk_size);
            if bytes_to_read == 0 {
                break;
            }

            let n = file.read(&mut buf[..bytes_to_read])?;
            if n == 0 {
                break;
            }

            let hash = ContentHash::compute(&buf[..n]);
            chunks.push(ContentChunk {
                hash,
                offset,
                size: n as u32,
            });

            offset += n as u64;
        }

        Ok(FileManifest {
            inode,
            total_size: file_size,
            chunks,
            file_hash: None, // Optionally compute later for verification
        })
    }

    /// Find chunks that are missing from our dedup index
    ///
    /// Returns hashes that need to be transferred.
    pub fn find_missing_chunks(&self, manifest: &FileManifest) -> Vec<ContentHash> {
        let hashes: Vec<ContentHash> = manifest.chunks.iter().map(|c| c.hash).collect();
        self.dedup_index.find_missing(&hashes)
    }

    /// Compress a chunk if beneficial
    pub fn compress_chunk(&self, path: &str, data: &[u8]) -> CompressionResult {
        if self.config.compression_enabled {
            self.compressor.compress_smart(path, data)
        } else {
            CompressionResult::Skipped {
                original_size: data.len(),
            }
        }
    }

    /// Register chunks in the dedup index after transfer
    pub fn register_chunks(&self, manifest: &FileManifest, base_path: &Path) {
        for chunk in &manifest.chunks {
            self.dedup_index.insert(
                chunk.hash,
                base_path.to_path_buf(),
                chunk.offset,
                chunk.size,
            );
        }
    }

    /// Calculate estimated transfer time
    pub fn estimate_transfer_time(&self, manifest: &FileManifest, speed_bps: f64) -> f64 {
        let missing = self.find_missing_chunks(manifest);
        let missing_bytes: u64 = manifest
            .chunks
            .iter()
            .filter(|c| missing.contains(&c.hash))
            .map(|c| c.size as u64)
            .sum();

        if speed_bps > 0.0 {
            missing_bytes as f64 / speed_bps
        } else {
            0.0
        }
    }

    /// Get statistics
    pub fn stats(&self) -> TransferStatsSnapshot {
        self.stats.snapshot()
    }

    /// Get the stream pool
    pub fn stream_pool(&self) -> &Arc<StreamPool> {
        &self.stream_pool
    }

    /// Get the dedup index
    pub fn dedup_index(&self) -> &Arc<DedupIndex> {
        &self.dedup_index
    }

    /// Generate next transfer ID
    pub fn next_transfer_id(&self) -> u64 {
        self.next_transfer_id.fetch_add(1, Ordering::Relaxed)
    }

    /// Create a transfer progress tracker
    pub fn create_progress(
        &self,
        transfer_id: u64,
        manifest: &FileManifest,
    ) -> TransferProgressTracker {
        TransferProgressTracker::new(
            transfer_id,
            manifest.total_size,
            manifest.chunks.len() as u32,
        )
    }
}

/// Tracks progress during a transfer
#[derive(Debug)]
pub struct TransferProgressTracker {
    transfer_id: u64,
    total_bytes: u64,
    total_chunks: u32,
    bytes_done: AtomicU64,
    chunks_done: AtomicU64,
    dedup_savings: AtomicU64,
    compression_savings: AtomicU64,
    start_time: Instant,
}

impl TransferProgressTracker {
    /// Create a new progress tracker
    pub fn new(transfer_id: u64, total_bytes: u64, total_chunks: u32) -> Self {
        Self {
            transfer_id,
            total_bytes,
            total_chunks,
            bytes_done: AtomicU64::new(0),
            chunks_done: AtomicU64::new(0),
            dedup_savings: AtomicU64::new(0),
            compression_savings: AtomicU64::new(0),
            start_time: Instant::now(),
        }
    }

    /// Record bytes transferred
    pub fn add_bytes(&self, bytes: u64) {
        self.bytes_done.fetch_add(bytes, Ordering::Relaxed);
    }

    /// Record chunk completed
    pub fn add_chunk(&self) {
        self.chunks_done.fetch_add(1, Ordering::Relaxed);
    }

    /// Record dedup savings
    pub fn add_dedup_savings(&self, bytes: u64) {
        self.dedup_savings.fetch_add(bytes, Ordering::Relaxed);
    }

    /// Record compression savings
    pub fn add_compression_savings(&self, bytes: u64) {
        self.compression_savings.fetch_add(bytes, Ordering::Relaxed);
    }

    /// Get current progress snapshot
    pub fn progress(&self) -> TransferProgress {
        let bytes_done = self.bytes_done.load(Ordering::Relaxed);
        let chunks_done = self.chunks_done.load(Ordering::Relaxed) as u32;
        let elapsed = self.start_time.elapsed().as_secs_f64();

        let speed_bps = if elapsed > 0.0 {
            bytes_done as f64 / elapsed
        } else {
            0.0
        };

        let remaining_bytes = self.total_bytes.saturating_sub(bytes_done);
        let eta_secs = if speed_bps > 0.0 {
            Some(remaining_bytes as f64 / speed_bps)
        } else {
            None
        };

        TransferProgress {
            transfer_id: self.transfer_id,
            total_bytes: self.total_bytes,
            bytes_done,
            speed_bps,
            eta_secs,
            chunks_done,
            total_chunks: self.total_chunks,
            dedup_savings: self.dedup_savings.load(Ordering::Relaxed),
            compression_savings: self.compression_savings.load(Ordering::Relaxed),
        }
    }

    /// Check if transfer is complete
    pub fn is_complete(&self) -> bool {
        self.chunks_done.load(Ordering::Relaxed) >= self.total_chunks as u64
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    fn create_test_coordinator() -> BulkTransferCoordinator {
        let stream_pool = Arc::new(StreamPool::new());
        let dedup_index = Arc::new(DedupIndex::new(1000));
        // BufferPool::new already returns Arc<BufferPool>, so don't wrap it again
        let buffer_pool = BufferPool::new(8, BULK_CHUNK_SIZE);

        BulkTransferCoordinator::new(stream_pool, dedup_index, buffer_pool)
    }

    #[test]
    fn test_build_manifest() {
        let coordinator = create_test_coordinator();

        // Create a test file
        let mut temp = NamedTempFile::new().unwrap();
        let data = "Hello, Wormhole! ".repeat(10000); // ~170KB
        temp.write_all(data.as_bytes()).unwrap();
        temp.flush().unwrap();

        let manifest = coordinator.build_manifest(temp.path(), 123).unwrap();

        assert!(manifest.chunks.len() >= 1);
        assert_eq!(manifest.total_size, data.len() as u64);
        assert_eq!(manifest.inode, 123);

        // Verify chunks are contiguous
        let mut expected_offset = 0u64;
        for chunk in &manifest.chunks {
            assert_eq!(chunk.offset, expected_offset);
            expected_offset += chunk.size as u64;
        }
        assert_eq!(expected_offset, manifest.total_size);
    }

    #[test]
    fn test_find_missing_chunks() {
        let coordinator = create_test_coordinator();

        // Create a manifest with some chunks
        let chunk1 = ContentChunk {
            hash: ContentHash::compute(b"chunk1"),
            offset: 0,
            size: 1000,
        };
        let chunk2 = ContentChunk {
            hash: ContentHash::compute(b"chunk2"),
            offset: 1000,
            size: 1000,
        };
        let chunk3 = ContentChunk {
            hash: ContentHash::compute(b"chunk3"),
            offset: 2000,
            size: 1000,
        };

        let manifest = FileManifest {
            inode: 1,
            total_size: 3000,
            chunks: vec![chunk1.clone(), chunk2.clone(), chunk3.clone()],
            file_hash: None,
        };

        // Register one chunk in dedup index
        coordinator
            .dedup_index
            .insert(chunk2.hash, "/test".into(), 0, 1000);

        // Find missing
        let missing = coordinator.find_missing_chunks(&manifest);
        assert_eq!(missing.len(), 2);
        assert!(missing.contains(&chunk1.hash));
        assert!(missing.contains(&chunk3.hash));
        assert!(!missing.contains(&chunk2.hash));
    }

    #[test]
    fn test_compression() {
        let coordinator = create_test_coordinator();

        // Compressible text
        let text = "Hello World! ".repeat(1000);
        let result = coordinator.compress_chunk("test.txt", text.as_bytes());
        assert!(result.is_compressed());

        // Already compressed format (simulated with extension)
        let result = coordinator.compress_chunk("video.mp4", text.as_bytes());
        assert!(!result.is_compressed());
    }

    #[test]
    fn test_progress_tracker() {
        let tracker = TransferProgressTracker::new(1, 10000, 10);

        tracker.add_bytes(2500);
        tracker.add_chunk();
        tracker.add_dedup_savings(500);

        let progress = tracker.progress();
        assert_eq!(progress.transfer_id, 1);
        assert_eq!(progress.bytes_done, 2500);
        assert_eq!(progress.chunks_done, 1);
        assert_eq!(progress.dedup_savings, 500);
        assert!((progress.percent() - 25.0).abs() < 0.1);
    }

    #[test]
    fn test_progress_speed_formatting() {
        let progress = TransferProgress {
            transfer_id: 1,
            total_bytes: 1_000_000,
            bytes_done: 500_000,
            speed_bps: 150_000_000.0, // 150 MB/s
            eta_secs: Some(3.33),
            chunks_done: 5,
            total_chunks: 10,
            dedup_savings: 100_000,
            compression_savings: 50_000,
        };

        assert!(progress.speed_human().contains("MB/s"));
    }

    #[test]
    fn test_transfer_stats() {
        let coordinator = create_test_coordinator();

        // Record some stats
        coordinator.stats.transfers_started.fetch_add(10, Ordering::Relaxed);
        coordinator.stats.transfers_completed.fetch_add(8, Ordering::Relaxed);
        coordinator.stats.total_bytes.fetch_add(1_000_000, Ordering::Relaxed);
        coordinator.stats.dedup_savings.fetch_add(200_000, Ordering::Relaxed);

        let snapshot = coordinator.stats();
        assert_eq!(snapshot.transfers_started, 10);
        assert_eq!(snapshot.transfers_completed, 8);
        assert!((snapshot.success_rate() - 80.0).abs() < 0.1);
    }

    #[test]
    fn test_transfer_result_summary() {
        let result = TransferResult {
            bytes_transferred: 100_000_000,
            duration_secs: 2.5,
            avg_speed_bps: 40_000_000.0,
            chunks_transferred: 25,
            chunks_deduped: 5,
            compression_ratio: 1.5,
            dedup_savings: 20_000_000,
        };

        let summary = result.summary();
        assert!(summary.contains("25 chunks"));
        assert!(summary.contains("2.50s"));
        assert!(summary.contains("Deduped: 5"));
    }

    #[test]
    fn test_estimate_transfer_time() {
        let coordinator = create_test_coordinator();

        let manifest = FileManifest {
            inode: 1,
            total_size: 100_000_000, // 100 MB
            chunks: vec![
                ContentChunk {
                    hash: ContentHash::compute(b"1"),
                    offset: 0,
                    size: 50_000_000,
                },
                ContentChunk {
                    hash: ContentHash::compute(b"2"),
                    offset: 50_000_000,
                    size: 50_000_000,
                },
            ],
            file_hash: None,
        };

        // At 100 MB/s, 100 MB should take ~1 second
        let eta = coordinator.estimate_transfer_time(&manifest, 100_000_000.0);
        assert!((eta - 1.0).abs() < 0.1);
    }
}
