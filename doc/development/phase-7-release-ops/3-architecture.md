# Phase 7 Architecture - Bi-Directional Write Support and File Locking

## Protocol Extensions

### teleport-core/src/protocol.rs additions

```rust
#[derive(Debug, Serialize, Deserialize)]
pub enum NetMessage {
    // Existing messages from Phase 1-2...
    Handshake { version: u32, client_id: String },
    ListRequest,
    ListResponse { root: DirEntry },
    ReadRequest { path: String, offset: u64, len: u32 },
    ReadResponse { data: Vec<u8> },
    ErrorResponse { code: u32, message: String },

    // Phase 7: Write Operations
    LockRequest {
        path: String,
        lock_type: LockType,
        client_id: String,
    },
    LockResponse {
        granted: bool,
        token: Option<LockToken>,
        expires_at: u64,  // Unix timestamp
        holder: Option<String>,  // Who holds it if denied
    },
    UnlockRequest {
        path: String,
        token: LockToken,
    },
    UnlockResponse {
        success: bool,
    },

    WriteRequest {
        path: String,
        offset: u64,
        data: Vec<u8>,
        lock_token: LockToken,
    },
    WriteAck {
        success: bool,
        bytes_written: u64,
        new_size: u64,  // Updated file size
    },

    CreateFileRequest {
        path: String,
        is_dir: bool,
    },
    CreateFileResponse {
        success: bool,
        ino: Option<u64>,
    },

    DeleteRequest {
        path: String,
        lock_token: LockToken,
    },
    DeleteResponse {
        success: bool,
    },

    TruncateRequest {
        path: String,
        size: u64,
        lock_token: LockToken,
    },
    TruncateResponse {
        success: bool,
    },

    // Metadata refresh after writes
    RefreshMetadataRequest {
        path: String,
    },
    RefreshMetadataResponse {
        entry: DirEntry,
    },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Eq, PartialEq, Hash)]
pub struct LockToken(pub u64);

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum LockType {
    /// Exclusive write lock
    Exclusive,
    /// Shared read lock (future: multiple readers)
    Shared,
}
```

## Host-Side Write Support

### teleport-daemon/src/host_write.rs

```rust
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::fs::{File, OpenOptions};
use std::io::{Seek, SeekFrom, Write};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;
use rand::Rng;

const LOCK_TTL: Duration = Duration::from_secs(60);
const LOCK_RENEWAL_THRESHOLD: Duration = Duration::from_secs(30);

#[derive(Debug, Clone)]
struct LockEntry {
    token: LockToken,
    client_id: String,
    lock_type: LockType,
    acquired_at: Instant,
    expires_at: Instant,
}

pub struct LockManager {
    locks: RwLock<HashMap<PathBuf, LockEntry>>,
    root_path: PathBuf,
}

impl LockManager {
    pub fn new(root_path: PathBuf) -> Self {
        Self {
            locks: RwLock::new(HashMap::new()),
            root_path,
        }
    }

    /// Attempt to acquire a lock
    pub async fn acquire(
        &self,
        path: &str,
        lock_type: LockType,
        client_id: &str,
    ) -> Result<(LockToken, u64), LockError> {
        let full_path = self.sanitize_path(path)?;

        let mut locks = self.locks.write().await;

        // Clean expired locks first
        self.cleanup_expired(&mut locks);

        // Check if already locked
        if let Some(existing) = locks.get(&full_path) {
            if existing.client_id != client_id {
                return Err(LockError::AlreadyLocked {
                    holder: existing.client_id.clone(),
                });
            }
            // Same client - renewal
            let entry = locks.get_mut(&full_path).unwrap();
            entry.expires_at = Instant::now() + LOCK_TTL;
            let expires_unix = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs() + LOCK_TTL.as_secs();
            return Ok((entry.token, expires_unix));
        }

        // Grant new lock
        let token = LockToken(rand::thread_rng().gen());
        let now = Instant::now();
        let expires_unix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() + LOCK_TTL.as_secs();

        locks.insert(full_path, LockEntry {
            token,
            client_id: client_id.to_string(),
            lock_type,
            acquired_at: now,
            expires_at: now + LOCK_TTL,
        });

        Ok((token, expires_unix))
    }

    /// Release a lock
    pub async fn release(&self, path: &str, token: LockToken) -> Result<(), LockError> {
        let full_path = self.sanitize_path(path)?;
        let mut locks = self.locks.write().await;

        match locks.get(&full_path) {
            Some(entry) if entry.token == token => {
                locks.remove(&full_path);
                Ok(())
            }
            Some(_) => Err(LockError::InvalidToken),
            None => Err(LockError::NotLocked),
        }
    }

    /// Verify a lock is valid
    pub async fn verify(&self, path: &str, token: LockToken) -> bool {
        let Ok(full_path) = self.sanitize_path(path) else {
            return false;
        };

        let locks = self.locks.read().await;
        locks.get(&full_path)
            .map(|e| e.token == token && e.expires_at > Instant::now())
            .unwrap_or(false)
    }

    fn cleanup_expired(&self, locks: &mut HashMap<PathBuf, LockEntry>) {
        let now = Instant::now();
        locks.retain(|_, entry| entry.expires_at > now);
    }

    fn sanitize_path(&self, rel_path: &str) -> Result<PathBuf, LockError> {
        let full = self.root_path.join(rel_path).canonicalize()
            .map_err(|_| LockError::PathNotFound)?;

        if !full.starts_with(&self.root_path) {
            return Err(LockError::PathTraversal);
        }
        Ok(full)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum LockError {
    #[error("Path not found")]
    PathNotFound,
    #[error("Path traversal detected")]
    PathTraversal,
    #[error("Already locked by {holder}")]
    AlreadyLocked { holder: String },
    #[error("Invalid lock token")]
    InvalidToken,
    #[error("Not locked")]
    NotLocked,
}

/// Apply a write operation to disk
pub fn apply_write(
    root: &Path,
    rel_path: &str,
    offset: u64,
    data: &[u8],
) -> Result<(u64, u64), WriteError> {
    // Sanitize path
    let full_path = root.join(rel_path).canonicalize()
        .map_err(|_| WriteError::PathNotFound)?;

    if !full_path.starts_with(root) {
        return Err(WriteError::PathTraversal);
    }

    // Open for writing
    let mut file = OpenOptions::new()
        .write(true)
        .open(&full_path)
        .map_err(|e| WriteError::IoError(e.to_string()))?;

    // Seek to offset
    file.seek(SeekFrom::Start(offset))
        .map_err(|e| WriteError::IoError(e.to_string()))?;

    // Write data
    let bytes_written = file.write(data)
        .map_err(|e| WriteError::IoError(e.to_string()))? as u64;

    // Sync to disk
    file.sync_all()
        .map_err(|e| WriteError::IoError(e.to_string()))?;

    // Get new size
    let metadata = file.metadata()
        .map_err(|e| WriteError::IoError(e.to_string()))?;
    let new_size = metadata.len();

    Ok((bytes_written, new_size))
}

/// Create a new file or directory
pub fn create_entry(
    root: &Path,
    rel_path: &str,
    is_dir: bool,
) -> Result<(), WriteError> {
    let full_path = root.join(rel_path);

    // Ensure parent exists
    if let Some(parent) = full_path.parent() {
        if !parent.exists() {
            return Err(WriteError::ParentNotFound);
        }
    }

    // Check for path traversal in the intended path
    if rel_path.contains("..") {
        return Err(WriteError::PathTraversal);
    }

    if is_dir {
        std::fs::create_dir(&full_path)
            .map_err(|e| WriteError::IoError(e.to_string()))?;
    } else {
        File::create(&full_path)
            .map_err(|e| WriteError::IoError(e.to_string()))?;
    }

    Ok(())
}

/// Delete a file or directory
pub fn delete_entry(root: &Path, rel_path: &str) -> Result<(), WriteError> {
    let full_path = root.join(rel_path).canonicalize()
        .map_err(|_| WriteError::PathNotFound)?;

    if !full_path.starts_with(root) {
        return Err(WriteError::PathTraversal);
    }

    if full_path.is_dir() {
        std::fs::remove_dir_all(&full_path)
            .map_err(|e| WriteError::IoError(e.to_string()))?;
    } else {
        std::fs::remove_file(&full_path)
            .map_err(|e| WriteError::IoError(e.to_string()))?;
    }

    Ok(())
}

/// Truncate a file
pub fn truncate_file(root: &Path, rel_path: &str, size: u64) -> Result<(), WriteError> {
    let full_path = root.join(rel_path).canonicalize()
        .map_err(|_| WriteError::PathNotFound)?;

    if !full_path.starts_with(root) {
        return Err(WriteError::PathTraversal);
    }

    let file = OpenOptions::new()
        .write(true)
        .open(&full_path)
        .map_err(|e| WriteError::IoError(e.to_string()))?;

    file.set_len(size)
        .map_err(|e| WriteError::IoError(e.to_string()))?;

    Ok(())
}

#[derive(Debug, thiserror::Error)]
pub enum WriteError {
    #[error("Path not found")]
    PathNotFound,
    #[error("Parent directory not found")]
    ParentNotFound,
    #[error("Path traversal detected")]
    PathTraversal,
    #[error("I/O error: {0}")]
    IoError(String),
}
```

## Client-Side Dirty Tracking

### teleport-daemon/src/cache.rs additions

```rust
use std::collections::HashSet;

impl HybridCache {
    /// Track dirty chunks for sync
    dirty_set: Arc<RwLock<HashSet<ChunkId>>>,

    /// Write to local cache and mark dirty
    pub async fn write_local(&self, chunk_id: ChunkId, data: Vec<u8>) {
        // Insert into RAM cache
        let arc_data = Arc::new(data.clone());
        self.ram_cache.write().put(chunk_id.clone(), arc_data);

        // Mark as dirty (needs sync to host)
        self.dirty_set.write().await.insert(chunk_id.clone());

        // Async write to disk cache
        let disk_cache = self.disk_cache.clone();
        tokio::spawn(async move {
            disk_cache.write(chunk_id, &data).await.ok();
        });
    }

    /// Clear dirty flag after successful sync
    pub async fn clear_dirty(&self, chunk_id: &ChunkId) {
        self.dirty_set.write().await.remove(chunk_id);
    }

    /// Get all dirty chunks
    pub async fn get_dirty_chunks(&self) -> Vec<ChunkId> {
        self.dirty_set.read().await.iter().cloned().collect()
    }

    /// Check if chunk is dirty
    pub async fn is_dirty(&self, chunk_id: &ChunkId) -> bool {
        self.dirty_set.read().await.contains(chunk_id)
    }

    /// Get dirty count for UI
    pub async fn dirty_count(&self) -> usize {
        self.dirty_set.read().await.len()
    }
}
```

## Sync Engine

### teleport-daemon/src/sync_engine.rs

```rust
use std::collections::VecDeque;
use tokio::sync::mpsc;

pub enum SyncMessage {
    /// Queue chunk for upload
    QueueChunk {
        chunk_id: ChunkId,
        priority: SyncPriority,
    },
    /// Force sync all dirty chunks
    FlushAll,
    /// Shutdown
    Shutdown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum SyncPriority {
    Low,      // Background prefetch writes
    Normal,   // Regular file modifications
    High,     // User-initiated save
}

pub struct SyncEngine {
    rx: mpsc::Receiver<SyncMessage>,
    cache: Arc<HybridCache>,
    connection: Connection,
    lock_manager_client: LockManagerClient,

    // Pending uploads
    queue: VecDeque<(ChunkId, SyncPriority)>,

    // Concurrent upload limit
    max_concurrent: usize,
    in_flight: usize,
}

impl SyncEngine {
    pub fn new(
        rx: mpsc::Receiver<SyncMessage>,
        cache: Arc<HybridCache>,
        connection: Connection,
    ) -> Self {
        Self {
            rx,
            cache,
            connection,
            lock_manager_client: LockManagerClient::new(),
            queue: VecDeque::new(),
            max_concurrent: 4,
            in_flight: 0,
        }
    }

    pub async fn run(mut self, event_tx: broadcast::Sender<ServiceEvent>) {
        let mut interval = tokio::time::interval(Duration::from_secs(5));

        loop {
            tokio::select! {
                Some(msg) = self.rx.recv() => {
                    match msg {
                        SyncMessage::QueueChunk { chunk_id, priority } => {
                            self.enqueue(chunk_id, priority);
                        }
                        SyncMessage::FlushAll => {
                            self.flush_all(&event_tx).await;
                        }
                        SyncMessage::Shutdown => break,
                    }
                }
                _ = interval.tick() => {
                    // Periodic sync of dirty chunks
                    self.process_queue(&event_tx).await;
                }
            }
        }
    }

    fn enqueue(&mut self, chunk_id: ChunkId, priority: SyncPriority) {
        // Insert sorted by priority (higher first)
        let pos = self.queue.iter()
            .position(|(_, p)| *p < priority)
            .unwrap_or(self.queue.len());
        self.queue.insert(pos, (chunk_id, priority));
    }

    async fn process_queue(&mut self, event_tx: &broadcast::Sender<ServiceEvent>) {
        while self.in_flight < self.max_concurrent {
            let Some((chunk_id, _)) = self.queue.pop_front() else {
                break;
            };

            // Skip if no longer dirty
            if !self.cache.is_dirty(&chunk_id).await {
                continue;
            }

            self.in_flight += 1;
            let result = self.upload_chunk(&chunk_id).await;
            self.in_flight -= 1;

            match result {
                Ok(()) => {
                    self.cache.clear_dirty(&chunk_id).await;
                    event_tx.send(ServiceEvent::ChunkSynced {
                        path: chunk_id.file_path.clone(),
                        chunk_index: chunk_id.chunk_index,
                    }).ok();
                }
                Err(e) => {
                    // Re-queue for retry
                    self.queue.push_back((chunk_id.clone(), SyncPriority::Low));
                    event_tx.send(ServiceEvent::SyncError {
                        path: chunk_id.file_path,
                        error: e.to_string(),
                    }).ok();
                }
            }
        }

        // Emit progress
        let dirty_count = self.cache.dirty_count().await;
        if dirty_count > 0 {
            event_tx.send(ServiceEvent::SyncProgress {
                pending: dirty_count,
                in_flight: self.in_flight,
            }).ok();
        }
    }

    async fn upload_chunk(&self, chunk_id: &ChunkId) -> Result<()> {
        // 1. Acquire lock
        let lock_token = self.lock_manager_client
            .acquire(&self.connection, &chunk_id.file_path, LockType::Exclusive)
            .await?;

        // 2. Get chunk data from cache
        let data = self.cache.get(chunk_id).await
            .ok_or_else(|| anyhow!("Chunk not in cache"))?;

        // 3. Send write request
        let offset = chunk_id.start_offset();
        let (mut send, mut recv) = self.connection.open_bi().await?;

        let request = NetMessage::WriteRequest {
            path: chunk_id.file_path.clone(),
            offset,
            data: data.to_vec(),
            lock_token,
        };

        send.write_all(&bincode::serialize(&request)?).await?;
        send.finish().await?;

        // 4. Read acknowledgment
        let response_data = recv.read_to_end(10 * 1024 * 1024).await?;
        let response: NetMessage = bincode::deserialize(&response_data)?;

        match response {
            NetMessage::WriteAck { success: true, .. } => Ok(()),
            NetMessage::WriteAck { success: false, .. } => {
                Err(anyhow!("Write rejected by host"))
            }
            NetMessage::ErrorResponse { message, .. } => {
                Err(anyhow!("Host error: {}", message))
            }
            _ => Err(anyhow!("Unexpected response")),
        }

        // Note: lock auto-expires, but we could explicitly release
    }

    async fn flush_all(&mut self, event_tx: &broadcast::Sender<ServiceEvent>) {
        let dirty = self.cache.get_dirty_chunks().await;
        for chunk_id in dirty {
            self.enqueue(chunk_id, SyncPriority::High);
        }
        while !self.queue.is_empty() {
            self.process_queue(event_tx).await;
        }
    }
}
```

## FUSE Write Implementation

### teleport-daemon/src/fs.rs additions

```rust
impl Filesystem for TeleportFS {
    fn write(
        &mut self,
        _req: &Request,
        ino: u64,
        _fh: u64,
        offset: i64,
        data: &[u8],
        _write_flags: u32,
        _flags: i32,
        _lock_owner: Option<u64>,
        reply: ReplyWrite,
    ) {
        let offset = offset as u64;
        let size = data.len();

        // Get file path
        let path = match self.vfs.read().get_path(ino) {
            Some(p) => p.to_string(),
            None => {
                reply.error(libc::ENOENT);
                return;
            }
        };

        // Read-Modify-Write for chunk alignment
        let start_chunk = ChunkId::from_offset(&path, offset);
        let end_chunk = ChunkId::from_offset(&path, offset + size as u64);

        for chunk_idx in start_chunk.chunk_index..=end_chunk.chunk_index {
            let chunk_id = ChunkId {
                file_path: path.clone(),
                chunk_index: chunk_idx,
            };

            // Fetch existing chunk (may be partial read)
            let existing = self.fetch_chunk_blocking(&chunk_id)
                .unwrap_or_else(|_| vec![0u8; CHUNK_SIZE]);

            let mut chunk_data = existing;
            chunk_data.resize(CHUNK_SIZE, 0);

            // Calculate slice within this chunk
            let chunk_start = chunk_id.start_offset();
            let write_start = if offset > chunk_start {
                (offset - chunk_start) as usize
            } else {
                0
            };
            let data_offset = if chunk_start > offset {
                (chunk_start - offset) as usize
            } else {
                0
            };
            let write_len = std::cmp::min(
                CHUNK_SIZE - write_start,
                size - data_offset,
            );

            // Modify chunk
            chunk_data[write_start..write_start + write_len]
                .copy_from_slice(&data[data_offset..data_offset + write_len]);

            // Write to local cache
            let rt = tokio::runtime::Handle::current();
            rt.block_on(self.cache.write_local(chunk_id.clone(), chunk_data));

            // Queue for sync
            let _ = self.sync_tx.try_send(SyncMessage::QueueChunk {
                chunk_id,
                priority: SyncPriority::Normal,
            });
        }

        // Update VFS metadata (size, mtime)
        {
            let mut vfs = self.vfs.write();
            if let Some(attr) = vfs.get_attr_mut(ino) {
                let new_end = offset + size as u64;
                if new_end > attr.size {
                    attr.size = new_end;
                }
                attr.mtime = SystemTime::now();
            }
        }

        reply.written(size as u32);
    }

    fn create(
        &mut self,
        _req: &Request,
        parent: u64,
        name: &OsStr,
        _mode: u32,
        _umask: u32,
        _flags: i32,
        reply: ReplyCreate,
    ) {
        let name_str = name.to_string_lossy();
        let parent_path = match self.vfs.read().get_path(parent) {
            Some(p) => p.to_string(),
            None => {
                reply.error(libc::ENOENT);
                return;
            }
        };

        let new_path = format!("{}/{}", parent_path, name_str);

        // Send create request to host
        let (tx, rx) = oneshot::channel();
        if self.actor_tx.blocking_send(ActorMessage::CreateFile {
            path: new_path.clone(),
            is_dir: false,
            responder: tx,
        }).is_err() {
            reply.error(libc::EIO);
            return;
        }

        match rx.blocking_recv() {
            Ok(Ok(ino)) => {
                // Add to local VFS
                let attr = self.vfs.write().add_file(&new_path, ino, 0);
                reply.created(&TTL, &attr, 0, 0, 0);
            }
            _ => {
                reply.error(libc::EIO);
            }
        }
    }

    fn setattr(
        &mut self,
        _req: &Request,
        ino: u64,
        _mode: Option<u32>,
        _uid: Option<u32>,
        _gid: Option<u32>,
        size: Option<u64>,
        _atime: Option<TimeOrNow>,
        _mtime: Option<TimeOrNow>,
        _ctime: Option<SystemTime>,
        _fh: Option<u64>,
        _crtime: Option<SystemTime>,
        _chgtime: Option<SystemTime>,
        _bkuptime: Option<SystemTime>,
        _flags: Option<u32>,
        reply: ReplyAttr,
    ) {
        // Handle truncate
        if let Some(new_size) = size {
            let path = match self.vfs.read().get_path(ino) {
                Some(p) => p.to_string(),
                None => {
                    reply.error(libc::ENOENT);
                    return;
                }
            };

            // Send truncate to host
            let (tx, rx) = oneshot::channel();
            if self.actor_tx.blocking_send(ActorMessage::Truncate {
                path,
                size: new_size,
                responder: tx,
            }).is_err() {
                reply.error(libc::EIO);
                return;
            }

            if rx.blocking_recv().is_err() {
                reply.error(libc::EIO);
                return;
            }

            // Update local VFS
            if let Some(attr) = self.vfs.write().get_attr_mut(ino) {
                attr.size = new_size;
            }
        }

        // Return updated attr
        if let Some(attr) = self.vfs.read().get_attr(ino) {
            reply.attr(&TTL, attr);
        } else {
            reply.error(libc::ENOENT);
        }
    }

    fn unlink(&mut self, _req: &Request, parent: u64, name: &OsStr, reply: ReplyEmpty) {
        let name_str = name.to_string_lossy();
        let parent_path = match self.vfs.read().get_path(parent) {
            Some(p) => p.to_string(),
            None => {
                reply.error(libc::ENOENT);
                return;
            }
        };

        let path = format!("{}/{}", parent_path, name_str);

        // Send delete to host
        let (tx, rx) = oneshot::channel();
        if self.actor_tx.blocking_send(ActorMessage::Delete {
            path: path.clone(),
            responder: tx,
        }).is_err() {
            reply.error(libc::EIO);
            return;
        }

        match rx.blocking_recv() {
            Ok(Ok(())) => {
                // Remove from local VFS
                self.vfs.write().remove_entry(&path);
                reply.ok();
            }
            _ => reply.error(libc::EIO),
        }
    }
}
```

## Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           WRITE PATH                                          │
└──────────────────────────────────────────────────────────────────────────────┘

  User Application              FUSE                    Cache               Host
       │                         │                        │                   │
       │  write(fd, data)        │                        │                   │
       │ ──────────────────────► │                        │                   │
       │                         │                        │                   │
       │                         │  1. Read-Modify-Write  │                   │
       │                         │  ───────────────────►  │                   │
       │                         │  (fetch existing chunk)│                   │
       │                         │  ◄───────────────────  │                   │
       │                         │                        │                   │
       │                         │  2. write_local()      │                   │
       │                         │  ───────────────────►  │                   │
       │                         │                        │                   │
       │  ◄───────────────────── │  3. Return immediately │                   │
       │  (write complete)       │     (local cache hit)  │                   │
       │                         │                        │                   │
       │                         │                        │                   │
       │                         │      SyncEngine        │                   │
       │                         │         │              │                   │
       │                         │         │ 4. Acquire   │                   │
       │                         │         │    lock      │ ────────────────► │
       │                         │         │              │ ◄──────────────── │
       │                         │         │              │  LockToken        │
       │                         │         │              │                   │
       │                         │         │ 5. Upload    │                   │
       │                         │         │    chunk     │ ────────────────► │
       │                         │         │              │                   │
       │                         │         │              │  apply_write()    │
       │                         │         │              │                   │
       │                         │         │ 6. WriteAck  │ ◄──────────────── │
       │                         │         │              │                   │
       │                         │         │ 7. clear_    │                   │
       │                         │         │    dirty()   │                   │
       │                         │         ▼              │                   │


┌──────────────────────────────────────────────────────────────────────────────┐
│                         LOCK LIFECYCLE                                        │
└──────────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────┐
  │    Unlocked     │ ◄───────────────────────────────────────┐
  └────────┬────────┘                                         │
           │                                                  │
           │ LockRequest                                      │
           ▼                                                  │
  ┌─────────────────┐                                         │
  │    Locked       │──── TTL expires (60s) ──────────────────┤
  │  (token: xyz)   │                                         │
  └────────┬────────┘                                         │
           │                                                  │
           ├── WriteRequest (with token) ─────► Allowed       │
           │                                                  │
           ├── WriteRequest (wrong token) ────► Rejected      │
           │                                                  │
           │ UnlockRequest                                    │
           └──────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────┐
│                      CONFLICT RESOLUTION                                      │
└──────────────────────────────────────────────────────────────────────────────┘

  Scenario: Client A and Client B both modify same file

  Client A                     Host                     Client B
      │                         │                           │
      │  LockRequest(/doc.txt)  │                           │
      │ ──────────────────────► │                           │
      │                         │                           │
      │  LockResponse(token=1)  │                           │
      │ ◄────────────────────── │                           │
      │                         │                           │
      │                         │   LockRequest(/doc.txt)   │
      │                         │ ◄──────────────────────── │
      │                         │                           │
      │                         │   LockResponse(denied,    │
      │                         │      holder="A")          │
      │                         │ ────────────────────────► │
      │                         │                           │
      │  WriteRequest(token=1)  │                           │
      │ ──────────────────────► │                           │
      │                         │                           │
      │  WriteAck(success)      │                           │
      │ ◄────────────────────── │                           │
      │                         │                           │
      │  UnlockRequest          │                           │
      │ ──────────────────────► │                           │
      │                         │                           │
      │                         │   LockRequest(/doc.txt)   │
      │                         │ ◄──────────────────────── │
      │                         │                           │
      │                         │   LockResponse(token=2)   │
      │                         │ ────────────────────────► │
```

## Extended Service Events

```rust
#[derive(Clone, Debug)]
pub enum ServiceEvent {
    // Existing...
    HostStarted { port: u16, share_path: PathBuf },
    ClientConnected { peer_addr: SocketAddr },
    MountReady { mountpoint: PathBuf },
    Error { message: String },

    // Phase 7 additions
    ChunkSynced { path: String, chunk_index: u64 },
    SyncProgress { pending: usize, in_flight: usize },
    SyncError { path: String, error: String },
    SyncComplete,

    LockAcquired { path: String },
    LockDenied { path: String, holder: String },
    LockReleased { path: String },

    FileCreated { path: String },
    FileDeleted { path: String },
}
```

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| LOCK_TTL | 60s | Time until lock auto-expires |
| LOCK_RENEWAL_THRESHOLD | 30s | Renew lock if < this remaining |
| SYNC_INTERVAL | 5s | Background sync check interval |
| MAX_CONCURRENT_UPLOADS | 4 | Parallel chunk uploads |
| WRITE_QUEUE_SIZE | 1000 | Max pending write chunks |

## Security Considerations

| Risk | Mitigation |
|------|------------|
| Lock starvation | TTL ensures locks expire even if client crashes |
| Write amplification | Chunk-aligned writes minimize disk I/O |
| Race conditions | Lock token validation on every write |
| Data loss | Sync engine persists to disk before upload |
| Partial writes | Atomic rename for chunk files |
