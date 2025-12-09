//! Teleport Daemon - FUSE client and host server
//!
//! This crate provides:
//! - FUSE filesystem implementation for mounting remote shares
//! - Host server for sharing local directories
//! - QUIC-based networking layer
//!
//! # Architecture
//!
//! The key challenge is bridging sync FUSE callbacks with async networking:
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────────┐
//! │                    FUSE Thread (sync)                       │
//! │  fuser::Filesystem callbacks block until data available     │
//! └─────────────────────────────┬───────────────────────────────┘
//!                               │ crossbeam-channel
//!                               │ (bounded, backpressure)
//!                               ▼
//! ┌─────────────────────────────────────────────────────────────┐
//! │                  Tokio Runtime (async)                      │
//! │  - QUIC connections (quinn)                                 │
//! │  - Request/response handling                                │
//! │  - Cache management                                         │
//! └─────────────────────────────────────────────────────────────┘
//! ```
//!
//! The bridge uses:
//! - `crossbeam-channel` for FUSE → async requests
//! - `oneshot` channels for async → FUSE responses
//! - Bounded channels to prevent memory exhaustion

pub mod bridge;
pub mod cache;
pub mod client;
pub mod disk_cache;
pub mod fuse;
pub mod gc;
pub mod governor;
pub mod host;
pub mod net;

pub use bridge::FuseAsyncBridge;
pub use cache::{CacheManager, ChunkCache, HybridCacheManager, HybridChunkCache};
pub use client::WormholeClient;
pub use disk_cache::DiskCache;
pub use fuse::WormholeFS;
pub use gc::GarbageCollector;
pub use governor::Governor;
pub use host::WormholeHost;

/// Default mount options
pub const DEFAULT_MOUNT_OPTIONS: &[&str] = &[
    "fsname=wormhole",
    "default_permissions",
    "allow_other",
];

/// Maximum concurrent FUSE requests in flight
pub const MAX_INFLIGHT_REQUESTS: usize = 64;

/// Cache entry TTL in seconds
pub const CACHE_TTL_SECS: u64 = 5;
