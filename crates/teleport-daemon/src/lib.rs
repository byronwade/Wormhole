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
pub mod connection_manager;
pub mod disk_cache;
pub mod fuse;
pub mod gc;
pub mod global;
pub mod governor;
pub mod host;
pub mod lock_manager;
pub mod multi_fuse;
pub mod multi_host;
pub mod net;
pub mod rate_limiter;
pub mod rendezvous;
pub mod sync_engine;
pub mod updater;

pub use bridge::FuseAsyncBridge;
pub use cache::{CacheManager, ChunkCache, HybridCacheManager, HybridChunkCache};
pub use client::WormholeClient;
pub use connection_manager::{
    ConnectionError, ConnectionEvent, ConnectionManager, HostConnectionConfig, ReconnectConfig,
    RegisteredShare,
};
pub use disk_cache::DiskCache;
pub use fuse::WormholeFS;
pub use gc::GarbageCollector;
pub use global::{
    connect_global, start_host_global, GlobalEvent, GlobalHostConfig, GlobalHostError,
    GlobalMountConfig, GlobalMountError,
};
pub use governor::Governor;
pub use host::WormholeHost;
pub use lock_manager::{LockError, LockHold, LockManager, LockStatus};
pub use multi_fuse::{MountedShare, MultiShareFS};
pub use multi_host::{MultiHostConfig, MultiShareHost, SharedFolder};
pub use rendezvous::{RendezvousClient, RendezvousError, RendezvousResult};
pub use sync_engine::{DirtyChunk, FileLock, SyncEngine, SyncRunner, SyncStatus};

/// Default mount options
pub const DEFAULT_MOUNT_OPTIONS: &[&str] =
    &["fsname=wormhole", "default_permissions", "allow_other"];

/// Maximum concurrent FUSE requests in flight
pub const MAX_INFLIGHT_REQUESTS: usize = 64;

/// Cache entry TTL in seconds
pub const CACHE_TTL_SECS: u64 = 5;
