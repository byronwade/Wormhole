//! Teleport Core - Shared types, protocol definitions, and cryptographic utilities
//!
//! This crate contains the foundational types used across all Wormhole components.
//! It has no dependencies on networking or filesystem code.

pub mod config;
pub mod crypto;
pub mod error;
pub mod path;
pub mod protocol;
pub mod types;

pub use config::{Config, CacheConfig, ClientConfig, HostConfig, NetworkConfig, SignalConfig};
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
