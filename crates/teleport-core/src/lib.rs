//! Teleport Core - Shared types, protocol definitions, and cryptographic utilities
//!
//! This crate contains the foundational types used across all Wormhole components.
//! It has no dependencies on networking or filesystem code.

pub mod buffer_pool;
pub mod compression;
pub mod config;
pub mod crypto;
pub mod error;
pub mod io;
pub mod path;
pub mod protocol;
pub mod types;

// Phase 8: High-Performance Transfer Engine
pub use buffer_pool::{BufferPool, BufferPoolStats, PooledBuffer, BULK_CHUNK_SIZE, RANDOM_CHUNK_SIZE};
pub use compression::{CompressionResult, CompressionStats, SmartCompressor};
pub use io::{platform_io, AsyncIO, IoStats};

pub use config::{CacheConfig, ClientConfig, Config, HostConfig, NetworkConfig, SignalConfig};
pub use error::*;
pub use protocol::*;
pub use types::*;

/// Chunk size in bytes (128 KB)
pub const CHUNK_SIZE: usize = 128 * 1024;

/// Protocol version
pub const PROTOCOL_VERSION: u32 = 1;

/// Maximum path length in bytes
pub const MAX_PATH_LEN: usize = 4096;

/// Maximum filename length in bytes
pub const MAX_FILENAME_LEN: usize = 255;

/// Maximum message size (1 MB)
pub const MAX_MESSAGE_SIZE: usize = 1024 * 1024;

/// Default TTL for file attributes in seconds
pub const DEFAULT_ATTR_TTL_SECS: u64 = 1;

/// Default TTL for directory listings in seconds
pub const DEFAULT_DIR_TTL_SECS: u64 = 1;
