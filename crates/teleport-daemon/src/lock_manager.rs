//! Lock Manager for file locking on the host side
//!
//! Provides distributed file locking to prevent concurrent writes from
//! corrupting files. Supports shared (read) and exclusive (write) locks.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::RwLock;
use tracing::{debug, info, warn};

use teleport_core::{Inode, LockToken, LockType};

/// Default lock TTL in seconds
pub const DEFAULT_LOCK_TTL_SECS: u64 = 30;

/// Lock hold information
#[derive(Clone, Debug)]
pub struct LockHold {
    /// The lock token
    pub token: LockToken,
    /// Type of lock
    pub lock_type: LockType,
    /// Client/peer identifier
    pub holder_id: String,
    /// When the lock was acquired
    pub acquired_at: Instant,
    /// When the lock expires
    pub expires_at: Instant,
}

impl LockHold {
    /// Check if this lock is expired
    pub fn is_expired(&self) -> bool {
        Instant::now() >= self.expires_at
    }

    /// Time remaining until expiration
    pub fn time_remaining(&self) -> Duration {
        self.expires_at.saturating_duration_since(Instant::now())
    }
}

/// Lock status for a file
#[derive(Clone, Debug)]
pub enum LockStatus {
    /// No locks held
    Unlocked,
    /// Shared locks held (multiple readers)
    SharedLock { holders: Vec<LockHold> },
    /// Exclusive lock held (single writer)
    ExclusiveLock { holder: LockHold },
}

/// Lock manager for coordinating file access
pub struct LockManager {
    /// Active locks by inode
    locks: Arc<RwLock<HashMap<Inode, LockStatus>>>,
    /// Default TTL for locks
    default_ttl: Duration,
}

impl LockManager {
    /// Create a new lock manager
    pub fn new(default_ttl: Duration) -> Self {
        Self {
            locks: Arc::new(RwLock::new(HashMap::new())),
            default_ttl,
        }
    }

    /// Acquire a lock on a file
    ///
    /// Returns Ok(LockToken) on success, Err with holder info on failure
    pub fn acquire(
        &self,
        inode: Inode,
        lock_type: LockType,
        holder_id: &str,
        timeout: Option<Duration>,
    ) -> Result<LockToken, LockError> {
        let ttl = timeout.unwrap_or(self.default_ttl);
        let mut locks = self.locks.write();

        // Clean up expired locks first
        self.cleanup_expired_locked(&mut locks, inode);

        let status = locks.entry(inode).or_insert(LockStatus::Unlocked);

        // Check current status and determine if we can grant the lock
        match (&*status, lock_type) {
            // Exclusive lock - cannot add any locks
            (LockStatus::ExclusiveLock { holder }, _) => {
                return Err(LockError::Conflict {
                    holder: Some(holder.holder_id.clone()),
                    lock_type: LockType::Exclusive,
                    retry_after: Some(holder.time_remaining()),
                });
            }

            // Shared locks - cannot upgrade to exclusive
            (LockStatus::SharedLock { holders }, LockType::Exclusive) => {
                let first = holders.first().map(|h| h.holder_id.clone());
                return Err(LockError::Conflict {
                    holder: first,
                    lock_type: LockType::Shared,
                    retry_after: holders.iter().map(|h| h.time_remaining()).min(),
                });
            }

            // Shared locks - can add more shared locks
            (LockStatus::SharedLock { .. }, LockType::Shared) => {
                // Will handle below
            }

            // No locks - grant any type
            (LockStatus::Unlocked, _) => {
                // Will handle below
            }
        }

        // Now we know we can grant the lock
        let token = LockToken::generate();
        let hold = LockHold {
            token: token.clone(),
            lock_type,
            holder_id: holder_id.to_string(),
            acquired_at: Instant::now(),
            expires_at: Instant::now() + ttl,
        };

        match status {
            LockStatus::Unlocked => {
                *status = match lock_type {
                    LockType::Shared => LockStatus::SharedLock {
                        holders: vec![hold],
                    },
                    LockType::Exclusive => LockStatus::ExclusiveLock { holder: hold },
                };
                info!(
                    "Lock acquired: inode={}, type={:?}, holder={}",
                    inode, lock_type, holder_id
                );
            }
            LockStatus::SharedLock { holders } => {
                holders.push(hold);
                debug!(
                    "Shared lock added: inode={}, holder={}, total={}",
                    inode,
                    holder_id,
                    holders.len()
                );
            }
            LockStatus::ExclusiveLock { holder } => {
                // This branch should not be reachable due to the early return above,
                // but handle it defensively to avoid panics in production
                warn!(
                    "Unexpected lock state: tried to add lock but exclusive lock exists. \
                     inode={}, existing_holder={}",
                    inode, holder.holder_id
                );
                return Err(LockError::Conflict {
                    holder: Some(holder.holder_id.clone()),
                    lock_type: LockType::Exclusive,
                    retry_after: Some(holder.time_remaining()),
                });
            }
        }

        Ok(token)
    }

    /// Release a lock
    pub fn release(&self, token: &LockToken) -> Result<(), LockError> {
        let mut locks = self.locks.write();

        for (inode, status) in locks.iter_mut() {
            match status {
                LockStatus::SharedLock { holders } => {
                    if let Some(pos) = holders.iter().position(|h| &h.token == token) {
                        holders.remove(pos);
                        info!("Shared lock released: inode={}", inode);

                        if holders.is_empty() {
                            *status = LockStatus::Unlocked;
                        }
                        return Ok(());
                    }
                }
                LockStatus::ExclusiveLock { holder } => {
                    if &holder.token == token {
                        info!("Exclusive lock released: inode={}", inode);
                        *status = LockStatus::Unlocked;
                        return Ok(());
                    }
                }
                LockStatus::Unlocked => {}
            }
        }

        Err(LockError::TokenNotFound)
    }

    /// Renew a lock's TTL
    pub fn renew(&self, token: &LockToken, new_ttl: Option<Duration>) -> Result<(), LockError> {
        let ttl = new_ttl.unwrap_or(self.default_ttl);
        let new_expires = Instant::now() + ttl;
        let mut locks = self.locks.write();

        for status in locks.values_mut() {
            match status {
                LockStatus::SharedLock { holders } => {
                    if let Some(holder) = holders.iter_mut().find(|h| &h.token == token) {
                        holder.expires_at = new_expires;
                        debug!("Lock renewed: ttl={:?}", ttl);
                        return Ok(());
                    }
                }
                LockStatus::ExclusiveLock { holder } => {
                    if &holder.token == token {
                        holder.expires_at = new_expires;
                        debug!("Lock renewed: ttl={:?}", ttl);
                        return Ok(());
                    }
                }
                LockStatus::Unlocked => {}
            }
        }

        Err(LockError::TokenNotFound)
    }

    /// Validate that a token holds the specified lock
    pub fn validate(&self, inode: Inode, token: &LockToken, required: LockType) -> bool {
        let locks = self.locks.read();

        match locks.get(&inode) {
            Some(LockStatus::ExclusiveLock { holder }) => {
                &holder.token == token && !holder.is_expired()
            }
            Some(LockStatus::SharedLock { holders }) if required == LockType::Shared => {
                holders.iter().any(|h| &h.token == token && !h.is_expired())
            }
            _ => false,
        }
    }

    /// Get lock status for an inode
    pub fn get_status(&self, inode: Inode) -> LockStatus {
        let locks = self.locks.read();
        locks.get(&inode).cloned().unwrap_or(LockStatus::Unlocked)
    }

    /// Clean up all expired locks
    pub fn cleanup_expired(&self) {
        let mut locks = self.locks.write();
        let inodes: Vec<Inode> = locks.keys().cloned().collect();

        for inode in inodes {
            self.cleanup_expired_locked(&mut locks, inode);
        }
    }

    /// Internal: clean up expired locks for a specific inode
    fn cleanup_expired_locked(&self, locks: &mut HashMap<Inode, LockStatus>, inode: Inode) {
        if let Some(status) = locks.get_mut(&inode) {
            match status {
                LockStatus::SharedLock { holders } => {
                    let expired: Vec<_> = holders
                        .iter()
                        .filter(|h| h.is_expired())
                        .map(|h| h.holder_id.clone())
                        .collect();

                    for id in &expired {
                        warn!("Expired shared lock: inode={}, holder={}", inode, id);
                    }

                    holders.retain(|h| !h.is_expired());

                    if holders.is_empty() {
                        *status = LockStatus::Unlocked;
                    }
                }
                LockStatus::ExclusiveLock { holder } if holder.is_expired() => {
                    warn!(
                        "Expired exclusive lock: inode={}, holder={}",
                        inode, holder.holder_id
                    );
                    *status = LockStatus::Unlocked;
                }
                _ => {}
            }
        }
    }

    /// Release all locks held by a specific holder
    pub fn release_all_by_holder(&self, holder_id: &str) {
        let mut locks = self.locks.write();

        for (inode, status) in locks.iter_mut() {
            match status {
                LockStatus::SharedLock { holders } => {
                    let count = holders.len();
                    holders.retain(|h| h.holder_id != holder_id);
                    if holders.len() < count {
                        info!(
                            "Released {} shared locks for holder {} on inode {}",
                            count - holders.len(),
                            holder_id,
                            inode
                        );
                    }
                    if holders.is_empty() {
                        *status = LockStatus::Unlocked;
                    }
                }
                LockStatus::ExclusiveLock { holder } if holder.holder_id == holder_id => {
                    info!(
                        "Released exclusive lock for holder {} on inode {}",
                        holder_id, inode
                    );
                    *status = LockStatus::Unlocked;
                }
                _ => {}
            }
        }
    }
}

impl Default for LockManager {
    fn default() -> Self {
        Self::new(Duration::from_secs(DEFAULT_LOCK_TTL_SECS))
    }
}

/// Lock errors
#[derive(Debug)]
pub enum LockError {
    /// Lock is held by another client
    Conflict {
        holder: Option<String>,
        lock_type: LockType,
        retry_after: Option<Duration>,
    },
    /// Token not found
    TokenNotFound,
}

impl std::fmt::Display for LockError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LockError::Conflict {
                holder,
                lock_type,
                retry_after,
            } => {
                write!(
                    f,
                    "Lock conflict: {:?} lock held by {:?}, retry after {:?}",
                    lock_type, holder, retry_after
                )
            }
            LockError::TokenNotFound => write!(f, "Lock token not found"),
        }
    }
}

impl std::error::Error for LockError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_acquire_exclusive_lock() {
        let lm = LockManager::default();
        let token = lm.acquire(1, LockType::Exclusive, "client1", None).unwrap();

        // Cannot acquire another exclusive
        assert!(lm.acquire(1, LockType::Exclusive, "client2", None).is_err());

        // Cannot acquire shared either
        assert!(lm.acquire(1, LockType::Shared, "client2", None).is_err());

        // Release and try again
        lm.release(&token).unwrap();
        assert!(lm.acquire(1, LockType::Exclusive, "client2", None).is_ok());
    }

    #[test]
    fn test_acquire_shared_locks() {
        let lm = LockManager::default();

        let token1 = lm.acquire(1, LockType::Shared, "client1", None).unwrap();
        let token2 = lm.acquire(1, LockType::Shared, "client2", None).unwrap();
        let token3 = lm.acquire(1, LockType::Shared, "client3", None).unwrap();

        // Cannot acquire exclusive while shared locks held
        assert!(lm.acquire(1, LockType::Exclusive, "client4", None).is_err());

        // Release all shared locks
        lm.release(&token1).unwrap();
        lm.release(&token2).unwrap();
        lm.release(&token3).unwrap();

        // Now can acquire exclusive
        assert!(lm.acquire(1, LockType::Exclusive, "client4", None).is_ok());
    }

    #[test]
    fn test_validate_lock() {
        let lm = LockManager::default();
        let token = lm.acquire(1, LockType::Exclusive, "client1", None).unwrap();

        assert!(lm.validate(1, &token, LockType::Exclusive));
        assert!(!lm.validate(1, &LockToken::generate(), LockType::Exclusive));
        assert!(!lm.validate(2, &token, LockType::Exclusive)); // Wrong inode
    }

    #[test]
    fn test_release_by_holder() {
        let lm = LockManager::default();

        lm.acquire(1, LockType::Exclusive, "client1", None).unwrap();
        lm.acquire(2, LockType::Shared, "client1", None).unwrap();
        lm.acquire(3, LockType::Shared, "client2", None).unwrap();

        lm.release_all_by_holder("client1");

        // client1's locks are gone
        assert!(matches!(lm.get_status(1), LockStatus::Unlocked));
        assert!(matches!(lm.get_status(2), LockStatus::Unlocked));

        // client2's lock remains
        assert!(matches!(lm.get_status(3), LockStatus::SharedLock { .. }));
    }

    #[test]
    fn test_lock_expiration() {
        let lm = LockManager::new(Duration::from_millis(10));
        let token = lm.acquire(1, LockType::Exclusive, "client1", None).unwrap();

        // Wait for expiration
        std::thread::sleep(Duration::from_millis(20));

        lm.cleanup_expired();

        // Lock should be gone
        assert!(matches!(lm.get_status(1), LockStatus::Unlocked));

        // Token should be invalid
        assert!(!lm.validate(1, &token, LockType::Exclusive));
    }
}
