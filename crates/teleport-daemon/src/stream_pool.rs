//! Phase 8: Parallel QUIC Stream Pool
//!
//! Manages multiple concurrent QUIC streams for bulk data transfer.
//! Automatically tunes the number of streams based on bandwidth-delay product.
//!
//! # Design
//! - Pool of bidirectional QUIC streams for parallel transfers
//! - Round-robin distribution of chunks across streams
//! - BDP-based auto-tuning for optimal concurrency
//! - Backpressure when all streams are busy
//!
//! # Performance Targets
//! - Saturate 10Gbps links with ~64 streams
//! - Scale from 4 (local network) to 256 (high-latency WAN)

use parking_lot::{Mutex, RwLock};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Instant;

/// Minimum number of parallel streams
pub const MIN_STREAMS: usize = 4;

/// Maximum number of parallel streams
pub const MAX_STREAMS: usize = 256;

/// Default number of streams for initial connection
pub const DEFAULT_STREAMS: usize = 16;

/// Stream handle for chunk transfer
#[derive(Debug)]
pub struct StreamHandle {
    /// Stream identifier
    pub id: u64,
    /// When this stream was last used
    pub last_used: Instant,
    /// Bytes transferred on this stream
    pub bytes_transferred: u64,
}

/// Pooled stream guard - returns stream to pool on drop
pub struct PooledStream<'a> {
    handle: Option<StreamHandle>,
    pool: &'a StreamPool,
}

impl<'a> PooledStream<'a> {
    /// Get the stream ID
    pub fn id(&self) -> u64 {
        self.handle.as_ref().map(|h| h.id).unwrap_or(0)
    }

    /// Record bytes transferred on this stream
    pub fn record_bytes(&mut self, bytes: u64) {
        if let Some(ref mut handle) = self.handle {
            handle.bytes_transferred += bytes;
        }
    }
}

impl Drop for PooledStream<'_> {
    fn drop(&mut self) {
        if let Some(mut handle) = self.handle.take() {
            handle.last_used = Instant::now();
            self.pool.return_stream(handle);
        }
    }
}

/// Stream pool configuration
#[derive(Debug, Clone)]
pub struct StreamPoolConfig {
    /// Initial number of streams
    pub initial_streams: usize,
    /// Minimum streams to maintain
    pub min_streams: usize,
    /// Maximum streams allowed
    pub max_streams: usize,
    /// Enable BDP-based auto-tuning
    pub auto_tune: bool,
}

impl Default for StreamPoolConfig {
    fn default() -> Self {
        Self {
            initial_streams: DEFAULT_STREAMS,
            min_streams: MIN_STREAMS,
            max_streams: MAX_STREAMS,
            auto_tune: true,
        }
    }
}

/// Statistics for stream pool monitoring
#[derive(Debug, Default)]
pub struct StreamPoolStats {
    /// Total acquire operations
    pub acquires: AtomicU64,
    /// Times all streams were busy (backpressure)
    pub backpressure_events: AtomicU64,
    /// Total bytes transferred across all streams
    pub total_bytes: AtomicU64,
    /// Current active (in-use) streams
    pub active_streams: AtomicUsize,
    /// Current target stream count
    pub target_streams: AtomicUsize,
}

/// Parallel QUIC stream pool for bulk transfers.
///
/// Manages a pool of bidirectional streams and distributes work across them.
pub struct StreamPool {
    /// Available streams (not currently in use)
    available: Mutex<VecDeque<StreamHandle>>,

    /// Current target stream count
    target_streams: AtomicUsize,

    /// Configuration
    config: StreamPoolConfig,

    /// Statistics
    stats: Arc<StreamPoolStats>,

    /// Network measurements for BDP tuning
    measurements: RwLock<NetworkMeasurements>,

    /// Next stream ID to allocate
    next_id: AtomicU64,
}

/// Network measurements for adaptive tuning
#[derive(Debug, Clone)]
struct NetworkMeasurements {
    /// Estimated bandwidth in bytes/sec
    bandwidth_bps: f64,
    /// Round-trip time in milliseconds
    rtt_ms: f64,
    /// Last measurement time
    last_update: Instant,
}

impl Default for NetworkMeasurements {
    fn default() -> Self {
        Self {
            bandwidth_bps: 100_000_000.0, // 100 MB/s default assumption
            rtt_ms: 10.0,                 // 10ms default RTT
            last_update: Instant::now(),
        }
    }
}

impl StreamPool {
    /// Create a new stream pool with default configuration
    pub fn new() -> Self {
        Self::with_config(StreamPoolConfig::default())
    }

    /// Create a stream pool with custom configuration
    pub fn with_config(config: StreamPoolConfig) -> Self {
        let initial = config.initial_streams.clamp(config.min_streams, config.max_streams);

        // Pre-allocate initial streams
        let mut available = VecDeque::with_capacity(initial);
        for id in 0..initial as u64 {
            available.push_back(StreamHandle {
                id,
                last_used: Instant::now(),
                bytes_transferred: 0,
            });
        }

        let stats = Arc::new(StreamPoolStats::default());
        stats.target_streams.store(initial, Ordering::Relaxed);

        Self {
            available: Mutex::new(available),
            target_streams: AtomicUsize::new(initial),
            config,
            stats,
            measurements: RwLock::new(NetworkMeasurements::default()),
            next_id: AtomicU64::new(initial as u64),
        }
    }

    /// Try to acquire a stream from the pool (non-blocking)
    ///
    /// Returns None if all streams are busy (backpressure)
    pub fn try_acquire(&self) -> Option<PooledStream<'_>> {
        let mut available = self.available.lock();

        if let Some(handle) = available.pop_front() {
            self.stats.acquires.fetch_add(1, Ordering::Relaxed);
            self.stats.active_streams.fetch_add(1, Ordering::Relaxed);

            Some(PooledStream {
                handle: Some(handle),
                pool: self,
            })
        } else {
            self.stats
                .backpressure_events
                .fetch_add(1, Ordering::Relaxed);
            None
        }
    }

    /// Acquire a stream, creating a new one if pool is exhausted and under limit
    pub fn acquire_or_create(&self) -> Option<PooledStream<'_>> {
        // First try to get an existing stream
        if let Some(stream) = self.try_acquire() {
            return Some(stream);
        }

        // If under target, create a new stream
        let current = self.current_stream_count();
        let target = self.target_streams.load(Ordering::Relaxed);

        if current < target && current < self.config.max_streams {
            let new_id = self.next_id.fetch_add(1, Ordering::Relaxed);
            let handle = StreamHandle {
                id: new_id,
                last_used: Instant::now(),
                bytes_transferred: 0,
            };

            self.stats.acquires.fetch_add(1, Ordering::Relaxed);
            self.stats.active_streams.fetch_add(1, Ordering::Relaxed);

            return Some(PooledStream {
                handle: Some(handle),
                pool: self,
            });
        }

        // Can't acquire or create - backpressure
        self.stats
            .backpressure_events
            .fetch_add(1, Ordering::Relaxed);
        None
    }

    /// Return a stream to the pool
    fn return_stream(&self, handle: StreamHandle) {
        self.stats
            .total_bytes
            .fetch_add(handle.bytes_transferred, Ordering::Relaxed);
        self.stats.active_streams.fetch_sub(1, Ordering::Relaxed);

        let mut available = self.available.lock();
        available.push_back(StreamHandle {
            bytes_transferred: 0, // Reset for next use
            ..handle
        });
    }

    /// Update network measurements and tune stream count
    ///
    /// Call this periodically with observed bandwidth and RTT
    pub fn update_measurements(&self, bandwidth_bps: f64, rtt_ms: f64) {
        if !self.config.auto_tune {
            return;
        }

        // Update measurements
        {
            let mut measurements = self.measurements.write();
            measurements.bandwidth_bps = bandwidth_bps;
            measurements.rtt_ms = rtt_ms;
            measurements.last_update = Instant::now();
        }

        // Calculate optimal streams based on BDP
        let optimal = self.calculate_optimal_streams(bandwidth_bps, rtt_ms);
        let clamped = optimal.clamp(self.config.min_streams, self.config.max_streams);

        self.target_streams.store(clamped, Ordering::Relaxed);
        self.stats.target_streams.store(clamped, Ordering::Relaxed);
    }

    /// Calculate optimal stream count based on bandwidth-delay product
    ///
    /// BDP = bandwidth × RTT gives the amount of data "in flight"
    /// We want enough streams that each can fill the pipe
    fn calculate_optimal_streams(&self, bandwidth_bps: f64, rtt_ms: f64) -> usize {
        // Bandwidth-delay product in bytes
        let bdp_bytes = (bandwidth_bps / 8.0) * (rtt_ms / 1000.0);

        // Assume 4MB chunk size for bulk transfers
        let chunk_size = 4.0 * 1024.0 * 1024.0;

        // Number of chunks needed to fill the BDP
        let optimal = (bdp_bytes / chunk_size).ceil() as usize;

        // Add some headroom for variability
        optimal.saturating_add(2)
    }

    /// Get current number of allocated streams (available + in-use)
    pub fn current_stream_count(&self) -> usize {
        let available = self.available.lock().len();
        let active = self.stats.active_streams.load(Ordering::Relaxed);
        available + active
    }

    /// Get target stream count
    pub fn target_stream_count(&self) -> usize {
        self.target_streams.load(Ordering::Relaxed)
    }

    /// Get number of available (idle) streams
    pub fn available_count(&self) -> usize {
        self.available.lock().len()
    }

    /// Get number of active (in-use) streams
    pub fn active_count(&self) -> usize {
        self.stats.active_streams.load(Ordering::Relaxed)
    }

    /// Get statistics snapshot
    pub fn stats(&self) -> StreamPoolStatsSnapshot {
        StreamPoolStatsSnapshot {
            acquires: self.stats.acquires.load(Ordering::Relaxed),
            backpressure_events: self.stats.backpressure_events.load(Ordering::Relaxed),
            total_bytes: self.stats.total_bytes.load(Ordering::Relaxed),
            active_streams: self.stats.active_streams.load(Ordering::Relaxed),
            target_streams: self.stats.target_streams.load(Ordering::Relaxed),
            available_streams: self.available.lock().len(),
        }
    }
}

impl Default for StreamPool {
    fn default() -> Self {
        Self::new()
    }
}

/// Snapshot of stream pool statistics
#[derive(Debug, Clone)]
pub struct StreamPoolStatsSnapshot {
    pub acquires: u64,
    pub backpressure_events: u64,
    pub total_bytes: u64,
    pub active_streams: usize,
    pub target_streams: usize,
    pub available_streams: usize,
}

impl StreamPoolStatsSnapshot {
    /// Calculate utilization (active / target)
    pub fn utilization(&self) -> f64 {
        if self.target_streams == 0 {
            0.0
        } else {
            self.active_streams as f64 / self.target_streams as f64
        }
    }

    /// Calculate backpressure rate
    pub fn backpressure_rate(&self) -> f64 {
        let total = self.acquires + self.backpressure_events;
        if total == 0 {
            0.0
        } else {
            self.backpressure_events as f64 / total as f64
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_acquire_release() {
        let pool = StreamPool::new();

        // Acquire a stream
        let stream = pool.try_acquire().expect("should get stream");
        assert_eq!(pool.active_count(), 1);

        // Release it
        drop(stream);
        assert_eq!(pool.active_count(), 0);
    }

    #[test]
    fn test_pool_capacity() {
        let config = StreamPoolConfig {
            initial_streams: 4,
            min_streams: 2,
            max_streams: 8,
            auto_tune: false,
        };
        let pool = StreamPool::with_config(config);

        // Should have 4 initial streams
        assert_eq!(pool.current_stream_count(), 4);

        // Acquire all 4
        let streams: Vec<_> = (0..4).filter_map(|_| pool.try_acquire()).collect();
        assert_eq!(streams.len(), 4);
        assert_eq!(pool.active_count(), 4);
        assert_eq!(pool.available_count(), 0);

        // 5th acquire should fail (backpressure)
        assert!(pool.try_acquire().is_none());
    }

    #[test]
    fn test_acquire_or_create() {
        let config = StreamPoolConfig {
            initial_streams: 2,
            min_streams: 2,
            max_streams: 4,
            auto_tune: false,
        };
        let pool = StreamPool::with_config(config);

        // Acquire all initial streams
        let _s1 = pool.acquire_or_create().expect("should get stream");
        let _s2 = pool.acquire_or_create().expect("should get stream");
        assert_eq!(pool.active_count(), 2);

        // Set target higher to allow creation
        pool.target_streams.store(4, Ordering::Relaxed);

        // Should create new streams up to target
        let _s3 = pool.acquire_or_create().expect("should create stream");
        let _s4 = pool.acquire_or_create().expect("should create stream");
        assert_eq!(pool.active_count(), 4);

        // 5th should fail (at max_streams)
        assert!(pool.acquire_or_create().is_none());
    }

    #[test]
    fn test_bdp_tuning() {
        let pool = StreamPool::new();

        // High bandwidth, low latency (local network)
        // 1 Gbps, 1ms RTT → BDP ≈ 125KB → ~1 chunk → few streams
        pool.update_measurements(1_000_000_000.0, 1.0);
        assert!(pool.target_stream_count() <= 8);

        // High bandwidth, high latency (WAN)
        // 1 Gbps, 100ms RTT → BDP ≈ 12.5MB → ~4 chunks → more streams
        pool.update_measurements(1_000_000_000.0, 100.0);
        assert!(pool.target_stream_count() >= 4);

        // Very high latency should push toward max
        pool.update_measurements(10_000_000_000.0, 200.0); // 10 Gbps, 200ms
        assert!(pool.target_stream_count() >= 8);
    }

    #[test]
    fn test_stats() {
        let pool = StreamPool::with_config(StreamPoolConfig {
            initial_streams: 2,
            auto_tune: false,
            ..Default::default()
        });

        // Acquire and release
        let mut stream = pool.try_acquire().expect("should get stream");
        stream.record_bytes(1024);
        drop(stream);

        let stats = pool.stats();
        assert_eq!(stats.acquires, 1);
        assert_eq!(stats.total_bytes, 1024);
        assert_eq!(stats.active_streams, 0);
        assert_eq!(stats.backpressure_events, 0);
    }

    #[test]
    fn test_backpressure_tracking() {
        let config = StreamPoolConfig {
            initial_streams: 1,
            min_streams: 1,
            max_streams: 1,
            auto_tune: false,
        };
        let pool = StreamPool::with_config(config);

        // Hold the only stream
        let _held = pool.try_acquire().expect("should get stream");

        // Try to acquire again - should trigger backpressure
        assert!(pool.try_acquire().is_none());
        assert!(pool.try_acquire().is_none());

        let stats = pool.stats();
        assert_eq!(stats.backpressure_events, 2);
        assert!((stats.backpressure_rate() - 0.666).abs() < 0.01);
    }

    #[test]
    fn test_stream_handle_bytes() {
        let pool = StreamPool::new();

        let mut stream = pool.try_acquire().expect("should get stream");
        stream.record_bytes(1000);
        stream.record_bytes(2000);
        drop(stream);

        let stats = pool.stats();
        assert_eq!(stats.total_bytes, 3000);
    }

    #[test]
    fn test_concurrent_access() {
        use std::sync::Arc;
        use std::thread;
        use std::time::Duration;

        let pool = Arc::new(StreamPool::with_config(StreamPoolConfig {
            initial_streams: 8,
            max_streams: 16,
            auto_tune: false,
            ..Default::default()
        }));

        let mut handles = vec![];

        for _ in 0..8 {
            let pool = Arc::clone(&pool);
            handles.push(thread::spawn(move || {
                for _ in 0..100 {
                    if let Some(mut stream) = pool.try_acquire() {
                        stream.record_bytes(1024);
                        // Hold briefly
                        thread::sleep(Duration::from_micros(10));
                    }
                }
            }));
        }

        for handle in handles {
            handle.join().expect("thread panicked");
        }

        // All streams should be returned
        assert_eq!(pool.active_count(), 0);
        assert!(pool.stats().total_bytes > 0);
    }
}
