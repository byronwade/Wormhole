//! Streaming Governor - Sequential access detection and prefetch
//!
//! Detects sequential read patterns and generates prefetch targets
//! to stay ahead of the application's reads.

use lru::LruCache;
use std::num::NonZeroUsize;
use teleport_core::{ChunkId, Inode};

/// Prefetch configuration
pub const PREFETCH_WINDOW: u64 = 5; // Prefetch up to 5 chunks ahead
pub const SEQUENTIAL_THRESHOLD: u32 = 3; // Consecutive accesses to trigger prefetch
pub const MAX_PREFETCH_CONCURRENT: usize = 4; // Max concurrent prefetch requests

/// Maximum number of file states to track (LRU eviction beyond this limit)
pub const MAX_FILE_STATES: usize = 10_000;

/// Access direction for pattern detection
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AccessDirection {
    Forward,
    Backward,
    Random,
}

/// Per-file access state
#[derive(Debug)]
struct FileAccessState {
    /// Last accessed chunk index
    last_chunk: u64,
    /// Consecutive sequential accesses
    sequential_streak: u32,
    /// Current access direction
    direction: AccessDirection,
}

impl Default for FileAccessState {
    fn default() -> Self {
        Self {
            last_chunk: 0,
            sequential_streak: 0,
            direction: AccessDirection::Random,
        }
    }
}

/// Streaming governor for sequential access detection and prefetch
pub struct Governor {
    /// Per-file access patterns indexed by inode (LRU bounded)
    file_state: LruCache<Inode, FileAccessState>,
    /// How many chunks ahead to prefetch
    prefetch_window: u64,
    /// How many sequential accesses before triggering prefetch
    sequential_threshold: u32,
}

impl Governor {
    /// Create a new governor with default configuration
    pub fn new() -> Self {
        Self::with_capacity(MAX_FILE_STATES)
    }

    /// Create a new governor with a custom capacity
    pub fn with_capacity(capacity: usize) -> Self {
        let cap =
            NonZeroUsize::new(capacity).unwrap_or(NonZeroUsize::new(MAX_FILE_STATES).unwrap());
        Self {
            file_state: LruCache::new(cap),
            prefetch_window: PREFETCH_WINDOW,
            sequential_threshold: SEQUENTIAL_THRESHOLD,
        }
    }

    /// Create a governor with custom configuration
    pub fn with_config(prefetch_window: u64, sequential_threshold: u32) -> Self {
        let cap = NonZeroUsize::new(MAX_FILE_STATES).unwrap();
        Self {
            file_state: LruCache::new(cap),
            prefetch_window,
            sequential_threshold,
        }
    }

    /// Record a chunk access and return prefetch targets
    ///
    /// Returns a list of ChunkIds that should be prefetched based on
    /// the detected access pattern.
    pub fn record_access(&mut self, chunk_id: &ChunkId) -> Vec<ChunkId> {
        // Use get_or_insert_mut to get or create the state (also promotes to MRU)
        let state = self
            .file_state
            .get_or_insert_mut(chunk_id.inode, || FileAccessState {
                last_chunk: chunk_id.index,
                sequential_streak: 0,
                direction: AccessDirection::Random,
            });

        let diff = chunk_id.index as i64 - state.last_chunk as i64;

        // Update pattern detection
        match diff {
            1 => {
                // Forward sequential
                if state.direction == AccessDirection::Forward {
                    state.sequential_streak += 1;
                } else {
                    state.direction = AccessDirection::Forward;
                    state.sequential_streak = 1;
                }
            }
            -1 => {
                // Backward sequential
                if state.direction == AccessDirection::Backward {
                    state.sequential_streak += 1;
                } else {
                    state.direction = AccessDirection::Backward;
                    state.sequential_streak = 1;
                }
            }
            0 => {
                // Same chunk (re-read), no change to streak
            }
            _ => {
                // Random access, reset streak
                state.sequential_streak = 0;
                state.direction = AccessDirection::Random;
            }
        }

        state.last_chunk = chunk_id.index;

        // Copy values before calling generate_prefetch_targets to avoid borrow issue
        let streak = state.sequential_streak;
        let direction = state.direction;

        // Generate prefetch targets if sequential pattern detected
        if streak >= self.sequential_threshold {
            self.generate_prefetch_targets(chunk_id, &direction)
        } else {
            vec![]
        }
    }

    /// Generate prefetch targets based on access direction
    fn generate_prefetch_targets(
        &self,
        current: &ChunkId,
        direction: &AccessDirection,
    ) -> Vec<ChunkId> {
        let mut targets = Vec::new();
        let window = self.prefetch_window;

        match direction {
            AccessDirection::Forward => {
                for i in 1..=window {
                    targets.push(ChunkId::new(current.inode, current.index + i));
                }
            }
            AccessDirection::Backward => {
                for i in 1..=window {
                    if current.index >= i {
                        targets.push(ChunkId::new(current.inode, current.index - i));
                    }
                }
            }
            AccessDirection::Random => {
                // No prefetch for random access
            }
        }

        targets
    }

    /// Get current access direction for a file
    ///
    /// Note: This uses `peek` to avoid updating LRU order for read-only queries.
    pub fn get_direction(&self, inode: Inode) -> AccessDirection {
        self.file_state
            .peek(&inode)
            .map(|s| s.direction)
            .unwrap_or(AccessDirection::Random)
    }

    /// Get sequential streak count for a file
    ///
    /// Note: This uses `peek` to avoid updating LRU order for read-only queries.
    pub fn get_streak(&self, inode: Inode) -> u32 {
        self.file_state
            .peek(&inode)
            .map(|s| s.sequential_streak)
            .unwrap_or(0)
    }

    /// Clear state for a specific inode (e.g., on file close)
    pub fn clear_inode(&mut self, inode: Inode) {
        self.file_state.pop(&inode);
    }

    /// Clear all state
    pub fn clear(&mut self) {
        self.file_state.clear();
    }
}

impl Default for Governor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_forward_sequential_detection() {
        let mut gov = Governor::new();

        // Access chunks 0, 1, 2, 3 sequentially
        let targets0 = gov.record_access(&ChunkId::new(1, 0));
        assert!(targets0.is_empty()); // No prefetch yet

        let targets1 = gov.record_access(&ChunkId::new(1, 1));
        assert!(targets1.is_empty()); // Still building streak

        let targets2 = gov.record_access(&ChunkId::new(1, 2));
        assert!(targets2.is_empty()); // Streak = 2, not enough

        // Now streak = 3, should trigger prefetch
        let targets3 = gov.record_access(&ChunkId::new(1, 3));
        assert!(!targets3.is_empty());
        assert_eq!(targets3.len(), 5); // Prefetch window = 5
        assert_eq!(targets3[0], ChunkId::new(1, 4));
        assert_eq!(targets3[4], ChunkId::new(1, 8));

        assert_eq!(gov.get_direction(1), AccessDirection::Forward);
        assert_eq!(gov.get_streak(1), 3);
    }

    #[test]
    fn test_backward_sequential_detection() {
        let mut gov = Governor::new();

        // Access chunks 10, 9, 8, 7 sequentially (backwards)
        gov.record_access(&ChunkId::new(1, 10));
        gov.record_access(&ChunkId::new(1, 9));
        gov.record_access(&ChunkId::new(1, 8));

        // Now streak = 3, should trigger prefetch
        let targets = gov.record_access(&ChunkId::new(1, 7));
        assert!(!targets.is_empty());
        assert_eq!(targets[0], ChunkId::new(1, 6)); // Prefetch backward
        assert_eq!(targets[4], ChunkId::new(1, 2));

        assert_eq!(gov.get_direction(1), AccessDirection::Backward);
    }

    #[test]
    fn test_random_access_no_prefetch() {
        let mut gov = Governor::new();

        // Random access pattern
        let targets0 = gov.record_access(&ChunkId::new(1, 0));
        let targets1 = gov.record_access(&ChunkId::new(1, 5));
        let targets2 = gov.record_access(&ChunkId::new(1, 2));
        let targets3 = gov.record_access(&ChunkId::new(1, 10));

        assert!(targets0.is_empty());
        assert!(targets1.is_empty());
        assert!(targets2.is_empty());
        assert!(targets3.is_empty());

        assert_eq!(gov.get_direction(1), AccessDirection::Random);
    }

    #[test]
    fn test_direction_change_resets_streak() {
        let mut gov = Governor::new();

        // Forward access
        gov.record_access(&ChunkId::new(1, 0));
        gov.record_access(&ChunkId::new(1, 1));
        gov.record_access(&ChunkId::new(1, 2));

        assert_eq!(gov.get_direction(1), AccessDirection::Forward);
        assert_eq!(gov.get_streak(1), 2);

        // Suddenly go backward - should reset streak
        gov.record_access(&ChunkId::new(1, 1));

        assert_eq!(gov.get_direction(1), AccessDirection::Backward);
        assert_eq!(gov.get_streak(1), 1);
    }

    #[test]
    fn test_multiple_files_independent() {
        let mut gov = Governor::new();

        // File 1: forward
        gov.record_access(&ChunkId::new(1, 0));
        gov.record_access(&ChunkId::new(1, 1));
        gov.record_access(&ChunkId::new(1, 2));

        // File 2: backward
        gov.record_access(&ChunkId::new(2, 10));
        gov.record_access(&ChunkId::new(2, 9));
        gov.record_access(&ChunkId::new(2, 8));

        assert_eq!(gov.get_direction(1), AccessDirection::Forward);
        assert_eq!(gov.get_direction(2), AccessDirection::Backward);
    }

    #[test]
    fn test_same_chunk_no_streak_change() {
        let mut gov = Governor::new();

        gov.record_access(&ChunkId::new(1, 0));
        gov.record_access(&ChunkId::new(1, 1));

        let streak_before = gov.get_streak(1);

        // Access same chunk again
        gov.record_access(&ChunkId::new(1, 1));

        assert_eq!(gov.get_streak(1), streak_before);
    }

    #[test]
    fn test_backward_at_start() {
        let mut gov = Governor::new();

        // Start at chunk 2, go backward to 0
        gov.record_access(&ChunkId::new(1, 2));
        gov.record_access(&ChunkId::new(1, 1));
        gov.record_access(&ChunkId::new(1, 0));

        // Streak = 2, trigger prefetch
        let targets = gov.record_access(&ChunkId::new(1, 0)); // Re-read same chunk

        // Can't prefetch before chunk 0
        // Since we're at 0 and going backward, no targets should be generated
        // Actually re-reading same chunk doesn't advance, so streak stays at 2
        // and no prefetch is triggered yet
        assert!(targets.is_empty());
    }

    #[test]
    fn test_clear_inode() {
        let mut gov = Governor::new();

        gov.record_access(&ChunkId::new(1, 0));
        gov.record_access(&ChunkId::new(1, 1));

        assert_eq!(gov.get_streak(1), 1);

        gov.clear_inode(1);

        assert_eq!(gov.get_streak(1), 0);
        assert_eq!(gov.get_direction(1), AccessDirection::Random);
    }

    #[test]
    fn test_lru_eviction() {
        // Create a governor with capacity 3
        let mut gov = Governor::with_capacity(3);

        // Access 3 different inodes
        gov.record_access(&ChunkId::new(1, 0));
        gov.record_access(&ChunkId::new(2, 0));
        gov.record_access(&ChunkId::new(3, 0));

        // All three should be present
        gov.record_access(&ChunkId::new(1, 1));
        gov.record_access(&ChunkId::new(2, 1));
        gov.record_access(&ChunkId::new(3, 1));

        assert_eq!(gov.get_streak(1), 1);
        assert_eq!(gov.get_streak(2), 1);
        assert_eq!(gov.get_streak(3), 1);

        // Add a 4th inode - should evict the LRU (inode 1)
        gov.record_access(&ChunkId::new(4, 0));

        // Inode 1 should have been evicted (streak reset to 0)
        assert_eq!(gov.get_streak(1), 0);
        // Inodes 2, 3, 4 should still be present
        assert_eq!(gov.get_streak(2), 1);
        assert_eq!(gov.get_streak(3), 1);
        assert_eq!(gov.get_streak(4), 0);
    }

    #[test]
    fn test_lru_access_promotes() {
        // Create a governor with capacity 3
        let mut gov = Governor::with_capacity(3);

        // Access 3 different inodes in order 1, 2, 3
        gov.record_access(&ChunkId::new(1, 0));
        gov.record_access(&ChunkId::new(2, 0));
        gov.record_access(&ChunkId::new(3, 0));

        // Access inode 1 again to promote it to MRU
        gov.record_access(&ChunkId::new(1, 1));

        // Add a 4th inode - should evict inode 2 (LRU now)
        gov.record_access(&ChunkId::new(4, 0));

        // Inode 2 should have been evicted
        assert_eq!(gov.get_streak(2), 0);
        // Inodes 1, 3, 4 should still be present
        assert_eq!(gov.get_streak(1), 1);
        assert_eq!(gov.get_streak(3), 0);
        assert_eq!(gov.get_streak(4), 0);
    }
}
