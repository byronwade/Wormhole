//! Teleport Daemon - Filesystem client and host server
//!
//! This crate provides:
//! - Filesystem implementation for mounting remote shares (FUSE on Unix, WinFSP on Windows)
//! - Host server for sharing local directories
//! - QUIC-based networking layer
//!
//! # Architecture
//!
//! The key challenge is bridging sync filesystem callbacks with async networking:
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────────┐
//! │              Filesystem Thread (sync)                       │
//! │  FUSE/WinFSP callbacks block until data available           │
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
//! - `crossbeam-channel` for filesystem → async requests
//! - `oneshot` channels for async → filesystem responses
//! - Bounded channels to prevent memory exhaustion
//!
//! # Platform Support
//!
//! - **Unix (Linux, macOS)**: Uses FUSE via the `fuser` crate
//! - **Windows**: Uses WinFSP via the `winfsp` crate

// Bridge module (platform-agnostic sync↔async bridge)
pub mod bridge;

// FUSE-related modules (Unix-only)
#[cfg(unix)]
pub mod fuse;
#[cfg(unix)]
pub mod multi_fuse;

// WinFSP-related modules (Windows-only)
#[cfg(windows)]
pub mod winfsp;

// Platform-independent modules
pub mod bulk_transfer;
pub mod cache;
pub mod client;
pub mod connection_manager;
pub mod dedup_index;
pub mod disk_cache;
pub mod gc;
pub mod global;
pub mod governor;
pub mod host;
pub mod lock_manager;
pub mod multi_host;
pub mod net;
pub mod rate_limiter;
pub mod rendezvous;
pub mod stream_pool;
pub mod sync_engine;
pub mod updater;

// Bridge re-export (platform-agnostic)
pub use bridge::{BridgeHandler, FuseAsyncBridge, FuseError, FuseRequest};

// FUSE-related re-exports (Unix-only)
#[cfg(unix)]
pub use fuse::WormholeFS;
#[cfg(unix)]
pub use multi_fuse::{MountedShare, MultiShareFS};

// WinFSP-related re-exports (Windows-only)
#[cfg(windows)]
pub use winfsp::{mount_winfsp, WormholeFileContext, WormholeWinFS};

// Platform-independent re-exports
pub use cache::{CacheManager, ChunkCache, HybridCacheManager, HybridChunkCache};
pub use client::WormholeClient;
pub use dedup_index::{ChunkLocation, DedupIndex, DedupStatsSnapshot};
pub use connection_manager::{
    ConnectionError, ConnectionEvent, ConnectionManager, HostConnectionConfig, ReconnectConfig,
    RegisteredShare,
};
pub use disk_cache::DiskCache;
pub use gc::GarbageCollector;
pub use global::{
    connect_global, start_host_global, GlobalEvent, GlobalHostConfig, GlobalHostError,
    GlobalMountConfig, GlobalMountError,
};
pub use governor::Governor;
pub use host::WormholeHost;
pub use lock_manager::{LockError, LockHold, LockManager, LockStatus};
pub use multi_host::{MultiHostConfig, MultiShareHost, SharedFolder};
pub use rendezvous::{RendezvousClient, RendezvousError, RendezvousResult};
pub use stream_pool::{
    PooledStream, StreamPool, StreamPoolConfig, StreamPoolStatsSnapshot, DEFAULT_STREAMS,
    MAX_STREAMS, MIN_STREAMS,
};
pub use sync_engine::{DirtyChunk, FileLock, SyncEngine, SyncRunner, SyncStatus};
pub use bulk_transfer::{
    BulkTransferConfig, BulkTransferCoordinator, TransferProgress, TransferProgressTracker,
    TransferResult, TransferStats, TransferStatsSnapshot,
};

/// Default mount options
pub const DEFAULT_MOUNT_OPTIONS: &[&str] =
    &["fsname=wormhole", "default_permissions", "allow_other"];

/// Maximum concurrent FUSE requests in flight
pub const MAX_INFLIGHT_REQUESTS: usize = 64;

/// Cache entry TTL in seconds
pub const CACHE_TTL_SECS: u64 = 5;
