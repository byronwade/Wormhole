# Wormhole API Reference

This document provides the public API reference for all Wormhole crates.

---

## Table of Contents

1. [teleport-core](#1-teleport-core)
2. [teleport-daemon](#2-teleport-daemon)
3. [teleport-signal](#3-teleport-signal)
4. [Tauri Commands](#4-tauri-commands)

---

## 1. teleport-core

The core library containing shared types, protocol definitions, and cryptographic utilities.

### 1.1 Protocol Types

#### NetMessage

```rust
use teleport_core::protocol::NetMessage;

/// All possible network messages
pub enum NetMessage {
    Hello(HelloMessage),
    HelloAck(HelloAckMessage),
    ListDir(ListDirRequest),
    ListDirResponse(ListDirResponse),
    GetAttr(GetAttrRequest),
    GetAttrResponse(GetAttrResponse),
    ReadChunk(ReadChunkRequest),
    ReadChunkResponse(ReadChunkResponse),
    WriteChunk(WriteChunkRequest),
    WriteChunkResponse(WriteChunkResponse),
    Ping(PingMessage),
    Pong(PongMessage),
    Error(ErrorMessage),
    Goodbye(GoodbyeMessage),
    // ... other variants
}
```

#### FileAttr

```rust
use teleport_core::types::FileAttr;

/// File attributes (similar to stat)
pub struct FileAttr {
    pub inode: u64,
    pub file_type: FileType,
    pub size: u64,
    pub mode: u32,
    pub mtime: u64,
    pub mtime_nsec: u32,
    pub ctime: u64,
    pub ctime_nsec: u32,
}

impl FileAttr {
    /// Create attributes for a directory
    pub fn directory(inode: u64, mode: u32) -> Self;

    /// Create attributes for a file
    pub fn file(inode: u64, size: u64, mode: u32) -> Self;

    /// Convert to FUSE FileAttr
    pub fn to_fuse_attr(&self, uid: u32, gid: u32) -> fuser::FileAttr;
}
```

#### DirEntry

```rust
use teleport_core::types::DirEntry;

/// Directory entry
pub struct DirEntry {
    pub name: String,
    pub inode: u64,
    pub file_type: FileType,
}
```

#### ChunkId

```rust
use teleport_core::types::ChunkId;

/// Unique identifier for a file chunk
#[derive(Hash, Eq, PartialEq, Clone)]
pub struct ChunkId {
    pub inode: u64,
    pub index: u64,
}

impl ChunkId {
    /// Create a chunk ID
    pub fn new(inode: u64, index: u64) -> Self;

    /// Calculate chunk ID from file offset
    pub fn from_offset(inode: u64, offset: u64) -> Self;

    /// Get byte offset this chunk starts at
    pub fn byte_offset(&self) -> u64;
}
```

### 1.2 Constants

```rust
use teleport_core::constants::*;

/// Chunk size in bytes (128KB)
pub const CHUNK_SIZE: usize = 128 * 1024;

/// Protocol version
pub const PROTOCOL_VERSION: u32 = 1;

/// Maximum path length
pub const MAX_PATH_LENGTH: usize = 4096;

/// Maximum filename length
pub const MAX_FILENAME_LENGTH: usize = 255;

/// Default cache TTL in seconds
pub const DEFAULT_ATTR_TTL_SECS: u64 = 1;

/// Keep-alive interval in milliseconds
pub const KEEPALIVE_INTERVAL_MS: u64 = 10_000;
```

### 1.3 Error Types

```rust
use teleport_core::error::{ProtocolError, ErrorCode};

/// Protocol-level errors
#[derive(thiserror::Error, Debug)]
pub enum ProtocolError {
    #[error("invalid message type: {0}")]
    InvalidMessage(u8),

    #[error("path traversal attempt: {0}")]
    PathTraversal(String),

    #[error("serialization error: {0}")]
    Serialization(#[from] bincode::Error),

    #[error("file not found: {0}")]
    NotFound(String),

    #[error("permission denied")]
    PermissionDenied,

    #[error("checksum mismatch")]
    ChecksumMismatch,
}

/// Numeric error codes for wire protocol
#[repr(u16)]
pub enum ErrorCode {
    Ok = 0,
    Unknown = 1,
    FileNotFound = 100,
    PathTraversal = 104,
    IoError = 200,
    ChecksumMismatch = 201,
    LockConflict = 302,
    // ...
}
```

### 1.4 Cryptographic Utilities

```rust
use teleport_core::crypto::*;

/// Generate a random join code
pub fn generate_join_code() -> String;
// Returns: "7KJM-XBCD-QRST-VWYZ"

/// Derive encryption key from join code using SPAKE2
pub async fn derive_key_from_code(
    code: &str,
    role: PakeRole,
    peer_message: &[u8],
) -> Result<([u8; 32], Vec<u8>), CryptoError>;

/// PAKE role
pub enum PakeRole {
    Host,
    Client,
}

/// Calculate BLAKE3 checksum
pub fn checksum(data: &[u8]) -> [u8; 32];

/// Verify checksum
pub fn verify_checksum(data: &[u8], expected: &[u8; 32]) -> bool;
```

### 1.5 Path Utilities

```rust
use teleport_core::path::*;

/// Validate and canonicalize a path safely
///
/// # Arguments
/// * `root` - The root directory (share root)
/// * `relative` - The relative path from client
///
/// # Returns
/// * `Ok(PathBuf)` - Canonical path within root
/// * `Err(ProtocolError::PathTraversal)` - If path escapes root
///
/// # Example
/// ```rust
/// let root = Path::new("/home/user/shared");
/// let path = safe_path(root, "docs/file.txt")?;
/// // Ok: /home/user/shared/docs/file.txt
///
/// let bad = safe_path(root, "../../../etc/passwd");
/// // Err: PathTraversal
/// ```
pub fn safe_path(root: &Path, relative: &str) -> Result<PathBuf, ProtocolError>;

/// Normalize a path (remove redundant separators, etc.)
pub fn normalize_path(path: &str) -> String;
```

---

## 2. teleport-daemon

The main daemon library containing FUSE, networking, and caching logic.

### 2.1 Host API

```rust
use teleport_daemon::host::Host;

/// Host server configuration
pub struct HostConfig {
    /// Directory to share
    pub share_path: PathBuf,

    /// Bind address (default: 0.0.0.0:0)
    pub bind_addr: SocketAddr,

    /// Maximum concurrent clients
    pub max_clients: usize,

    /// Read-only mode
    pub read_only: bool,
}

impl Host {
    /// Create a new host
    pub async fn new(config: HostConfig) -> Result<Self, HostError>;

    /// Start hosting and return the join code
    ///
    /// # Returns
    /// * Join code for clients to connect
    ///
    /// # Example
    /// ```rust
    /// let host = Host::new(config).await?;
    /// let code = host.start().await?;
    /// println!("Share code: {}", code);
    /// // Prints: Share code: 7KJM-XBCD-QRST-VWYZ
    /// ```
    pub async fn start(&self) -> Result<String, HostError>;

    /// Stop hosting
    pub async fn stop(&self) -> Result<(), HostError>;

    /// Get connected peers
    pub fn peers(&self) -> Vec<PeerInfo>;

    /// Get host statistics
    pub fn stats(&self) -> HostStats;
}

/// Information about a connected peer
pub struct PeerInfo {
    pub id: String,
    pub name: String,
    pub addr: SocketAddr,
    pub connected_at: SystemTime,
    pub bytes_sent: u64,
    pub bytes_received: u64,
}

/// Host statistics
pub struct HostStats {
    pub total_bytes_sent: u64,
    pub total_bytes_received: u64,
    pub active_connections: usize,
    pub files_served: usize,
}
```

### 2.2 Client API

```rust
use teleport_daemon::client::Client;

/// Client configuration
pub struct ClientConfig {
    /// Join code from host
    pub join_code: String,

    /// Mount point path
    pub mount_point: PathBuf,

    /// Cache configuration
    pub cache: CacheConfig,

    /// Signal server URL (for NAT traversal)
    pub signal_url: Option<String>,
}

impl Client {
    /// Create a new client
    pub async fn new(config: ClientConfig) -> Result<Self, ClientError>;

    /// Connect to host and mount filesystem
    ///
    /// # Example
    /// ```rust
    /// let client = Client::new(ClientConfig {
    ///     join_code: "7KJM-XBCD-QRST-VWYZ".into(),
    ///     mount_point: "/mnt/wormhole".into(),
    ///     cache: CacheConfig::default(),
    ///     signal_url: None,
    /// }).await?;
    ///
    /// client.mount().await?;
    /// // Filesystem now available at /mnt/wormhole
    /// ```
    pub async fn mount(&self) -> Result<(), ClientError>;

    /// Unmount and disconnect
    pub async fn unmount(&self) -> Result<(), ClientError>;

    /// Get connection status
    pub fn status(&self) -> ConnectionStatus;

    /// Get client statistics
    pub fn stats(&self) -> ClientStats;
}

/// Connection status
pub enum ConnectionStatus {
    Disconnected,
    Connecting,
    Connected { host_name: String, latency_ms: u32 },
    Reconnecting { attempts: u32 },
}

/// Client statistics
pub struct ClientStats {
    pub bytes_downloaded: u64,
    pub bytes_uploaded: u64,
    pub cache_hits: u64,
    pub cache_misses: u64,
    pub avg_latency_ms: f64,
}
```

### 2.3 Cache API

```rust
use teleport_daemon::cache::{Cache, CacheConfig};

/// Cache configuration
pub struct CacheConfig {
    /// L1 (RAM) cache size in bytes (default: 256MB)
    pub l1_size: usize,

    /// L2 (disk) cache path (default: ~/.cache/wormhole)
    pub l2_path: PathBuf,

    /// L2 maximum size in bytes (default: 10GB)
    pub l2_max_size: u64,

    /// Enable prefetching
    pub prefetch_enabled: bool,

    /// Prefetch lookahead chunks
    pub prefetch_lookahead: usize,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            l1_size: 256 * 1024 * 1024,
            l2_path: dirs::cache_dir().unwrap().join("wormhole"),
            l2_max_size: 10 * 1024 * 1024 * 1024,
            prefetch_enabled: true,
            prefetch_lookahead: 4,
        }
    }
}

impl Cache {
    /// Create a new cache
    pub fn new(config: CacheConfig) -> Result<Self, CacheError>;

    /// Get a chunk from cache
    pub async fn get(&self, chunk_id: &ChunkId) -> Option<Arc<Vec<u8>>>;

    /// Put a chunk into cache
    pub async fn put(&self, chunk_id: ChunkId, data: Vec<u8>);

    /// Invalidate a chunk
    pub async fn invalidate(&self, chunk_id: &ChunkId);

    /// Invalidate all chunks for an inode
    pub async fn invalidate_inode(&self, inode: u64);

    /// Clear all caches
    pub async fn clear(&self);

    /// Get cache statistics
    pub fn stats(&self) -> CacheStats;
}

/// Cache statistics
pub struct CacheStats {
    pub l1_size: usize,
    pub l1_capacity: usize,
    pub l1_hit_rate: f64,
    pub l2_size: u64,
    pub l2_capacity: u64,
    pub l2_hit_rate: f64,
}
```

### 2.4 Configuration

```rust
use teleport_daemon::config::Config;

/// Global daemon configuration
#[derive(Serialize, Deserialize)]
pub struct Config {
    /// Logging configuration
    pub log: LogConfig,

    /// Network configuration
    pub network: NetworkConfig,

    /// Cache configuration
    pub cache: CacheConfig,

    /// Security configuration
    pub security: SecurityConfig,
}

impl Config {
    /// Load configuration from default locations
    ///
    /// Searches in order:
    /// 1. ./wormhole.toml
    /// 2. ~/.config/wormhole/config.toml
    /// 3. /etc/wormhole/config.toml
    pub fn load() -> Result<Self, ConfigError>;

    /// Load from specific path
    pub fn load_from(path: &Path) -> Result<Self, ConfigError>;

    /// Save configuration
    pub fn save(&self) -> Result<(), ConfigError>;
}

/// Logging configuration
#[derive(Serialize, Deserialize)]
pub struct LogConfig {
    /// Log level (trace, debug, info, warn, error)
    pub level: String,

    /// Log to file
    pub file: Option<PathBuf>,

    /// Log format (json, pretty)
    pub format: String,
}

/// Network configuration
#[derive(Serialize, Deserialize)]
pub struct NetworkConfig {
    /// Signal server URL
    pub signal_url: String,

    /// STUN servers for NAT traversal
    pub stun_servers: Vec<String>,

    /// Enable IPv6
    pub ipv6: bool,

    /// Connection timeout in milliseconds
    pub timeout_ms: u64,
}
```

---

## 3. teleport-signal

The signaling server for peer discovery and NAT traversal.

### 3.1 Server API

```rust
use teleport_signal::SignalServer;

/// Signal server configuration
pub struct SignalConfig {
    /// Bind address
    pub bind_addr: SocketAddr,

    /// TLS certificate path (optional)
    pub tls_cert: Option<PathBuf>,

    /// TLS key path (optional)
    pub tls_key: Option<PathBuf>,

    /// Maximum rooms
    pub max_rooms: usize,

    /// Room timeout in seconds
    pub room_timeout_secs: u64,
}

impl SignalServer {
    /// Create a new signal server
    pub fn new(config: SignalConfig) -> Self;

    /// Start the server
    pub async fn run(&self) -> Result<(), SignalError>;

    /// Get server statistics
    pub fn stats(&self) -> SignalStats;
}

/// Server statistics
pub struct SignalStats {
    pub active_rooms: usize,
    pub total_connections: u64,
    pub messages_relayed: u64,
}
```

### 3.2 WebSocket Messages

```rust
/// Client → Server messages
#[derive(Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ClientMessage {
    /// Register as host with join code
    #[serde(rename = "register")]
    Register { code: String },

    /// Join a room with join code
    #[serde(rename = "join")]
    Join { code: String },

    /// Send offer to peer
    #[serde(rename = "offer")]
    Offer { sdp: String },

    /// Send answer to peer
    #[serde(rename = "answer")]
    Answer { sdp: String },

    /// Send ICE candidate
    #[serde(rename = "ice")]
    Ice { candidate: String },
}

/// Server → Client messages
#[derive(Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ServerMessage {
    /// Registration successful
    #[serde(rename = "registered")]
    Registered { room_id: String },

    /// Peer joined the room
    #[serde(rename = "peer_joined")]
    PeerJoined { peer_id: String },

    /// Received offer from peer
    #[serde(rename = "offer")]
    Offer { peer_id: String, sdp: String },

    /// Received answer from peer
    #[serde(rename = "answer")]
    Answer { peer_id: String, sdp: String },

    /// Received ICE candidate
    #[serde(rename = "ice")]
    Ice { peer_id: String, candidate: String },

    /// Error occurred
    #[serde(rename = "error")]
    Error { code: u16, message: String },
}
```

---

## 4. Tauri Commands

Commands exposed to the React frontend via Tauri IPC.

### 4.1 Hosting Commands

```typescript
// Start hosting a folder
invoke<string>('start_hosting', { path: string }): Promise<string>
// Returns: Join code

// Stop hosting
invoke<void>('stop_hosting'): Promise<void>

// Get hosting status
invoke<HostStatus>('get_host_status'): Promise<HostStatus>

interface HostStatus {
  is_hosting: boolean;
  join_code: string | null;
  share_path: string | null;
  peer_count: number;
}

// Get connected peers
invoke<Peer[]>('get_peers'): Promise<Peer[]>

interface Peer {
  id: string;
  name: string;
  status: 'connected' | 'syncing' | 'idle';
  bytes_sent: number;
  bytes_received: number;
}
```

### 4.2 Mounting Commands

```typescript
// Connect to a host and mount
invoke<void>('mount', {
  joinCode: string,
  mountPoint: string
}): Promise<void>

// Unmount
invoke<void>('unmount'): Promise<void>

// Get mount status
invoke<MountStatus>('get_mount_status'): Promise<MountStatus>

interface MountStatus {
  is_mounted: boolean;
  mount_point: string | null;
  host_name: string | null;
  connection_status: 'connected' | 'connecting' | 'disconnected' | 'reconnecting';
}
```

### 4.3 Settings Commands

```typescript
// Get settings
invoke<Settings>('get_settings'): Promise<Settings>

// Update settings
invoke<void>('update_settings', { settings: Settings }): Promise<void>

interface Settings {
  cache_size_mb: number;
  cache_path: string;
  start_on_login: boolean;
  minimize_to_tray: boolean;
  notifications_enabled: boolean;
}
```

### 4.4 Events

```typescript
import { listen } from '@tauri-apps/api/event';

// Peer connected
listen<Peer>('peer-connected', (event) => {
  console.log('Peer connected:', event.payload);
});

// Peer disconnected
listen<string>('peer-disconnected', (event) => {
  console.log('Peer disconnected:', event.payload); // peer ID
});

// Transfer progress
listen<TransferProgress>('transfer-progress', (event) => {
  console.log('Progress:', event.payload);
});

interface TransferProgress {
  file_path: string;
  bytes_transferred: number;
  total_bytes: number;
  speed_bps: number;
}

// Connection status changed
listen<ConnectionStatus>('connection-status', (event) => {
  console.log('Status:', event.payload);
});

// Error occurred
listen<AppError>('error', (event) => {
  console.error('Error:', event.payload);
});

interface AppError {
  code: string;
  message: string;
  recoverable: boolean;
}
```

---

## Appendix: Type Conversion Reference

### FUSE ↔ Wormhole

```rust
impl From<FileType> for fuser::FileType {
    fn from(ft: FileType) -> Self {
        match ft {
            FileType::File => fuser::FileType::RegularFile,
            FileType::Directory => fuser::FileType::Directory,
            FileType::Symlink => fuser::FileType::Symlink,
        }
    }
}

impl From<&FileAttr> for fuser::FileAttr {
    fn from(attr: &FileAttr) -> Self {
        fuser::FileAttr {
            ino: attr.inode,
            size: attr.size,
            // ... other fields
        }
    }
}
```

### Error Code ↔ libc

```rust
impl From<ErrorCode> for i32 {
    fn from(code: ErrorCode) -> Self {
        match code {
            ErrorCode::Ok => 0,
            ErrorCode::FileNotFound => libc::ENOENT,
            ErrorCode::PermissionDenied => libc::EACCES,
            ErrorCode::NotADirectory => libc::ENOTDIR,
            ErrorCode::NotAFile => libc::EISDIR,
            ErrorCode::IoError => libc::EIO,
            ErrorCode::PathTraversal => libc::EACCES,
            _ => libc::EIO,
        }
    }
}
```
