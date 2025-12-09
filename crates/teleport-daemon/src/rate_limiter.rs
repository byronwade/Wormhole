//! Rate limiter for connection attempts
//!
//! Provides protection against brute-force attacks by limiting the rate
//! of failed connection attempts per IP address.
//!
//! # Security
//!
//! This module implements a sliding window rate limiter that:
//! - Tracks failed connection attempts per IP address
//! - Blocks IPs that exceed the failure threshold
//! - Automatically expires blocks after a cooldown period
//! - Uses exponential backoff for repeated offenders

use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::RwLock;
use tracing::{debug, warn};

/// Maximum failed attempts before blocking an IP
const DEFAULT_MAX_FAILURES: u32 = 5;

/// Time window for counting failures (in seconds)
const DEFAULT_WINDOW_SECS: u64 = 60;

/// Initial block duration (in seconds)
const DEFAULT_BLOCK_DURATION_SECS: u64 = 60;

/// Maximum block duration with exponential backoff (in seconds)
const MAX_BLOCK_DURATION_SECS: u64 = 3600; // 1 hour

/// Rate limiter configuration
#[derive(Clone, Debug)]
pub struct RateLimiterConfig {
    /// Maximum failed attempts before blocking
    pub max_failures: u32,
    /// Time window for counting failures
    pub window: Duration,
    /// Initial block duration
    pub block_duration: Duration,
}

impl Default for RateLimiterConfig {
    fn default() -> Self {
        Self {
            max_failures: DEFAULT_MAX_FAILURES,
            window: Duration::from_secs(DEFAULT_WINDOW_SECS),
            block_duration: Duration::from_secs(DEFAULT_BLOCK_DURATION_SECS),
        }
    }
}

/// Entry tracking failures for a single IP
#[derive(Debug)]
struct IpEntry {
    /// Timestamps of recent failures
    failures: Vec<Instant>,
    /// If blocked, when the block expires
    blocked_until: Option<Instant>,
    /// Number of times this IP has been blocked (for exponential backoff)
    block_count: u32,
}

impl IpEntry {
    fn new() -> Self {
        Self {
            failures: Vec::new(),
            blocked_until: None,
            block_count: 0,
        }
    }

    /// Clean up old failures outside the window
    fn cleanup(&mut self, window: Duration) {
        let cutoff = Instant::now() - window;
        self.failures.retain(|t| *t > cutoff);
    }

    /// Check if this IP is currently blocked
    fn is_blocked(&self) -> bool {
        if let Some(until) = self.blocked_until {
            Instant::now() < until
        } else {
            false
        }
    }

    /// Get remaining block time, if blocked
    fn block_remaining(&self) -> Option<Duration> {
        self.blocked_until.and_then(|until| {
            let now = Instant::now();
            if now < until {
                Some(until - now)
            } else {
                None
            }
        })
    }
}

/// Rate limiter for protecting against brute-force attacks
#[derive(Clone)]
pub struct RateLimiter {
    config: RateLimiterConfig,
    entries: Arc<RwLock<HashMap<IpAddr, IpEntry>>>,
}

impl RateLimiter {
    /// Create a new rate limiter with default configuration
    pub fn new() -> Self {
        Self::with_config(RateLimiterConfig::default())
    }

    /// Create a new rate limiter with custom configuration
    pub fn with_config(config: RateLimiterConfig) -> Self {
        Self {
            config,
            entries: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Check if a connection from this IP is allowed
    ///
    /// Returns `true` if allowed, `false` if rate limited.
    pub fn check(&self, ip: IpAddr) -> bool {
        let entries = self.entries.read();
        if let Some(entry) = entries.get(&ip) {
            !entry.is_blocked()
        } else {
            true
        }
    }

    /// Record a successful connection (resets failure count)
    pub fn record_success(&self, ip: IpAddr) {
        let mut entries = self.entries.write();
        if let Some(entry) = entries.get_mut(&ip) {
            // Clear failures on success, but keep block history
            entry.failures.clear();
            debug!("Rate limiter: cleared failures for {}", ip);
        }
    }

    /// Record a failed connection attempt
    ///
    /// Returns `true` if the IP is now blocked as a result.
    pub fn record_failure(&self, ip: IpAddr) -> bool {
        let mut entries = self.entries.write();
        let entry = entries.entry(ip).or_insert_with(IpEntry::new);

        // Clean up old failures
        entry.cleanup(self.config.window);

        // If already blocked, extend block
        if entry.is_blocked() {
            return true;
        }

        // Add new failure
        entry.failures.push(Instant::now());

        // Check if we should block
        if entry.failures.len() as u32 >= self.config.max_failures {
            // Calculate block duration with exponential backoff
            let multiplier = 2u64.pow(entry.block_count.min(6)); // Cap at 2^6 = 64x
            let block_duration = self.config.block_duration * multiplier as u32;
            let capped_duration = block_duration.min(Duration::from_secs(MAX_BLOCK_DURATION_SECS));

            entry.blocked_until = Some(Instant::now() + capped_duration);
            entry.block_count = entry.block_count.saturating_add(1);
            entry.failures.clear();

            warn!(
                "Rate limiter: blocked {} for {} seconds (block #{}, {} failures)",
                ip,
                capped_duration.as_secs(),
                entry.block_count,
                self.config.max_failures
            );

            true
        } else {
            debug!(
                "Rate limiter: recorded failure for {} ({}/{})",
                ip,
                entry.failures.len(),
                self.config.max_failures
            );
            false
        }
    }

    /// Get the remaining block time for an IP
    pub fn get_block_remaining(&self, ip: IpAddr) -> Option<Duration> {
        let entries = self.entries.read();
        entries.get(&ip).and_then(|e| e.block_remaining())
    }

    /// Clean up expired entries to prevent memory growth
    pub fn cleanup_expired(&self) {
        let mut entries = self.entries.write();
        let now = Instant::now();

        entries.retain(|ip, entry| {
            // Remove entries that are not blocked and have no recent failures
            entry.cleanup(self.config.window);
            let should_keep =
                entry.is_blocked() || !entry.failures.is_empty() || entry.block_count > 0;

            if !should_keep {
                debug!("Rate limiter: cleaned up entry for {}", ip);
            }

            should_keep
        });

        // Also clean up entries where block has expired and no recent activity
        entries.retain(|ip, entry| {
            if let Some(until) = entry.blocked_until {
                if now > until {
                    entry.blocked_until = None;
                    // Keep if there were previous blocks (for exponential backoff)
                    if entry.block_count == 0 && entry.failures.is_empty() {
                        debug!("Rate limiter: removed expired block for {}", ip);
                        return false;
                    }
                }
            }
            true
        });
    }

    /// Get statistics about rate limiter state
    pub fn stats(&self) -> RateLimiterStats {
        let entries = self.entries.read();
        let blocked_count = entries.values().filter(|e| e.is_blocked()).count();
        let total_tracked = entries.len();

        RateLimiterStats {
            blocked_count,
            total_tracked,
        }
    }
}

impl Default for RateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

/// Rate limiter statistics
#[derive(Debug, Clone, Copy)]
pub struct RateLimiterStats {
    /// Number of currently blocked IPs
    pub blocked_count: usize,
    /// Total number of tracked IPs
    pub total_tracked: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{IpAddr, Ipv4Addr};

    #[test]
    fn test_allows_initial_connections() {
        let limiter = RateLimiter::new();
        let ip = IpAddr::V4(Ipv4Addr::new(192, 168, 1, 1));

        assert!(limiter.check(ip));
    }

    #[test]
    fn test_blocks_after_max_failures() {
        let config = RateLimiterConfig {
            max_failures: 3,
            window: Duration::from_secs(60),
            block_duration: Duration::from_secs(60),
        };
        let limiter = RateLimiter::with_config(config);
        let ip = IpAddr::V4(Ipv4Addr::new(192, 168, 1, 1));

        // First failures should not block
        assert!(!limiter.record_failure(ip));
        assert!(!limiter.record_failure(ip));

        // Third failure should block
        assert!(limiter.record_failure(ip));

        // Should be blocked now
        assert!(!limiter.check(ip));
    }

    #[test]
    fn test_success_clears_failures() {
        let config = RateLimiterConfig {
            max_failures: 3,
            window: Duration::from_secs(60),
            block_duration: Duration::from_secs(60),
        };
        let limiter = RateLimiter::with_config(config);
        let ip = IpAddr::V4(Ipv4Addr::new(192, 168, 1, 1));

        // Record some failures
        limiter.record_failure(ip);
        limiter.record_failure(ip);

        // Success clears them
        limiter.record_success(ip);

        // Should be able to have more failures now
        assert!(!limiter.record_failure(ip));
        assert!(!limiter.record_failure(ip));
    }

    #[test]
    fn test_different_ips_tracked_separately() {
        let config = RateLimiterConfig {
            max_failures: 2,
            window: Duration::from_secs(60),
            block_duration: Duration::from_secs(60),
        };
        let limiter = RateLimiter::with_config(config);
        let ip1 = IpAddr::V4(Ipv4Addr::new(192, 168, 1, 1));
        let ip2 = IpAddr::V4(Ipv4Addr::new(192, 168, 1, 2));

        // Block ip1
        limiter.record_failure(ip1);
        limiter.record_failure(ip1);

        // ip2 should still be allowed
        assert!(limiter.check(ip2));
        assert!(!limiter.check(ip1));
    }
}
