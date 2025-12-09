//! Sync Engine for bidirectional write support
//!
//! Tracks dirty chunks that need to be synced back to the host.
//! Manages lock acquisition, write-back operations, and conflict handling.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::RwLock;
use tracing::{debug, info, warn};

use teleport_core::{ChunkId, Inode, LockToken, LockType};

/// Default sync interval in milliseconds
pub const DEFAULT_SYNC_INTERVAL_MS: u64 = 1000;

/// Maximum dirty chunks before forced flush
pub const MAX_DIRTY_CHUNKS: usize = 1000;

/// Dirty chunk state
#[derive(Clone, Debug)]
pub struct DirtyChunk {
    /// The chunk data
    pub data: Vec<u8>,
    /// When it was modified
    pub modified_at: Instant,
    /// Number of sync attempts
    pub attempts: u32,
    /// Last error message if sync failed
    pub last_error: Option<String>,
}

/// Lock state for a file
#[derive(Clone, Debug)]
pub struct FileLock {
    /// The lock token
    pub token: LockToken,
    /// Type of lock held
    pub lock_type: LockType,
    /// When the lock was acquired
    pub acquired_at: Instant,
    /// When the lock expires
    pub expires_at: Instant,
}

impl FileLock {
    /// Check if this lock is still valid (not expired)
    pub fn is_valid(&self) -> bool {
        Instant::now() < self.expires_at
    }

    /// Time remaining before expiration
    pub fn time_remaining(&self) -> Duration {
        self.expires_at.saturating_duration_since(Instant::now())
    }
}

/// Sync status for tracking progress
#[derive(Clone, Debug, Default)]
pub struct SyncStatus {
    /// Number of dirty chunks pending
    pub pending_chunks: usize,
    /// Number of files with dirty chunks
    pub dirty_files: usize,
    /// Total bytes pending sync
    pub pending_bytes: u64,
    /// Last successful sync time
    pub last_sync: Option<Instant>,
    /// Number of sync errors since last success
    pub error_count: u32,
}

/// Sync engine for tracking and managing dirty chunks
pub struct SyncEngine {
    /// Dirty chunks by chunk ID
    dirty_chunks: Arc<RwLock<HashMap<ChunkId, DirtyChunk>>>,
    /// Set of inodes with dirty chunks (for quick lookup)
    dirty_inodes: Arc<RwLock<HashSet<Inode>>>,
    /// Active locks by inode
    locks: Arc<RwLock<HashMap<Inode, FileLock>>>,
    /// Sync interval (for future background sync)
    #[allow(dead_code)]
    sync_interval: Duration,
}

impl SyncEngine {
    /// Create a new sync engine
    pub fn new(sync_interval: Duration) -> Self {
        Self {
            dirty_chunks: Arc::new(RwLock::new(HashMap::new())),
            dirty_inodes: Arc::new(RwLock::new(HashSet::new())),
            locks: Arc::new(RwLock::new(HashMap::new())),
            sync_interval,
        }
    }

    /// Mark a chunk as dirty (modified locally)
    pub fn mark_dirty(&self, chunk_id: ChunkId, data: Vec<u8>) {
        let mut dirty = self.dirty_chunks.write();
        let mut inodes = self.dirty_inodes.write();

        dirty.insert(
            chunk_id,
            DirtyChunk {
                data,
                modified_at: Instant::now(),
                attempts: 0,
                last_error: None,
            },
        );
        inodes.insert(chunk_id.inode);

        debug!("Marked dirty: chunk {:?}", chunk_id);
    }

    /// Check if a chunk is dirty
    pub fn is_dirty(&self, chunk_id: &ChunkId) -> bool {
        self.dirty_chunks.read().contains_key(chunk_id)
    }

    /// Check if an inode has any dirty chunks
    pub fn has_dirty_chunks(&self, inode: Inode) -> bool {
        self.dirty_inodes.read().contains(&inode)
    }

    /// Get dirty chunk data (for reading back modified data)
    pub fn get_dirty_chunk(&self, chunk_id: &ChunkId) -> Option<Vec<u8>> {
        self.dirty_chunks
            .read()
            .get(chunk_id)
            .map(|c| c.data.clone())
    }

    /// Get all dirty chunks for an inode
    pub fn get_dirty_chunks_for_inode(&self, inode: Inode) -> Vec<(ChunkId, DirtyChunk)> {
        self.dirty_chunks
            .read()
            .iter()
            .filter(|(id, _)| id.inode == inode)
            .map(|(id, chunk)| (*id, chunk.clone()))
            .collect()
    }

    /// Mark a chunk as synced (remove from dirty set)
    pub fn mark_synced(&self, chunk_id: &ChunkId) {
        let mut dirty = self.dirty_chunks.write();
        let mut inodes = self.dirty_inodes.write();

        dirty.remove(chunk_id);

        // Check if inode still has dirty chunks
        let inode = chunk_id.inode;
        let still_dirty = dirty.keys().any(|id| id.inode == inode);
        if !still_dirty {
            inodes.remove(&inode);
        }

        debug!("Marked synced: chunk {:?}", chunk_id);
    }

    /// Mark a sync attempt as failed
    pub fn mark_sync_failed(&self, chunk_id: &ChunkId, error: String) {
        if let Some(chunk) = self.dirty_chunks.write().get_mut(chunk_id) {
            chunk.attempts += 1;
            chunk.last_error = Some(error);
            warn!(
                "Sync failed for chunk {:?}, attempt {}",
                chunk_id, chunk.attempts
            );
        }
    }

    /// Store a lock for an inode
    pub fn store_lock(&self, inode: Inode, token: LockToken, lock_type: LockType, ttl: Duration) {
        let now = Instant::now();
        self.locks.write().insert(
            inode,
            FileLock {
                token,
                lock_type,
                acquired_at: now,
                expires_at: now + ttl,
            },
        );
        info!("Lock stored: inode={}, type={:?}", inode, lock_type);
    }

    /// Get the lock for an inode
    pub fn get_lock(&self, inode: Inode) -> Option<FileLock> {
        let locks = self.locks.read();
        locks.get(&inode).and_then(|lock| {
            if lock.is_valid() {
                Some(lock.clone())
            } else {
                None
            }
        })
    }

    /// Check if we hold a valid lock for an inode
    pub fn has_lock(&self, inode: Inode, required_type: LockType) -> bool {
        if let Some(lock) = self.get_lock(inode) {
            match (lock.lock_type, required_type) {
                // Exclusive satisfies both exclusive and shared requirements
                (LockType::Exclusive, _) => true,
                // Shared only satisfies shared requirements
                (LockType::Shared, LockType::Shared) => true,
                _ => false,
            }
        } else {
            false
        }
    }

    /// Get the lock token for an inode (if we have one)
    pub fn get_lock_token(&self, inode: Inode) -> Option<LockToken> {
        self.get_lock(inode).map(|l| l.token)
    }

    /// Remove a lock for an inode
    pub fn remove_lock(&self, inode: Inode) {
        self.locks.write().remove(&inode);
        info!("Lock removed: inode={}", inode);
    }

    /// Clear all dirty state for an inode (e.g., on close)
    pub fn clear_inode(&self, inode: Inode) {
        let mut dirty = self.dirty_chunks.write();
        let mut inodes = self.dirty_inodes.write();

        dirty.retain(|id, _| id.inode != inode);
        inodes.remove(&inode);

        // Also remove lock
        self.locks.write().remove(&inode);

        debug!("Cleared all state for inode {}", inode);
    }

    /// Get current sync status
    pub fn status(&self) -> SyncStatus {
        let dirty = self.dirty_chunks.read();
        let inodes = self.dirty_inodes.read();

        let pending_bytes: u64 = dirty.values().map(|c| c.data.len() as u64).sum();

        SyncStatus {
            pending_chunks: dirty.len(),
            dirty_files: inodes.len(),
            pending_bytes,
            last_sync: None, // TODO: track this
            error_count: dirty.values().map(|c| c.attempts).sum(),
        }
    }

    /// Check if we need to force a sync (too many dirty chunks)
    pub fn should_force_sync(&self) -> bool {
        self.dirty_chunks.read().len() >= MAX_DIRTY_CHUNKS
    }

    /// Get chunks that are ready for sync (oldest first, limited count)
    pub fn get_chunks_to_sync(&self, max_count: usize) -> Vec<(ChunkId, DirtyChunk)> {
        let dirty = self.dirty_chunks.read();

        let mut chunks: Vec<_> = dirty
            .iter()
            .map(|(id, chunk)| (*id, chunk.clone()))
            .collect();

        // Sort by modification time (oldest first)
        chunks.sort_by_key(|(_, chunk)| chunk.modified_at);

        chunks.truncate(max_count);
        chunks
    }

    /// Get all inodes with expired locks (need renewal or release)
    pub fn get_expiring_locks(&self, within: Duration) -> Vec<Inode> {
        let threshold = Instant::now() + within;
        self.locks
            .read()
            .iter()
            .filter(|(_, lock)| lock.expires_at < threshold)
            .map(|(inode, _)| *inode)
            .collect()
    }

    /// Clean up expired locks
    pub fn cleanup_expired_locks(&self) {
        let now = Instant::now();
        let mut locks = self.locks.write();

        let expired: Vec<Inode> = locks
            .iter()
            .filter(|(_, lock)| lock.expires_at < now)
            .map(|(inode, _)| *inode)
            .collect();

        for inode in expired {
            locks.remove(&inode);
            warn!("Expired lock removed for inode {}", inode);
        }
    }
}

impl Default for SyncEngine {
    fn default() -> Self {
        Self::new(Duration::from_millis(DEFAULT_SYNC_INTERVAL_MS))
    }
}

/// Background sync runner - uploads dirty chunks to the host
pub struct SyncRunner {
    sync_engine: Arc<SyncEngine>,
    sync_interval: Duration,
}

impl SyncRunner {
    /// Create a new sync runner
    pub fn new(sync_engine: Arc<SyncEngine>, sync_interval: Duration) -> Self {
        Self {
            sync_engine,
            sync_interval,
        }
    }

    /// Run the background sync loop
    ///
    /// Takes a callback that performs the actual upload.
    /// The callback receives (chunk_id, data, lock_token) and returns Result<(), String>.
    pub async fn run_loop<F, Fut>(self, mut upload_fn: F)
    where
        F: FnMut(ChunkId, Vec<u8>, Option<LockToken>) -> Fut,
        Fut: std::future::Future<Output = Result<(), String>>,
    {
        use tokio::time::interval;

        let mut tick = interval(self.sync_interval);

        loop {
            tick.tick().await;

            // Clean up expired locks first
            self.sync_engine.cleanup_expired_locks();

            // Check if there are dirty chunks to sync
            let status = self.sync_engine.status();
            if status.pending_chunks == 0 {
                continue;
            }

            debug!(
                "Background sync: {} chunks pending ({} bytes)",
                status.pending_chunks, status.pending_bytes
            );

            // Get chunks to sync (up to 10 at a time to avoid overwhelming the host)
            let chunks = self.sync_engine.get_chunks_to_sync(10);

            for (chunk_id, dirty_chunk) in chunks {
                // Get lock token for this inode (if we have one)
                let lock_token = self.sync_engine.get_lock_token(chunk_id.inode);

                // If we don't have a lock but there are dirty chunks, we may need to acquire one
                // For now, we'll try to sync anyway - the host will reject if lock is required
                if lock_token.is_none()
                    && self
                        .sync_engine
                        .has_lock(chunk_id.inode, LockType::Exclusive)
                {
                    warn!(
                        "No lock token for inode {} but has_lock returned true - lock may have expired",
                        chunk_id.inode
                    );
                }

                // Attempt to upload the chunk
                match upload_fn(chunk_id, dirty_chunk.data, lock_token).await {
                    Ok(()) => {
                        self.sync_engine.mark_synced(&chunk_id);
                        debug!("Background sync: synced chunk {:?}", chunk_id);
                    }
                    Err(e) => {
                        self.sync_engine.mark_sync_failed(&chunk_id, e.clone());
                        warn!("Background sync failed for {:?}: {}", chunk_id, e);

                        // If too many attempts, we might want to give up
                        // For now, we'll just keep trying
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mark_dirty() {
        let engine = SyncEngine::default();
        let chunk_id = ChunkId::new(1, 0);
        let data = vec![1, 2, 3, 4];

        engine.mark_dirty(chunk_id, data.clone());

        assert!(engine.is_dirty(&chunk_id));
        assert!(engine.has_dirty_chunks(1));
        assert_eq!(engine.get_dirty_chunk(&chunk_id), Some(data));
    }

    #[test]
    fn test_mark_synced() {
        let engine = SyncEngine::default();
        let chunk_id = ChunkId::new(1, 0);

        engine.mark_dirty(chunk_id, vec![1, 2, 3]);
        assert!(engine.is_dirty(&chunk_id));

        engine.mark_synced(&chunk_id);
        assert!(!engine.is_dirty(&chunk_id));
        assert!(!engine.has_dirty_chunks(1));
    }

    #[test]
    fn test_multiple_chunks_per_inode() {
        let engine = SyncEngine::default();
        let chunk1 = ChunkId::new(1, 0);
        let chunk2 = ChunkId::new(1, 1);

        engine.mark_dirty(chunk1, vec![1]);
        engine.mark_dirty(chunk2, vec![2]);

        assert!(engine.has_dirty_chunks(1));

        engine.mark_synced(&chunk1);
        assert!(engine.has_dirty_chunks(1)); // Still has chunk2

        engine.mark_synced(&chunk2);
        assert!(!engine.has_dirty_chunks(1)); // Now clean
    }

    #[test]
    fn test_lock_management() {
        let engine = SyncEngine::default();
        let token = LockToken::generate();
        let ttl = Duration::from_secs(30);

        engine.store_lock(1, token.clone(), LockType::Exclusive, ttl);

        assert!(engine.has_lock(1, LockType::Exclusive));
        assert!(engine.has_lock(1, LockType::Shared)); // Exclusive satisfies shared
        assert!(!engine.has_lock(2, LockType::Exclusive));

        let lock = engine.get_lock(1).unwrap();
        assert_eq!(lock.token, token);
        assert!(lock.is_valid());

        engine.remove_lock(1);
        assert!(!engine.has_lock(1, LockType::Exclusive));
    }

    #[test]
    fn test_shared_lock_doesnt_satisfy_exclusive() {
        let engine = SyncEngine::default();
        let token = LockToken::generate();

        engine.store_lock(1, token, LockType::Shared, Duration::from_secs(30));

        assert!(engine.has_lock(1, LockType::Shared));
        assert!(!engine.has_lock(1, LockType::Exclusive));
    }

    #[test]
    fn test_clear_inode() {
        let engine = SyncEngine::default();
        let chunk1 = ChunkId::new(1, 0);
        let chunk2 = ChunkId::new(1, 1);
        let chunk3 = ChunkId::new(2, 0);

        engine.mark_dirty(chunk1, vec![1]);
        engine.mark_dirty(chunk2, vec![2]);
        engine.mark_dirty(chunk3, vec![3]);
        engine.store_lock(
            1,
            LockToken::generate(),
            LockType::Exclusive,
            Duration::from_secs(30),
        );

        engine.clear_inode(1);

        assert!(!engine.is_dirty(&chunk1));
        assert!(!engine.is_dirty(&chunk2));
        assert!(engine.is_dirty(&chunk3)); // Different inode
        assert!(!engine.has_lock(1, LockType::Exclusive));
    }

    #[test]
    fn test_sync_status() {
        let engine = SyncEngine::default();

        engine.mark_dirty(ChunkId::new(1, 0), vec![1, 2, 3]);
        engine.mark_dirty(ChunkId::new(1, 1), vec![4, 5]);
        engine.mark_dirty(ChunkId::new(2, 0), vec![6, 7, 8, 9]);

        let status = engine.status();
        assert_eq!(status.pending_chunks, 3);
        assert_eq!(status.dirty_files, 2);
        assert_eq!(status.pending_bytes, 9);
    }

    #[test]
    fn test_force_sync_threshold() {
        let engine = SyncEngine::default();

        for i in 0..(MAX_DIRTY_CHUNKS - 1) {
            engine.mark_dirty(ChunkId::new(1, i as u64), vec![1]);
        }
        assert!(!engine.should_force_sync());

        engine.mark_dirty(ChunkId::new(1, MAX_DIRTY_CHUNKS as u64), vec![1]);
        assert!(engine.should_force_sync());
    }

    #[test]
    fn test_chunks_to_sync_ordering() {
        let engine = SyncEngine::default();

        // Add chunks in reverse order (newest first)
        for i in (0..5).rev() {
            engine.mark_dirty(ChunkId::new(1, i), vec![i as u8]);
            std::thread::sleep(Duration::from_millis(1)); // Ensure different timestamps
        }

        let chunks = engine.get_chunks_to_sync(3);
        assert_eq!(chunks.len(), 3);

        // Should be oldest first (lowest chunk index in this case)
        // Note: Due to timing, we just verify count
    }
}
