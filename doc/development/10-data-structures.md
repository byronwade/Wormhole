# Data Structures Specification

This document defines the core data structures, their memory layouts, and concurrency semantics.

---

## Table of Contents

1. [Core Types](#1-core-types)
2. [VFS Structures](#2-vfs-structures)
3. [Cache Structures](#3-cache-structures)
4. [Network Structures](#4-network-structures)
5. [Lock Structures](#5-lock-structures)
6. [Concurrency Patterns](#6-concurrency-patterns)
7. [Serialization Formats](#7-serialization-formats)

---

## 1. Core Types

### Inode

```rust
/// Unique file identifier within a session
///
/// - Root directory: always inode 1
/// - User files/dirs: 2+
/// - Maximum: u64::MAX (practical limit ~10M active)
pub type Inode = u64;

pub const ROOT_INODE: Inode = 1;
pub const FIRST_USER_INODE: Inode = 2;
```

### ChunkId

```rust
/// Identifies a specific chunk of a file
///
/// Memory: 16 bytes
#[derive(Clone, Copy, Hash, Eq, PartialEq, Debug)]
#[derive(Serialize, Deserialize)]
pub struct ChunkId {
    /// File this chunk belongs to
    pub inode: Inode,      // 8 bytes
    /// Chunk index (offset / CHUNK_SIZE)
    pub index: u64,        // 8 bytes
}

impl ChunkId {
    pub const fn new(inode: Inode, index: u64) -> Self {
        Self { inode, index }
    }

    /// Create from byte offset
    pub const fn from_offset(inode: Inode, offset: u64) -> Self {
        Self {
            inode,
            index: offset / CHUNK_SIZE as u64,
        }
    }

    /// Byte offset this chunk starts at
    pub const fn byte_offset(&self) -> u64 {
        self.index * CHUNK_SIZE as u64
    }

    /// Byte range this chunk covers
    pub const fn byte_range(&self) -> Range<u64> {
        let start = self.byte_offset();
        start..start + CHUNK_SIZE as u64
    }
}
```

### FileType

```rust
/// Type of filesystem entry
///
/// Memory: 1 byte
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[derive(Serialize, Deserialize)]
#[repr(u8)]
pub enum FileType {
    File = 0,
    Directory = 1,
    Symlink = 2,
}

impl From<FileType> for fuser::FileType {
    fn from(ft: FileType) -> Self {
        match ft {
            FileType::File => fuser::FileType::RegularFile,
            FileType::Directory => fuser::FileType::Directory,
            FileType::Symlink => fuser::FileType::Symlink,
        }
    }
}
```

### FileAttr

```rust
/// File attributes (similar to struct stat)
///
/// Memory: 56 bytes
#[derive(Clone, Debug)]
#[derive(Serialize, Deserialize)]
pub struct FileAttr {
    pub inode: Inode,           // 8 bytes
    pub file_type: FileType,    // 1 byte
    pub size: u64,              // 8 bytes
    pub mode: u32,              // 4 bytes (Unix permissions)
    pub nlink: u32,             // 4 bytes (hard link count)
    pub uid: u32,               // 4 bytes
    pub gid: u32,               // 4 bytes
    pub atime: u64,             // 8 bytes (seconds since epoch)
    pub atime_nsec: u32,        // 4 bytes
    pub mtime: u64,             // 8 bytes
    pub mtime_nsec: u32,        // 4 bytes
    pub ctime: u64,             // 8 bytes (metadata change)
    pub ctime_nsec: u32,        // 4 bytes
    // Padding for alignment: ~7 bytes
}

impl FileAttr {
    /// Default permissions for directories
    pub const DIR_MODE: u32 = 0o755;
    /// Default permissions for files
    pub const FILE_MODE: u32 = 0o644;

    pub fn directory(inode: Inode) -> Self {
        Self {
            inode,
            file_type: FileType::Directory,
            size: 0,
            mode: Self::DIR_MODE,
            nlink: 2,
            ..Self::default()
        }
    }

    pub fn file(inode: Inode, size: u64) -> Self {
        Self {
            inode,
            file_type: FileType::File,
            size,
            mode: Self::FILE_MODE,
            nlink: 1,
            ..Self::default()
        }
    }

    pub fn to_fuse_attr(&self, uid: u32, gid: u32) -> fuser::FileAttr {
        fuser::FileAttr {
            ino: self.inode,
            size: self.size,
            blocks: (self.size + 511) / 512,
            atime: UNIX_EPOCH + Duration::new(self.atime, self.atime_nsec),
            mtime: UNIX_EPOCH + Duration::new(self.mtime, self.mtime_nsec),
            ctime: UNIX_EPOCH + Duration::new(self.ctime, self.ctime_nsec),
            crtime: UNIX_EPOCH,
            kind: self.file_type.into(),
            perm: self.mode as u16,
            nlink: self.nlink,
            uid,
            gid,
            rdev: 0,
            blksize: CHUNK_SIZE as u32,
            flags: 0,
        }
    }
}
```

### DirEntry

```rust
/// Directory entry
///
/// Memory: 32 + name.len() bytes
#[derive(Clone, Debug)]
#[derive(Serialize, Deserialize)]
pub struct DirEntry {
    pub name: String,           // 24 bytes (String struct) + heap
    pub inode: Inode,           // 8 bytes
    pub file_type: FileType,    // 1 byte
    // Padding: 7 bytes
}

impl DirEntry {
    pub fn new(name: impl Into<String>, inode: Inode, file_type: FileType) -> Self {
        Self {
            name: name.into(),
            inode,
            file_type,
        }
    }
}
```

---

## 2. VFS Structures

### VfsEntry

```rust
/// Virtual filesystem entry
///
/// Memory: ~200 bytes + children
pub struct VfsEntry {
    /// Unique identifier
    pub inode: Inode,

    /// Full path from share root
    pub path: PathBuf,

    /// File attributes
    pub attrs: FileAttr,

    /// Children (directories only)
    /// None = not loaded, Some([]) = empty dir, Some([...]) = loaded
    pub children: Option<Vec<Inode>>,

    /// Lookup reference count (for FUSE forget)
    pub nlookup: AtomicU64,

    /// When attributes were last fetched
    pub attrs_fetched: Instant,

    /// When children were last fetched
    pub children_fetched: Option<Instant>,
}

impl VfsEntry {
    /// Attribute TTL
    pub const ATTR_TTL: Duration = Duration::from_secs(1);

    /// Directory TTL
    pub const DIR_TTL: Duration = Duration::from_secs(1);

    pub fn attrs_stale(&self) -> bool {
        self.attrs_fetched.elapsed() > Self::ATTR_TTL
    }

    pub fn children_stale(&self) -> bool {
        self.children_fetched
            .map(|t| t.elapsed() > Self::DIR_TTL)
            .unwrap_or(true)
    }
}
```

### VfsMap

```rust
/// Thread-safe virtual filesystem map
///
/// Memory: ~100 bytes + entries
pub struct VfsMap {
    /// Inode → Entry mapping
    ///
    /// Using RwLock because reads are ~100x more frequent than writes
    entries: RwLock<HashMap<Inode, VfsEntry>>,

    /// Path → Inode reverse lookup
    ///
    /// Separate lock to reduce contention
    path_index: RwLock<HashMap<PathBuf, Inode>>,

    /// Inode allocator
    allocator: InodeAllocator,

    /// Statistics
    stats: VfsStats,
}

impl VfsMap {
    /// Get entry by inode (fast path)
    pub fn get(&self, inode: Inode) -> Option<VfsEntry> {
        self.entries.read().get(&inode).cloned()
    }

    /// Get entry by path (slower, reverse lookup)
    pub fn get_by_path(&self, path: &Path) -> Option<VfsEntry> {
        let inode = *self.path_index.read().get(path)?;
        self.get(inode)
    }

    /// Insert or update entry
    pub fn insert(&self, entry: VfsEntry) {
        let inode = entry.inode;
        let path = entry.path.clone();

        self.entries.write().insert(inode, entry);
        self.path_index.write().insert(path, inode);
    }

    /// Remove entry (on forget with nlookup=0)
    pub fn remove(&self, inode: Inode) -> Option<VfsEntry> {
        let entry = self.entries.write().remove(&inode)?;
        self.path_index.write().remove(&entry.path);
        self.allocator.release(inode);
        Some(entry)
    }

    /// Decrement lookup count, remove if zero
    pub fn forget(&self, inode: Inode, nlookup: u64) {
        let should_remove = {
            let entries = self.entries.read();
            if let Some(entry) = entries.get(&inode) {
                let prev = entry.nlookup.fetch_sub(nlookup, Ordering::SeqCst);
                prev <= nlookup
            } else {
                false
            }
        };

        if should_remove {
            self.remove(inode);
        }
    }
}

/// VFS statistics
pub struct VfsStats {
    pub entries_count: AtomicU64,
    pub lookups: AtomicU64,
    pub lookup_misses: AtomicU64,
}
```

### InodeAllocator

```rust
/// Thread-safe inode allocator
pub struct InodeAllocator {
    /// Next inode to allocate
    next: AtomicU64,

    /// Free list (recycled inodes)
    free_list: Mutex<Vec<Inode>>,
}

impl InodeAllocator {
    pub fn new() -> Self {
        Self {
            next: AtomicU64::new(FIRST_USER_INODE),
            free_list: Mutex::new(Vec::with_capacity(1024)),
        }
    }

    pub fn allocate(&self) -> Inode {
        // Try free list first (recycle)
        if let Some(inode) = self.free_list.lock().pop() {
            return inode;
        }
        // Otherwise increment counter
        self.next.fetch_add(1, Ordering::SeqCst)
    }

    pub fn release(&self, inode: Inode) {
        if inode >= FIRST_USER_INODE {
            let mut free = self.free_list.lock();
            // Limit free list size to prevent unbounded growth
            if free.len() < 10_000 {
                free.push(inode);
            }
        }
    }
}
```

---

## 3. Cache Structures

### CacheEntry

```rust
/// Single cache entry
///
/// Memory: ~100 bytes + data
pub struct CacheEntry {
    /// Chunk identifier
    pub chunk_id: ChunkId,

    /// Cached data
    pub data: Arc<Vec<u8>>,

    /// BLAKE3 checksum
    pub checksum: [u8; 32],

    /// When fetched from network
    pub fetched_at: Instant,

    /// Last access (for LRU)
    pub last_access: AtomicU64,  // Instant as nanos

    /// Access count (for LFU component)
    pub access_count: AtomicU64,

    /// Size in bytes
    pub size: usize,
}

impl CacheEntry {
    pub fn touch(&self) {
        let now = Instant::now()
            .duration_since(std::time::Instant::now() - Duration::from_secs(86400))
            .as_nanos() as u64;
        self.last_access.store(now, Ordering::Relaxed);
        self.access_count.fetch_add(1, Ordering::Relaxed);
    }

    /// LRU-K eviction score (higher = keep longer)
    pub fn score(&self) -> f64 {
        let last = self.last_access.load(Ordering::Relaxed);
        let count = self.access_count.load(Ordering::Relaxed) as f64;
        let age_nanos = Instant::now()
            .duration_since(std::time::Instant::now() - Duration::from_secs(86400))
            .as_nanos() as u64
            - last;
        let age_secs = age_nanos as f64 / 1_000_000_000.0;

        // Score: frequency / age
        (count + 1.0) / (age_secs + 1.0)
    }
}
```

### L1Cache (RAM)

```rust
/// In-memory LRU cache
///
/// Memory: configured max + overhead (~10%)
pub struct L1Cache {
    /// Entries by chunk ID
    entries: RwLock<HashMap<ChunkId, Arc<CacheEntry>>>,

    /// Current size in bytes
    current_size: AtomicUsize,

    /// Maximum size in bytes
    max_size: usize,

    /// Statistics
    stats: CacheStats,
}

impl L1Cache {
    pub fn new(max_size: usize) -> Self {
        Self {
            entries: RwLock::new(HashMap::with_capacity(max_size / CHUNK_SIZE)),
            current_size: AtomicUsize::new(0),
            max_size,
            stats: CacheStats::default(),
        }
    }

    /// Get entry (returns None if not in L1)
    pub fn get(&self, chunk_id: &ChunkId) -> Option<Arc<CacheEntry>> {
        let entries = self.entries.read();
        if let Some(entry) = entries.get(chunk_id) {
            entry.touch();
            self.stats.l1_hits.fetch_add(1, Ordering::Relaxed);
            Some(Arc::clone(entry))
        } else {
            self.stats.l1_misses.fetch_add(1, Ordering::Relaxed);
            None
        }
    }

    /// Insert entry, evicting if necessary
    pub fn insert(&self, entry: CacheEntry) {
        let size = entry.size;
        let entry = Arc::new(entry);

        // Evict if needed
        while self.current_size.load(Ordering::Relaxed) + size > self.max_size {
            if !self.evict_one() {
                break;  // Nothing to evict
            }
        }

        let mut entries = self.entries.write();
        if let Some(old) = entries.insert(entry.chunk_id, entry) {
            self.current_size.fetch_sub(old.size, Ordering::Relaxed);
        }
        self.current_size.fetch_add(size, Ordering::Relaxed);
    }

    /// Evict lowest-scored entry
    fn evict_one(&self) -> bool {
        let mut entries = self.entries.write();

        // Find lowest score
        let victim = entries
            .iter()
            .min_by(|a, b| a.1.score().partial_cmp(&b.1.score()).unwrap())
            .map(|(k, _)| *k);

        if let Some(chunk_id) = victim {
            if let Some(entry) = entries.remove(&chunk_id) {
                self.current_size.fetch_sub(entry.size, Ordering::Relaxed);
                self.stats.l1_evictions.fetch_add(1, Ordering::Relaxed);
                return true;
            }
        }
        false
    }
}
```

### L2Cache (Disk)

```rust
/// On-disk persistent cache
///
/// Layout: ~/.cache/wormhole/
///   ├── index.db         (SQLite: chunk_id → file mapping)
///   └── chunks/
///       ├── 00/          (first byte of hash)
///       │   ├── 00/      (second byte)
///       │   │   └── <hash>.chunk
///       ...
pub struct L2Cache {
    /// Cache directory
    path: PathBuf,

    /// SQLite index
    index: Mutex<rusqlite::Connection>,

    /// Current size in bytes
    current_size: AtomicU64,

    /// Maximum size in bytes
    max_size: u64,

    /// Statistics
    stats: CacheStats,
}

impl L2Cache {
    /// Get chunk from disk
    pub async fn get(&self, chunk_id: &ChunkId) -> Option<Vec<u8>> {
        let path = self.chunk_path(chunk_id)?;

        match tokio::fs::read(&path).await {
            Ok(data) => {
                self.stats.l2_hits.fetch_add(1, Ordering::Relaxed);
                // Update access time in index
                self.touch(chunk_id);
                Some(data)
            }
            Err(_) => {
                self.stats.l2_misses.fetch_add(1, Ordering::Relaxed);
                None
            }
        }
    }

    /// Store chunk to disk
    pub async fn put(&self, chunk_id: ChunkId, data: &[u8], checksum: [u8; 32]) {
        // Evict if needed
        while self.current_size.load(Ordering::Relaxed) + data.len() as u64 > self.max_size {
            if !self.evict_oldest().await {
                break;
            }
        }

        let path = self.make_chunk_path(&checksum);

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }

        // Write atomically (write to temp, rename)
        let temp_path = path.with_extension("tmp");
        if tokio::fs::write(&temp_path, data).await.is_ok() {
            let _ = tokio::fs::rename(&temp_path, &path).await;

            // Update index
            self.index_insert(chunk_id, &path, data.len() as u64);
            self.current_size.fetch_add(data.len() as u64, Ordering::Relaxed);
        }
    }

    fn chunk_path(&self, chunk_id: &ChunkId) -> Option<PathBuf> {
        // Look up in index
        let conn = self.index.lock();
        let path: String = conn
            .query_row(
                "SELECT path FROM chunks WHERE inode = ? AND chunk_index = ?",
                params![chunk_id.inode, chunk_id.index],
                |row| row.get(0),
            )
            .ok()?;
        Some(PathBuf::from(path))
    }

    fn make_chunk_path(&self, checksum: &[u8; 32]) -> PathBuf {
        let hex = hex::encode(checksum);
        self.path
            .join("chunks")
            .join(&hex[0..2])
            .join(&hex[2..4])
            .join(format!("{}.chunk", hex))
    }
}
```

### CacheStats

```rust
/// Cache statistics
#[derive(Default)]
pub struct CacheStats {
    pub l1_hits: AtomicU64,
    pub l1_misses: AtomicU64,
    pub l1_evictions: AtomicU64,
    pub l2_hits: AtomicU64,
    pub l2_misses: AtomicU64,
    pub l2_evictions: AtomicU64,
    pub network_fetches: AtomicU64,
    pub bytes_from_cache: AtomicU64,
    pub bytes_from_network: AtomicU64,
}

impl CacheStats {
    pub fn l1_hit_rate(&self) -> f64 {
        let hits = self.l1_hits.load(Ordering::Relaxed) as f64;
        let misses = self.l1_misses.load(Ordering::Relaxed) as f64;
        if hits + misses > 0.0 {
            hits / (hits + misses)
        } else {
            0.0
        }
    }
}
```

---

## 4. Network Structures

### Session

```rust
/// Active connection session
pub struct Session {
    /// Unique session ID
    pub id: [u8; 16],

    /// Remote peer info
    pub peer: PeerInfo,

    /// QUIC connection
    pub connection: quinn::Connection,

    /// Send channel (to network task)
    pub tx: mpsc::Sender<NetMessage>,

    /// Connection state
    pub state: AtomicU8,  // ConnectionState as u8

    /// Connected at
    pub connected_at: Instant,

    /// Last activity
    pub last_active: AtomicU64,

    /// Bytes sent/received
    pub bytes_sent: AtomicU64,
    pub bytes_received: AtomicU64,
}
```

### PeerInfo

```rust
/// Information about a connected peer
pub struct PeerInfo {
    /// Peer identifier
    pub id: [u8; 16],

    /// Human-readable name
    pub name: String,

    /// Remote address
    pub addr: SocketAddr,

    /// Peer capabilities
    pub capabilities: HashSet<String>,
}
```

### RequestTracker

```rust
/// Track in-flight requests for response matching
pub struct RequestTracker {
    /// Request ID → response channel
    pending: RwLock<HashMap<u64, oneshot::Sender<NetMessage>>>,

    /// Next request ID
    next_id: AtomicU64,
}

impl RequestTracker {
    /// Register a new request
    pub fn register(&self) -> (u64, oneshot::Receiver<NetMessage>) {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = oneshot::channel();
        self.pending.write().insert(id, tx);
        (id, rx)
    }

    /// Complete a request with response
    pub fn complete(&self, id: u64, response: NetMessage) -> bool {
        if let Some(tx) = self.pending.write().remove(&id) {
            tx.send(response).is_ok()
        } else {
            false
        }
    }

    /// Cancel a request (timeout)
    pub fn cancel(&self, id: u64) {
        self.pending.write().remove(&id);
    }
}
```

---

## 5. Lock Structures

### LockTable

```rust
/// Server-side lock management
pub struct LockTable {
    /// Active locks by inode
    locks: RwLock<HashMap<Inode, LockState>>,

    /// Lock waiters (FIFO queue per inode)
    waiters: Mutex<HashMap<Inode, VecDeque<LockWaiter>>>,
}

pub struct LockState {
    /// Lock type
    pub lock_type: LockType,

    /// Token
    pub token: LockToken,

    /// Owner
    pub owner: ClientId,

    /// Granted at
    pub granted_at: Instant,

    /// Expires at
    pub expires_at: Instant,

    /// Shared lock count (for shared locks)
    pub share_count: u32,
}

pub struct LockWaiter {
    pub client: ClientId,
    pub lock_type: LockType,
    pub response: oneshot::Sender<Result<LockToken, LockError>>,
    pub deadline: Instant,
}

impl LockTable {
    /// Try to acquire a lock
    pub fn acquire(
        &self,
        inode: Inode,
        lock_type: LockType,
        client: ClientId,
        timeout: Duration,
    ) -> Result<LockToken, LockError> {
        let mut locks = self.locks.write();

        match locks.get_mut(&inode) {
            None => {
                // No existing lock, grant immediately
                let token = LockToken::generate();
                let state = LockState {
                    lock_type,
                    token: token.clone(),
                    owner: client,
                    granted_at: Instant::now(),
                    expires_at: Instant::now() + Duration::from_secs(30),
                    share_count: 1,
                };
                locks.insert(inode, state);
                Ok(token)
            }
            Some(existing) if existing.is_expired() => {
                // Expired, replace
                let token = LockToken::generate();
                *existing = LockState {
                    lock_type,
                    token: token.clone(),
                    owner: client,
                    granted_at: Instant::now(),
                    expires_at: Instant::now() + Duration::from_secs(30),
                    share_count: 1,
                };
                Ok(token)
            }
            Some(existing) if lock_type == LockType::Shared
                && existing.lock_type == LockType::Shared => {
                // Shared + Shared = OK
                existing.share_count += 1;
                Ok(existing.token.clone())
            }
            Some(_) => {
                // Conflict, need to wait
                Err(LockError::Conflict)
            }
        }
    }

    /// Release a lock
    pub fn release(&self, token: &LockToken) -> Result<(), LockError> {
        let mut locks = self.locks.write();

        for (inode, state) in locks.iter_mut() {
            if &state.token == token {
                state.share_count -= 1;
                if state.share_count == 0 {
                    let inode = *inode;
                    drop(locks);
                    self.locks.write().remove(&inode);
                    // Wake up next waiter
                    self.wake_next(inode);
                }
                return Ok(());
            }
        }
        Err(LockError::NotHeld)
    }
}
```

### LockToken

```rust
/// Opaque lock token
#[derive(Clone, PartialEq, Eq, Hash, Debug)]
#[derive(Serialize, Deserialize)]
pub struct LockToken(pub [u8; 16]);

impl LockToken {
    pub fn generate() -> Self {
        let mut bytes = [0u8; 16];
        getrandom::getrandom(&mut bytes).expect("RNG failed");
        Self(bytes)
    }
}
```

---

## 6. Concurrency Patterns

### Lock Selection Guide

| Data Type | Lock Type | Reason |
|-----------|-----------|--------|
| VFS entries | `RwLock` | Read-heavy (95% reads) |
| Cache entries | `RwLock` | Read-heavy |
| Lock table | `RwLock` | Mostly reads, writes rare |
| Free list | `Mutex` | Short critical section |
| Network send | `Mutex` | Serialized access |
| Statistics | `Atomic*` | No locking needed |

### Async/Sync Bridge

```rust
/// Bridge between sync FUSE calls and async network
pub struct ActorBridge {
    /// Channel to async actor
    tx: mpsc::Sender<ActorRequest>,

    /// Runtime handle for blocking_recv
    runtime: Handle,
}

pub struct ActorRequest {
    pub operation: Operation,
    pub reply: oneshot::Sender<ActorResponse>,
}

impl ActorBridge {
    /// Send request and wait for response (blocking)
    ///
    /// MUST be called from sync context (FUSE callback)
    pub fn request_sync(&self, op: Operation) -> Result<ActorResponse, Error> {
        let (tx, rx) = oneshot::channel();

        // Send to async actor
        self.tx.blocking_send(ActorRequest {
            operation: op,
            reply: tx,
        })?;

        // Wait for response
        rx.blocking_recv()
            .map_err(|_| Error::ActorDied)
    }
}

// Usage in FUSE callback:
fn read(&mut self, _req: &Request, ino: u64, ..., reply: ReplyData) {
    match self.bridge.request_sync(Operation::Read { inode: ino, offset, size }) {
        Ok(ActorResponse::Data(data)) => reply.data(&data),
        Ok(ActorResponse::Error(code)) => reply.error(code),
        Err(_) => reply.error(libc::EIO),
    }
}
```

### Lock Ordering (Deadlock Prevention)

Always acquire locks in this order:

```
1. VfsMap.entries
2. VfsMap.path_index
3. L1Cache.entries
4. LockTable.locks
5. LockTable.waiters
6. L2Cache.index
```

Never hold a lock while:
- Calling `.await`
- Sending on a channel
- Doing I/O

---

## 7. Serialization Formats

### Wire Format (bincode)

```rust
// All network messages use bincode with these settings:
pub fn serialize<T: Serialize>(value: &T) -> Result<Vec<u8>, bincode::Error> {
    bincode::options()
        .with_little_endian()
        .with_varint_encoding()
        .serialize(value)
}

pub fn deserialize<'a, T: Deserialize<'a>>(bytes: &'a [u8]) -> Result<T, bincode::Error> {
    bincode::options()
        .with_little_endian()
        .with_varint_encoding()
        .deserialize(bytes)
}
```

### Message Framing

```
┌─────────────────────────────────────────────────┐
│ Length (4 bytes, little-endian u32)             │
├─────────────────────────────────────────────────┤
│ Message Type (1 byte)                           │
├─────────────────────────────────────────────────┤
│ Payload (Length - 1 bytes, bincode)             │
└─────────────────────────────────────────────────┘
```

### Config Format (TOML)

```toml
# ~/.config/wormhole/config.toml

[network]
signal_url = "wss://signal.wormhole.dev"
timeout_ms = 30000
keepalive_ms = 10000

[cache]
l1_size = 268435456  # 256 MB
l2_path = "~/.cache/wormhole"
l2_max_size = 10737418240  # 10 GB
prefetch_enabled = true
prefetch_lookahead = 4

[log]
level = "info"
format = "pretty"  # or "json"
file = "~/.local/share/wormhole/logs/wormhole.log"
```

### Index Format (SQLite)

```sql
-- L2 cache index schema
CREATE TABLE chunks (
    inode INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    path TEXT NOT NULL,
    size INTEGER NOT NULL,
    checksum BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    accessed_at INTEGER NOT NULL,
    PRIMARY KEY (inode, chunk_index)
);

CREATE INDEX idx_accessed ON chunks(accessed_at);
CREATE INDEX idx_checksum ON chunks(checksum);
```
