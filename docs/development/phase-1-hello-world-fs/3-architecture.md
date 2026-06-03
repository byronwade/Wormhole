# Phase 1 Architecture

## Three-Plane Design
- **Control Plane**: Signaling and authentication (placeholder in Phase 1, expanded in Phase 6)
- **Metadata Plane**: Directory trees, file attributes, inode mapping
- **Data Plane**: Byte transfer (deferred to Phase 2)

## Wire Protocol
```rust
// crates/teleport-core/src/protocol.rs
#[derive(Serialize, Deserialize)]
pub enum NetMessage {
    Handshake { version: u32, client_id: String },
    ListRequest,
    ListResponse { root: DirEntry },
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DirEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64,  // Unix timestamp
    pub children: Vec<DirEntry>,  // Empty for files
}
```
Serialization: serde + bincode (NOT JSON - binary is faster and smaller)

## Daemon Module Structure
```
crates/teleport-daemon/src/
├── cert.rs      # Self-signed certificate generation (rcgen)
├── scanner.rs   # Recursive directory walker → DirEntry tree
├── host.rs      # QUIC server: accept connections, handle ListRequest
├── client.rs    # QUIC client: connect, send ListRequest, receive ListResponse
├── vfs.rs       # Virtual filesystem: inode map, directory map
├── fs.rs        # FUSE trait implementation (fuser)
└── main.rs      # CLI: `teleport host <folder>` / `teleport mount <mp> <ip>`
```

## Transport Layer (quinn + rustls)
- **Server**: quinn::Endpoint with self-signed TLS certificate
- **Client**: quinn::Endpoint with permissive verifier (Phase 1 only - security in Phase 6)
- **Streams**: Bidirectional streams for request/response pairs
- **Configuration**:
  - `max_concurrent_bidi_streams`: 100 (allows parallel operations)
  - `keep_alive_interval`: 25 seconds (NAT traversal prep)
  - `max_idle_timeout`: 30 seconds

## FUSE Integration Pattern
```
┌─────────────────────────────────────────────────────────────┐
│ Kernel (VFS Layer)                                          │
│   lookup(parent, name) → ino                                │
│   getattr(ino) → FileAttr                                   │
│   readdir(ino) → [(name, ino, type), ...]                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ fs.rs (FUSE Callbacks) - SYNCHRONOUS                        │
│   Implements fuser::Filesystem trait                        │
│   Maps kernel calls to VFS lookups                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ vfs.rs (Virtual Filesystem)                                 │
│   inodes: HashMap<u64, DirEntry>                            │
│   children: HashMap<u64, Vec<(String, u64)>>                │
│   Root inode = 1                                            │
└─────────────────────────────────────────────────────────────┘
```

## Inode Assignment Strategy
- Root directory: inode 1 (FUSE requirement)
- All other entries: incremental assignment starting from 2
- Build maps during ListResponse processing:
  1. Traverse DirEntry tree recursively
  2. Assign inode to each entry
  3. Store in `inodes` map (inode → DirEntry)
  4. Store in `children` map (parent_ino → [(name, child_ino)])

## Key Invariants
- Inode 1 is always root directory
- Inodes are stable across lookups (same file = same inode)
- Parent references maintained for ".." resolution
- All getattr calls must return valid FileAttr or ENOENT
