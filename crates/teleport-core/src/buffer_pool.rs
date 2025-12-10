//! Phase 8: Buffer Pool for Zero-Copy Transfers
//!
//! Provides pooled buffer management to eliminate per-chunk allocations.
//! Supports both bulk transfers (4MB buffers) and random access (128KB buffers).

use parking_lot::Mutex;
use std::ops::{Deref, DerefMut};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

/// Bulk transfer chunk size (4 MB) - optimal for sustained throughput
pub const BULK_CHUNK_SIZE: usize = 4 * 1024 * 1024;

/// Random access chunk size (128 KB) - matches existing CHUNK_SIZE
pub const RANDOM_CHUNK_SIZE: usize = 128 * 1024;

/// Default maximum number of bulk buffers (256 MB total)
pub const DEFAULT_MAX_BULK_BUFFERS: usize = 64;

/// Default maximum number of random access buffers (64 MB total)
pub const DEFAULT_MAX_RANDOM_BUFFERS: usize = 512;

/// A pool of reusable byte buffers to eliminate allocation overhead.
///
/// The pool maintains a fixed set of buffers that are acquired and released
/// rather than allocated and deallocated. When the pool is exhausted,
/// `acquire()` returns `None` to apply backpressure.
pub struct BufferPool {
    /// Available buffers ready to be acquired
    pool: Mutex<Vec<Vec<u8>>>,
    /// Size of each buffer in the pool
    buffer_size: usize,
    /// Maximum number of buffers allowed
    max_buffers: usize,
    /// Current number of allocated buffers (in pool + in use)
    allocated: AtomicUsize,
    /// Statistics: total acquisitions
    total_acquisitions: AtomicUsize,
    /// Statistics: cache hits (acquired from pool)
    cache_hits: AtomicUsize,
}

impl BufferPool {
    /// Creates a new buffer pool with the specified configuration.
    ///
    /// # Arguments
    /// * `max_buffers` - Maximum number of buffers the pool can hold
    /// * `buffer_size` - Size of each buffer in bytes
    ///
    /// # Example
    /// ```
    /// use teleport_core::buffer_pool::{BufferPool, BULK_CHUNK_SIZE};
    ///
    /// // Create a pool for bulk transfers (64 x 4MB = 256MB max)
    /// let pool = BufferPool::new(64, BULK_CHUNK_SIZE);
    /// ```
    pub fn new(max_buffers: usize, buffer_size: usize) -> Arc<Self> {
        Arc::new(Self {
            pool: Mutex::new(Vec::with_capacity(max_buffers)),
            buffer_size,
            max_buffers,
            allocated: AtomicUsize::new(0),
            total_acquisitions: AtomicUsize::new(0),
            cache_hits: AtomicUsize::new(0),
        })
    }

    /// Creates a pool optimized for bulk transfers (4MB buffers).
    pub fn new_bulk() -> Arc<Self> {
        Self::new(DEFAULT_MAX_BULK_BUFFERS, BULK_CHUNK_SIZE)
    }

    /// Creates a pool optimized for random access (128KB buffers).
    pub fn new_random() -> Arc<Self> {
        Self::new(DEFAULT_MAX_RANDOM_BUFFERS, RANDOM_CHUNK_SIZE)
    }

    /// Attempts to acquire a buffer from the pool.
    ///
    /// Returns `None` if the pool is exhausted (backpressure).
    /// The buffer is automatically returned to the pool when dropped.
    ///
    /// # Example
    /// ```
    /// use teleport_core::buffer_pool::BufferPool;
    ///
    /// let pool = BufferPool::new(4, 1024);
    /// if let Some(mut buf) = pool.try_acquire() {
    ///     buf[0] = 42;
    ///     // Buffer is returned to pool when `buf` goes out of scope
    /// }
    /// ```
    pub fn try_acquire(self: &Arc<Self>) -> Option<PooledBuffer> {
        self.total_acquisitions.fetch_add(1, Ordering::Relaxed);

        // Try to get a buffer from the pool first
        {
            let mut pool = self.pool.lock();
            if let Some(buffer) = pool.pop() {
                self.cache_hits.fetch_add(1, Ordering::Relaxed);
                return Some(PooledBuffer {
                    buffer: Some(buffer),
                    pool: Arc::clone(self),
                });
            }
        }

        // Pool is empty - try to allocate a new buffer
        let current = self.allocated.load(Ordering::Relaxed);
        if current >= self.max_buffers {
            // Pool exhausted - apply backpressure
            return None;
        }

        // Try to increment allocated count
        if self
            .allocated
            .compare_exchange(current, current + 1, Ordering::SeqCst, Ordering::Relaxed)
            .is_ok()
        {
            // Successfully reserved a slot - allocate the buffer
            let buffer = vec![0u8; self.buffer_size];
            return Some(PooledBuffer {
                buffer: Some(buffer),
                pool: Arc::clone(self),
            });
        }

        // Lost the race - try again
        self.try_acquire()
    }

    /// Acquires a buffer, waiting if the pool is exhausted.
    ///
    /// This is an async version that will yield until a buffer becomes available.
    pub async fn acquire(self: &Arc<Self>) -> PooledBuffer {
        loop {
            if let Some(buf) = self.try_acquire() {
                return buf;
            }
            // Yield to allow other tasks to release buffers
            tokio::task::yield_now().await;
        }
    }

    /// Returns a buffer to the pool.
    fn release(&self, mut buffer: Vec<u8>) {
        // Clear buffer contents for security (optional, can be disabled for performance)
        buffer.fill(0);

        let mut pool = self.pool.lock();
        if pool.len() < self.max_buffers {
            pool.push(buffer);
        }
        // If pool is full, buffer is dropped (shouldn't happen normally)
    }

    /// Returns the size of buffers in this pool.
    pub fn buffer_size(&self) -> usize {
        self.buffer_size
    }

    /// Returns the maximum number of buffers allowed.
    pub fn max_buffers(&self) -> usize {
        self.max_buffers
    }

    /// Returns the current number of allocated buffers.
    pub fn allocated(&self) -> usize {
        self.allocated.load(Ordering::Relaxed)
    }

    /// Returns the number of buffers currently available in the pool.
    pub fn available(&self) -> usize {
        self.pool.lock().len()
    }

    /// Returns the number of buffers currently in use.
    pub fn in_use(&self) -> usize {
        self.allocated() - self.available()
    }

    /// Returns pool statistics.
    pub fn stats(&self) -> BufferPoolStats {
        let total = self.total_acquisitions.load(Ordering::Relaxed);
        let hits = self.cache_hits.load(Ordering::Relaxed);
        BufferPoolStats {
            total_acquisitions: total,
            cache_hits: hits,
            hit_rate: if total > 0 {
                hits as f64 / total as f64
            } else {
                0.0
            },
            allocated: self.allocated(),
            available: self.available(),
            in_use: self.in_use(),
        }
    }
}

/// Statistics for a buffer pool.
#[derive(Debug, Clone)]
pub struct BufferPoolStats {
    /// Total number of acquisition attempts
    pub total_acquisitions: usize,
    /// Number of acquisitions served from the pool (no allocation)
    pub cache_hits: usize,
    /// Cache hit rate (0.0 - 1.0)
    pub hit_rate: f64,
    /// Total number of allocated buffers
    pub allocated: usize,
    /// Number of buffers available in the pool
    pub available: usize,
    /// Number of buffers currently in use
    pub in_use: usize,
}

/// A buffer acquired from a pool that is automatically returned when dropped.
pub struct PooledBuffer {
    buffer: Option<Vec<u8>>,
    pool: Arc<BufferPool>,
}

impl PooledBuffer {
    /// Returns the length of the buffer.
    pub fn len(&self) -> usize {
        self.buffer.as_ref().map(|b| b.len()).unwrap_or(0)
    }

    /// Returns true if the buffer is empty.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Returns the buffer capacity.
    pub fn capacity(&self) -> usize {
        self.buffer.as_ref().map(|b| b.capacity()).unwrap_or(0)
    }

    /// Resizes the buffer, filling new space with zeros.
    ///
    /// Note: Growing beyond pool buffer size is not recommended.
    pub fn resize(&mut self, new_len: usize) {
        if let Some(ref mut buffer) = self.buffer {
            buffer.resize(new_len, 0);
        }
    }

    /// Truncates the buffer to the specified length.
    pub fn truncate(&mut self, len: usize) {
        if let Some(ref mut buffer) = self.buffer {
            buffer.truncate(len);
        }
    }

    /// Clears the buffer (sets length to 0, keeps capacity).
    pub fn clear(&mut self) {
        if let Some(ref mut buffer) = self.buffer {
            buffer.clear();
        }
    }

    /// Returns a slice of the buffer from 0 to `len`.
    pub fn as_slice(&self, len: usize) -> &[u8] {
        self.buffer
            .as_ref()
            .map(|b| &b[..len.min(b.len())])
            .unwrap_or(&[])
    }
}

impl Deref for PooledBuffer {
    type Target = [u8];

    fn deref(&self) -> &Self::Target {
        self.buffer.as_ref().map(|b| b.as_slice()).unwrap_or(&[])
    }
}

impl DerefMut for PooledBuffer {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.buffer
            .as_mut()
            .map(|b| b.as_mut_slice())
            .unwrap_or(&mut [])
    }
}

impl Drop for PooledBuffer {
    fn drop(&mut self) {
        if let Some(buffer) = self.buffer.take() {
            self.pool.release(buffer);
        }
    }
}

impl std::fmt::Debug for PooledBuffer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PooledBuffer")
            .field("len", &self.len())
            .field("capacity", &self.capacity())
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pool_creation() {
        let pool = BufferPool::new(4, 1024);
        assert_eq!(pool.buffer_size(), 1024);
        assert_eq!(pool.max_buffers(), 4);
        assert_eq!(pool.allocated(), 0);
    }

    #[test]
    fn test_acquire_and_release() {
        let pool = BufferPool::new(2, 1024);

        // Acquire first buffer
        let buf1 = pool.try_acquire().expect("should acquire first buffer");
        assert_eq!(buf1.len(), 1024);
        assert_eq!(pool.allocated(), 1);
        assert_eq!(pool.in_use(), 1);

        // Acquire second buffer
        let buf2 = pool.try_acquire().expect("should acquire second buffer");
        assert_eq!(pool.allocated(), 2);
        assert_eq!(pool.in_use(), 2);

        // Pool should be exhausted
        assert!(pool.try_acquire().is_none());

        // Drop first buffer
        drop(buf1);
        assert_eq!(pool.allocated(), 2);
        assert_eq!(pool.in_use(), 1);
        assert_eq!(pool.available(), 1);

        // Should be able to acquire again (reuse)
        let _buf3 = pool.try_acquire().expect("should reuse buffer");
        assert_eq!(pool.allocated(), 2); // No new allocation

        drop(buf2);
    }

    #[test]
    fn test_buffer_modification() {
        let pool = BufferPool::new(1, 1024);
        let mut buf = pool.try_acquire().unwrap();

        // Write to buffer
        buf[0] = 42;
        buf[1] = 43;
        assert_eq!(buf[0], 42);
        assert_eq!(buf[1], 43);
    }

    #[test]
    fn test_stats() {
        let pool = BufferPool::new(2, 1024);

        // Initial stats
        let stats = pool.stats();
        assert_eq!(stats.total_acquisitions, 0);
        assert_eq!(stats.cache_hits, 0);

        // First acquisition (new allocation)
        let buf1 = pool.try_acquire().unwrap();
        let stats = pool.stats();
        assert_eq!(stats.total_acquisitions, 1);
        assert_eq!(stats.cache_hits, 0);

        // Return buffer
        drop(buf1);

        // Second acquisition (cache hit)
        let _buf2 = pool.try_acquire().unwrap();
        let stats = pool.stats();
        assert_eq!(stats.total_acquisitions, 2);
        assert_eq!(stats.cache_hits, 1);
        assert!((stats.hit_rate - 0.5).abs() < 0.001);
    }

    #[test]
    fn test_bulk_pool() {
        let pool = BufferPool::new_bulk();
        assert_eq!(pool.buffer_size(), BULK_CHUNK_SIZE);
        assert_eq!(pool.max_buffers(), DEFAULT_MAX_BULK_BUFFERS);
    }

    #[test]
    fn test_random_pool() {
        let pool = BufferPool::new_random();
        assert_eq!(pool.buffer_size(), RANDOM_CHUNK_SIZE);
        assert_eq!(pool.max_buffers(), DEFAULT_MAX_RANDOM_BUFFERS);
    }
}
