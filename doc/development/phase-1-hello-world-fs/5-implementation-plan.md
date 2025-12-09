# Phase 1 Implementation Plan

## Prerequisites
- Rust toolchain (stable, 1.70+)
- FUSE dependencies:
  - **Linux**: `libfuse3-dev`, `pkg-config`
  - **macOS**: macFUSE (https://osxfuse.github.io/)
  - **Windows**: Deferred to later phase

## Step 1: Scaffold Workspace

```toml
# Cargo.toml (root)
[workspace]
resolver = "2"
members = ["crates/teleport-core", "crates/teleport-daemon"]

[workspace.dependencies]
tokio = { version = "1.35", features = ["full"] }
quinn = "0.11"
rustls = { version = "0.22", default-features = false, features = ["ring"] }
bincode = "1.3"
serde = { version = "1.0", features = ["derive"] }
anyhow = "1.0"
thiserror = "1.0"
fuser = "0.14"
walkdir = "2.4"
rcgen = "0.12"
libc = "0.2"
tracing = "0.1"
tracing-subscriber = "0.3"
```

## Step 2: teleport-core Protocol

```rust
// crates/teleport-core/src/protocol.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub enum NetMessage {
    Handshake { version: u32, client_id: String },
    ListRequest,
    ListResponse { root: DirEntry },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64,
    pub children: Vec<DirEntry>,
}
```

## Step 3: cert.rs - Self-Signed Certificates

```rust
// Key functions:
pub fn generate_self_signed_cert() -> Result<(Vec<u8>, Vec<u8>)>
// Returns (cert_der, key_der)

pub struct SkipServerVerification;
impl rustls::client::ServerCertVerifier for SkipServerVerification {
    // Accept any certificate (Phase 1 only!)
}
```

## Step 4: scanner.rs - Directory Walker

```rust
// Key function:
pub fn scan_directory(root: &Path) -> Result<DirEntry>

// Implementation notes:
// - Use walkdir for recursive traversal
// - Skip symlinks (security)
// - Handle permission errors gracefully (skip inaccessible)
// - Build tree structure by tracking parent relationships
```

## Step 5: host.rs - QUIC Server

```rust
// Key function:
pub async fn run_host(bind_addr: SocketAddr, share_path: PathBuf) -> Result<()>

// Flow:
// 1. Generate self-signed cert
// 2. Configure quinn::ServerConfig
// 3. Bind endpoint
// 4. Accept connections in loop
// 5. For each connection: spawn handler
// 6. Handler: accept_bi() → match NetMessage → respond
```

## Step 6: client.rs - QUIC Client

```rust
// Key function:
pub async fn fetch_metadata(server_addr: SocketAddr) -> Result<DirEntry>

// Flow:
// 1. Configure quinn::ClientConfig with SkipServerVerification
// 2. Connect to server
// 3. Open bidirectional stream
// 4. Send ListRequest (bincode serialize)
// 5. Read ListResponse (limit to 100MB)
// 6. Return DirEntry tree
```

## Step 7: vfs.rs - Virtual Filesystem

```rust
pub struct VirtualFilesystem {
    inodes: HashMap<u64, VfsEntry>,
    children: HashMap<u64, Vec<(String, u64)>>,
    next_ino: u64,
}

pub struct VfsEntry {
    pub attr: FileAttr,
    pub name: String,
}

impl VirtualFilesystem {
    pub fn from_dir_entry(root: DirEntry) -> Self
    pub fn lookup(&self, parent: u64, name: &str) -> Option<u64>
    pub fn get_attr(&self, ino: u64) -> Option<&FileAttr>
    pub fn read_dir(&self, ino: u64) -> Option<&[(String, u64)]>
}
```

## Step 8: fs.rs - FUSE Implementation

```rust
pub struct TeleportFS {
    vfs: Arc<RwLock<VirtualFilesystem>>,
}

impl Filesystem for TeleportFS {
    fn lookup(&mut self, _req: &Request, parent: u64, name: &OsStr, reply: ReplyEntry) {
        // Look up in VFS, return entry or ENOENT
    }

    fn getattr(&mut self, _req: &Request, ino: u64, reply: ReplyAttr) {
        // Return FileAttr from VFS or ENOENT
        // TTL: 1 second for network filesystem
    }

    fn readdir(&mut self, _req: &Request, ino: u64, fh: u64, offset: i64, reply: ReplyDirectory) {
        // Return children from VFS
        // Include "." and ".." entries
    }

    fn read(&mut self, ..., reply: ReplyData) {
        // Phase 1: return empty or ENOSYS
        // Data plane comes in Phase 2
    }
}
```

## Step 9: main.rs - CLI

```rust
#[derive(Parser)]
enum Command {
    Host { folder: PathBuf },
    Mount { mountpoint: PathBuf, host_ip: String },
}

// Host mode:
// 1. Validate folder exists
// 2. Call run_host(addr, folder)

// Mount mode:
// 1. Fetch metadata via client::fetch_metadata
// 2. Build VFS from DirEntry
// 3. Mount with fuser::mount2
// 4. Options: FSName, AutoUnmount, RO
```

## Step 10: Smoke Test

```bash
# Terminal 1 - Host
mkdir -p test_share/{dir1,dir2}
echo "hello" > test_share/dir1/file.txt
dd if=/dev/urandom of=test_share/dir2/binary.bin bs=1M count=10
cargo run -p teleport-daemon -- host ./test_share

# Terminal 2 - Client
mkdir -p mnt
cargo run -p teleport-daemon -- mount ./mnt 127.0.0.1:5000

# Verify
ls -la mnt/
ls -R mnt/
stat mnt/dir1/file.txt  # Check size/mtime
tree mnt/
```

## Key Implementation Notes

### FUSE TTL Strategy
- Use short TTL (1 second) for all entries
- Network filesystem metadata can change
- Longer TTL in Phase 4 when caching is added

### Error Handling
- Never panic in FUSE callbacks
- Return appropriate errno (ENOENT, EIO, ENOSYS)
- Log errors for debugging

### Memory Considerations
- DirEntry tree held in memory
- For 10k files: ~1-5MB typically
- Consider streaming for very large trees (future optimization)
