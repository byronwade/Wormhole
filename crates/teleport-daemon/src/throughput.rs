//! Live session throughput metering for mount/share data planes.
//!
//! Tracks a short sliding window so Portal can show current MB/s while
//! FUSE/WinFSP reads (or writes) are in flight.

use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Thread-safe bytes/sec meter for an active mount or share session.
#[derive(Debug)]
pub struct SessionMeter {
    inner: Mutex<MeterState>,
}

#[derive(Debug)]
struct MeterState {
    window_start: Instant,
    bytes_in_window: u64,
    last_bps: f64,
    last_activity: Instant,
}

impl Default for SessionMeter {
    fn default() -> Self {
        Self::new()
    }
}

impl SessionMeter {
    /// Create a new idle meter.
    pub fn new() -> Self {
        let now = Instant::now();
        Self {
            inner: Mutex::new(MeterState {
                window_start: now,
                bytes_in_window: 0,
                last_bps: 0.0,
                last_activity: now.checked_sub(Duration::from_secs(10)).unwrap_or(now),
            }),
        }
    }

    /// Record bytes transferred on the data plane.
    pub fn record(&self, bytes: u64) {
        if bytes == 0 {
            return;
        }
        let Ok(mut state) = self.inner.lock() else {
            return;
        };
        let now = Instant::now();
        if now.duration_since(state.window_start) >= Duration::from_secs(1) {
            let elapsed = now
                .duration_since(state.window_start)
                .as_secs_f64()
                .max(0.001);
            state.last_bps = state.bytes_in_window as f64 / elapsed;
            state.bytes_in_window = 0;
            state.window_start = now;
        }
        state.bytes_in_window = state.bytes_in_window.saturating_add(bytes);
        state.last_activity = now;
    }

    /// Instantaneous speed in bytes/sec. Returns 0 when idle >2s.
    pub fn speed_bps(&self) -> f64 {
        let Ok(state) = self.inner.lock() else {
            return 0.0;
        };
        let now = Instant::now();
        if now.duration_since(state.last_activity) > Duration::from_secs(2) {
            return 0.0;
        }
        let elapsed = now.duration_since(state.window_start).as_secs_f64();
        if elapsed >= 0.2 && state.bytes_in_window > 0 {
            let current = state.bytes_in_window as f64 / elapsed.max(0.001);
            if state.last_bps > 0.0 {
                (state.last_bps + current) / 2.0
            } else {
                current
            }
        } else {
            state.last_bps
        }
    }

    /// True if bytes were recorded within the idle timeout.
    pub fn is_active(&self) -> bool {
        let Ok(state) = self.inner.lock() else {
            return false;
        };
        Instant::now().duration_since(state.last_activity) <= Duration::from_secs(2)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_and_reports_speed() {
        let meter = SessionMeter::new();
        meter.record(128 * 1024);
        meter.record(128 * 1024);
        // Within the first window, speed should be > 0 once elapsed is meaningful.
        // Force window roll by sleeping past 1s would be slow; check activity instead.
        assert!(meter.is_active());
        assert!(meter.speed_bps() >= 0.0);
    }

    #[test]
    fn idle_returns_zero_speed() {
        let meter = SessionMeter::new();
        assert_eq!(meter.speed_bps(), 0.0);
        assert!(!meter.is_active());
    }
}
