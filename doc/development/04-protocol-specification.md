# Wormhole Protocol Specification

**Version:** 1.0.0-draft
**Status:** Pre-implementation
**Last Updated:** 2024

---

## Table of Contents

1. [Overview](#1-overview)
2. [Transport Layer](#2-transport-layer)
3. [Message Format](#3-message-format)
4. [Message Types](#4-message-types)
5. [Connection Lifecycle](#5-connection-lifecycle)
6. [File Operations](#6-file-operations)
7. [Caching Protocol](#7-caching-protocol)
8. [Locking Protocol](#8-locking-protocol)
9. [Error Codes](#9-error-codes)
10. [Security](#10-security)
11. [Wire Examples](#11-wire-examples)

---

## 1. Overview

### 1.1 Purpose

The Wormhole Protocol enables peer-to-peer filesystem operations over QUIC, allowing one peer (Host) to share a directory that another peer (Client) can mount as a local filesystem.

### 1.2 Design Goals

| Goal | Description |
|------|-------------|
| **Low Latency** | First byte in <100ms for cached data |
| **High Throughput** | >100MB/s on local network |
| **Reliability** | Graceful handling of network interruptions |
| **Security** | E2E encryption, no plaintext metadata |
| **Simplicity** | Minimal message types, clear semantics |

### 1.3 Terminology

| Term | Definition |
|------|------------|
| **Host** | Peer sharing a directory |
| **Client** | Peer mounting the shared directory |
| **Chunk** | 128KB block of file data |
| **Inode** | Unique file identifier within a session |
| **Join Code** | 16-character code for authentication |

---

## 2. Transport Layer

### 2.1 QUIC Configuration

```
Protocol: QUIC (RFC 9000)
Port: Dynamic (default 0, OS-assigned)
TLS: 1.3 (via rustls)
ALPN: ["wormhole/1"]
```

### 2.2 Stream Types

| Stream Type | Direction | Purpose |
|-------------|-----------|---------|
| **Control (0)** | Bidirectional | Handshake, metadata, control messages |
| **Data (1+)** | Bidirectional | File chunk requests/responses |

### 2.3 Connection Parameters

```rust
QuicConfig {
    max_idle_timeout: 30_000,        // 30 seconds
    keep_alive_interval: 10_000,     // 10 seconds
    initial_rtt: 100,                // 100ms estimated
    max_concurrent_bidi_streams: 100,
    max_concurrent_uni_streams: 0,
    initial_max_data: 10_485_760,    // 10MB
    initial_max_stream_data: 1_048_576, // 1MB
}
```

---

## 3. Message Format

### 3.1 Envelope

All messages are serialized with bincode and wrapped in a length-prefixed envelope:

```
┌─────────────────────────────────────────────────┐
│ Length (4 bytes, little-endian u32)             │
├─────────────────────────────────────────────────┤
│ Payload (bincode-serialized NetMessage)         │
└─────────────────────────────────────────────────┘
```

### 3.2 Core Message Enum

```rust
#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum NetMessage {
    // Handshake
    Hello(HelloMessage),
    HelloAck(HelloAckMessage),

    // Metadata
    ListDir(ListDirRequest),
    ListDirResponse(ListDirResponse),
    GetAttr(GetAttrRequest),
    GetAttrResponse(GetAttrResponse),

    // Data
    ReadChunk(ReadChunkRequest),
    ReadChunkResponse(ReadChunkResponse),

    // Write (Phase 7)
    WriteChunk(WriteChunkRequest),
    WriteChunkResponse(WriteChunkResponse),
    CreateFile(CreateFileRequest),
    CreateFileResponse(CreateFileResponse),
    DeleteFile(DeleteFileRequest),
    DeleteFileResponse(DeleteFileResponse),

    // Locking (Phase 7)
    AcquireLock(LockRequest),
    AcquireLockResponse(LockResponse),
    ReleaseLock(ReleaseRequest),
    ReleaseLockResponse(ReleaseResponse),

    // Control
    Ping(PingMessage),
    Pong(PongMessage),
    Error(ErrorMessage),
    Goodbye(GoodbyeMessage),
}
```

### 3.3 Common Types

```rust
/// Unique file identifier (assigned by host)
pub type Inode = u64;

/// Chunk identifier
#[derive(Serialize, Deserialize, Debug, Clone, Hash, Eq, PartialEq)]
pub struct ChunkId {
    pub inode: Inode,
    pub index: u64,  // chunk_offset / CHUNK_SIZE
}

/// File type enum
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
pub enum FileType {
    File,
    Directory,
    Symlink,
}

/// File attributes
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FileAttr {
    pub inode: Inode,
    pub file_type: FileType,
    pub size: u64,
    pub mode: u32,
    pub mtime: u64,  // Unix timestamp (seconds)
    pub mtime_nsec: u32,
    pub ctime: u64,
    pub ctime_nsec: u32,
}

/// Directory entry
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DirEntry {
    pub name: String,
    pub inode: Inode,
    pub file_type: FileType,
}

/// Lock token (opaque to client)
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Hash)]
pub struct LockToken(pub [u8; 16]);
```

---

## 4. Message Types

### 4.1 Handshake Messages

#### Hello (Client → Host)

```rust
pub struct HelloMessage {
    pub protocol_version: u32,    // 1
    pub client_id: [u8; 16],      // Random UUID
    pub capabilities: Vec<String>, // ["read", "write", "lock"]
}
```

#### HelloAck (Host → Client)

```rust
pub struct HelloAckMessage {
    pub protocol_version: u32,
    pub session_id: [u8; 16],
    pub root_inode: Inode,        // Inode of shared directory
    pub host_name: String,        // Human-readable name
    pub capabilities: Vec<String>, // Intersection of client caps
}
```

### 4.2 Metadata Messages

#### ListDir Request

```rust
pub struct ListDirRequest {
    pub inode: Inode,
    pub offset: u64,              // For pagination (0 = start)
    pub limit: u32,               // Max entries (0 = all)
}
```

#### ListDir Response

```rust
pub struct ListDirResponse {
    pub entries: Vec<DirEntry>,
    pub has_more: bool,           // More entries available
    pub next_offset: u64,         // Offset for next request
}
```

#### GetAttr Request

```rust
pub struct GetAttrRequest {
    pub inode: Inode,
}
```

#### GetAttr Response

```rust
pub struct GetAttrResponse {
    pub attr: Option<FileAttr>,   // None if not found
}
```

### 4.3 Data Messages

#### ReadChunk Request

```rust
pub struct ReadChunkRequest {
    pub chunk_id: ChunkId,
    pub priority: u8,             // 0=low, 255=high (for prefetch)
}
```

#### ReadChunk Response

```rust
pub struct ReadChunkResponse {
    pub chunk_id: ChunkId,
    pub data: Vec<u8>,            // Up to CHUNK_SIZE bytes
    pub checksum: [u8; 32],       // BLAKE3 hash
    pub is_final: bool,           // Last chunk of file
}
```

### 4.4 Write Messages (Phase 7)

#### WriteChunk Request

```rust
pub struct WriteChunkRequest {
    pub chunk_id: ChunkId,
    pub data: Vec<u8>,
    pub checksum: [u8; 32],
    pub lock_token: LockToken,
}
```

#### WriteChunk Response

```rust
pub struct WriteChunkResponse {
    pub chunk_id: ChunkId,
    pub success: bool,
    pub new_size: Option<u64>,    // If file size changed
}
```

#### CreateFile Request

```rust
pub struct CreateFileRequest {
    pub parent_inode: Inode,
    pub name: String,
    pub file_type: FileType,
    pub mode: u32,
}
```

#### CreateFile Response

```rust
pub struct CreateFileResponse {
    pub inode: Option<Inode>,     // None if failed
    pub attr: Option<FileAttr>,
}
```

#### DeleteFile Request

```rust
pub struct DeleteFileRequest {
    pub parent_inode: Inode,
    pub name: String,
    pub lock_token: LockToken,
}
```

#### DeleteFile Response

```rust
pub struct DeleteFileResponse {
    pub success: bool,
}
```

### 4.5 Locking Messages (Phase 7)

#### Lock Request

```rust
pub struct LockRequest {
    pub inode: Inode,
    pub lock_type: LockType,
    pub timeout_ms: u32,          // 0 = no timeout
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
pub enum LockType {
    Shared,      // Multiple readers
    Exclusive,   // Single writer
}
```

#### Lock Response

```rust
pub struct LockResponse {
    pub granted: bool,
    pub token: Option<LockToken>,
    pub holder: Option<String>,   // Who holds the lock (if denied)
    pub retry_after_ms: Option<u32>, // Suggested retry time
}
```

#### Release Request

```rust
pub struct ReleaseRequest {
    pub token: LockToken,
}
```

#### Release Response

```rust
pub struct ReleaseResponse {
    pub success: bool,
}
```

### 4.6 Control Messages

#### Ping/Pong

```rust
pub struct PingMessage {
    pub timestamp: u64,           // Client timestamp (ms)
    pub payload: [u8; 8],         // Echo data
}

pub struct PongMessage {
    pub client_timestamp: u64,    // Echoed from ping
    pub server_timestamp: u64,    // Host timestamp
    pub payload: [u8; 8],         // Echoed from ping
}
```

#### Error

```rust
pub struct ErrorMessage {
    pub code: ErrorCode,
    pub message: String,
    pub related_inode: Option<Inode>,
}
```

#### Goodbye

```rust
pub struct GoodbyeMessage {
    pub reason: DisconnectReason,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
pub enum DisconnectReason {
    ClientShutdown,
    HostShutdown,
    IdleTimeout,
    ProtocolError,
    AuthenticationFailed,
}
```

---

## 5. Connection Lifecycle

### 5.1 Connection Establishment

```
┌────────┐                              ┌────────┐
│ Client │                              │  Host  │
└───┬────┘                              └───┬────┘
    │                                       │
    │ ─────── QUIC Connect ───────────────► │
    │                                       │
    │ ─────── Hello ──────────────────────► │
    │                                       │
    │ ◄────── HelloAck ─────────────────── │
    │                                       │
    │ ─────── ListDir(root) ──────────────► │
    │                                       │
    │ ◄────── ListDirResponse ──────────── │
    │                                       │
```

### 5.2 Keep-Alive

```
Every 10 seconds (if no other traffic):
    Client → Host: Ping
    Host → Client: Pong

If no response in 30 seconds:
    Connection considered dead
    Client attempts reconnection
```

### 5.3 Graceful Shutdown

```
Initiator → Peer: Goodbye(reason)
Close QUIC connection
```

---

## 6. File Operations

### 6.1 Reading a File

```
1. Client calls FUSE read(inode, offset, size)
2. Calculate chunk indices: start = offset / CHUNK_SIZE
3. For each chunk needed:
   a. Check L1 cache (RAM)
   b. Check L2 cache (disk)
   c. If miss: send ReadChunk request
4. Verify checksums
5. Assemble data, return to FUSE
```

### 6.2 Directory Listing

```
1. Client calls FUSE readdir(inode)
2. Send ListDir(inode, offset=0)
3. If has_more, send ListDir(inode, offset=next_offset)
4. Cache entries with TTL
5. Return to FUSE
```

### 6.3 File Attributes

```
1. Client calls FUSE getattr(inode)
2. Check attribute cache
3. If miss or stale: send GetAttr request
4. Cache with TTL (1s for dynamic, 60s for static)
5. Return to FUSE
```

---

## 7. Caching Protocol

### 7.1 Cache Invalidation

Host notifies clients when files change:

```rust
pub struct InvalidateMessage {
    pub inodes: Vec<Inode>,
    pub reason: InvalidateReason,
}

pub enum InvalidateReason {
    Modified,
    Deleted,
    Renamed,
    AttributeChanged,
}
```

### 7.2 Prefetch Hints

Client can request prefetch:

```rust
pub struct PrefetchHint {
    pub chunks: Vec<ChunkId>,
    pub priority: u8,
}
```

Host may send unsolicited data for predicted reads.

---

## 8. Locking Protocol

### 8.1 Lock Acquisition Flow

```
┌────────┐                              ┌────────┐
│ Client │                              │  Host  │
└───┬────┘                              └───┬────┘
    │                                       │
    │ ─────── AcquireLock(Exclusive) ─────► │
    │                                       │
    │         [Host checks lock table]      │
    │                                       │
    │ ◄────── LockResponse(granted, token) ─│
    │                                       │
    │ ─────── WriteChunk(token) ──────────► │
    │                                       │
    │ ◄────── WriteChunkResponse ────────── │
    │                                       │
    │ ─────── ReleaseLock(token) ─────────► │
    │                                       │
    │ ◄────── ReleaseResponse ───────────── │
```

### 8.2 Lock Timeout

- Locks have a default timeout of 30 seconds
- Client must refresh or release before timeout
- Host forcibly releases expired locks
- Writes with expired tokens fail with `LockExpired`

### 8.3 Deadlock Prevention

- Single lock per client per file
- No lock upgrade (shared → exclusive requires release + reacquire)
- FIFO queue for waiting lockers

---

## 9. Error Codes

```rust
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
#[repr(u16)]
pub enum ErrorCode {
    // General (0-99)
    Ok = 0,
    Unknown = 1,
    ProtocolError = 2,
    NotImplemented = 3,

    // File errors (100-199)
    FileNotFound = 100,
    NotADirectory = 101,
    NotAFile = 102,
    PermissionDenied = 103,
    PathTraversal = 104,
    NameTooLong = 105,

    // I/O errors (200-299)
    IoError = 200,
    ChecksumMismatch = 201,
    ChunkOutOfRange = 202,

    // Lock errors (300-399)
    LockNotHeld = 300,
    LockExpired = 301,
    LockConflict = 302,

    // Connection errors (400-499)
    SessionExpired = 400,
    RateLimited = 401,
    HostShuttingDown = 402,
}
```

---

## 10. Security

### 10.1 Encryption

- All traffic encrypted via QUIC's TLS 1.3
- Session key derived from PAKE (SPAKE2) exchange
- Join code provides ~80 bits of entropy

### 10.2 Path Validation

Host MUST validate all paths:

```rust
fn validate_path(root: &Path, requested: &str) -> Result<PathBuf, ErrorCode> {
    // Reject path traversal attempts
    if requested.contains("..") {
        return Err(ErrorCode::PathTraversal);
    }
    if requested.starts_with('/') {
        return Err(ErrorCode::PathTraversal);
    }

    let full = root.join(requested);
    let canonical = full.canonicalize()
        .map_err(|_| ErrorCode::FileNotFound)?;

    if !canonical.starts_with(root) {
        return Err(ErrorCode::PathTraversal);
    }

    Ok(canonical)
}
```

### 10.3 Rate Limiting

Host MAY implement rate limiting:

| Operation | Default Limit |
|-----------|---------------|
| ListDir | 100/second |
| GetAttr | 1000/second |
| ReadChunk | 10000/second |
| WriteChunk | 1000/second |

---

## 11. Wire Examples

### 11.1 Hello Handshake

```
Client → Host (hex):
  Length: 2f 00 00 00 (47 bytes)
  Payload: [bincode Hello]
    protocol_version: 01 00 00 00
    client_id: [16 random bytes]
    capabilities: ["read"]

Host → Client (hex):
  Length: 45 00 00 00 (69 bytes)
  Payload: [bincode HelloAck]
    protocol_version: 01 00 00 00
    session_id: [16 random bytes]
    root_inode: 01 00 00 00 00 00 00 00
    host_name: "Byron's MacBook"
    capabilities: ["read"]
```

### 11.2 Read Chunk

```
Client → Host:
  ReadChunkRequest {
    chunk_id: ChunkId { inode: 42, index: 0 },
    priority: 255,
  }

Host → Client:
  ReadChunkResponse {
    chunk_id: ChunkId { inode: 42, index: 0 },
    data: [131072 bytes],
    checksum: [32 bytes BLAKE3],
    is_final: false,
  }
```

### 11.3 Error Response

```
Host → Client:
  ErrorMessage {
    code: FileNotFound (100),
    message: "File does not exist",
    related_inode: Some(999),
  }
```

---

## Appendix A: Constants

```rust
pub const PROTOCOL_VERSION: u32 = 1;
pub const CHUNK_SIZE: usize = 128 * 1024;  // 128KB
pub const MAX_PATH_LENGTH: usize = 4096;
pub const MAX_FILENAME_LENGTH: usize = 255;
pub const MAX_MESSAGE_SIZE: usize = 1024 * 1024;  // 1MB
pub const DEFAULT_LOCK_TIMEOUT_MS: u32 = 30_000;
pub const KEEPALIVE_INTERVAL_MS: u64 = 10_000;
pub const IDLE_TIMEOUT_MS: u64 = 30_000;
```

---

## Appendix B: Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0-draft | 2024 | Initial specification |

---

## Appendix C: Future Extensions

Reserved message types for future use:

- `Rename` - File/directory rename
- `Truncate` - File truncation
- `SetAttr` - Attribute modification
- `Symlink` - Symbolic link creation
- `Watch` - File change notifications
- `Compress` - Compressed chunk transfer
