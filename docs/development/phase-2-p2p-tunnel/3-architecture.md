# Phase 2 Architecture

## Protocol Extension

```rust
// crates/teleport-core/src/protocol.rs (additions)
#[derive(Debug, Serialize, Deserialize)]
pub enum NetMessage {
    // From Phase 1
    Handshake { version: u32, client_id: String },
    ListRequest,
    ListResponse { root: DirEntry },

    // Phase 2 additions
    ReadRequest {
        path: String,      // Relative path from share root
        offset: u64,       // Byte offset
        len: u32,          // Bytes to read (max 10MB)
    },
    ReadResponse {
        data: Vec<u8>,     // File contents
    },
    ErrorResponse {
        code: u32,         // errno-style code
        message: String,   // Human-readable message
    },
}
```

## Host Data Path

```
┌─────────────────────────────────────────────────────────────┐
│ host.rs - Message Handler                                   │
│   match NetMessage::ReadRequest { path, offset, len }       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ disk_io.rs - Safe File Access                               │
│   1. Sanitize path (canonicalize, check prefix)             │
│   2. Open file with read permissions                        │
│   3. Seek to offset                                         │
│   4. Read exactly len bytes (or to EOF)                     │
│   5. Return data or error                                   │
└─────────────────────────────────────────────────────────────┘

// disk_io.rs key functions:
pub fn read_range(root: &Path, rel_path: &str, offset: u64, len: u32) -> Result<Vec<u8>>

// Security: Path sanitization
fn sanitize_path(root: &Path, rel_path: &str) -> Result<PathBuf> {
    let full = root.join(rel_path).canonicalize()?;
    if !full.starts_with(root.canonicalize()?) {
        return Err(Error::PathTraversal);
    }
    if rel_path.contains("..") {
        return Err(Error::PathTraversal);
    }
    Ok(full)
}
```

## Client Actor Pattern (Async/Sync Bridge)

The critical challenge: FUSE callbacks are **synchronous**, but QUIC operations are **async**.

```
┌─────────────────────────────────────────────────────────────┐
│ fs.rs - FUSE read() callback (SYNC THREAD)                  │
│   1. Create oneshot channel (tx, rx)                        │
│   2. Send FetchRequest { path, offset, len, tx } to actor   │
│   3. Block on rx.blocking_recv()                            │
│   4. Return data to kernel or error                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ mpsc::Sender.blocking_send()
┌─────────────────────────────────────────────────────────────┐
│ client_actor.rs - Async Actor (TOKIO TASK)                  │
│   loop {                                                    │
│       let req = rx.recv().await;                            │
│       let data = fetch_data_segment(req).await;             │
│       req.responder.send(data);                             │
│   }                                                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ client.rs - QUIC Request (ASYNC)                            │
│   pub async fn fetch_data_segment(                          │
│       connection: &Connection,                              │
│       path: &str,                                           │
│       offset: u64,                                          │
│       len: u32                                              │
│   ) -> Result<Vec<u8>>                                      │
└─────────────────────────────────────────────────────────────┘
```

### Actor Message Types

```rust
// client_actor.rs
pub enum ActorMessage {
    FetchData {
        path: String,
        offset: u64,
        len: u32,
        responder: oneshot::Sender<Result<Vec<u8>>>,
    },
}

pub struct ClientActor {
    rx: mpsc::Receiver<ActorMessage>,
    connection: Connection,  // QUIC connection
}

impl ClientActor {
    pub async fn run(mut self) {
        while let Some(msg) = self.rx.recv().await {
            match msg {
                ActorMessage::FetchData { path, offset, len, responder } => {
                    let result = client::fetch_data_segment(
                        &self.connection, &path, offset, len
                    ).await;
                    let _ = responder.send(result);
                }
            }
        }
    }
}
```

## VFS Extensions

```rust
// vfs.rs additions
pub struct VirtualFilesystem {
    inodes: HashMap<u64, VfsEntry>,
    children: HashMap<u64, Vec<(String, u64)>>,

    // Phase 2 addition: reverse mapping for reads
    inode_to_path: HashMap<u64, String>,  // ino → relative path
}

impl VirtualFilesystem {
    pub fn get_path(&self, ino: u64) -> Option<&str> {
        self.inode_to_path.get(&ino).map(|s| s.as_str())
    }
}
```

## Read Clustering

To reduce round-trips, cluster small reads into larger requests:

```rust
// fs.rs read implementation
fn read(&mut self, _req: &Request, ino: u64, fh: u64,
        offset: i64, size: u32, ..., reply: ReplyData) {

    // Cluster: always fetch at least 64KB
    let fetch_size = std::cmp::max(size, 64 * 1024);

    let path = self.vfs.read().get_path(ino);
    let (tx, rx) = oneshot::channel();

    self.actor_tx.blocking_send(ActorMessage::FetchData {
        path: path.to_string(),
        offset: offset as u64,
        len: fetch_size,
        responder: tx,
    })?;

    match rx.blocking_recv()? {
        Ok(data) => {
            // Return only requested portion
            let end = std::cmp::min(size as usize, data.len());
            reply.data(&data[..end]);
        }
        Err(e) => reply.error(libc::EIO),
    }
}
```

## Error Mapping

```rust
// Map host errors to FUSE errno
fn map_error(err: &ErrorResponse) -> i32 {
    match err.code {
        1 => libc::ENOENT,    // Not found
        2 => libc::EACCES,    // Permission denied
        3 => libc::EISDIR,    // Is a directory
        4 => libc::ENOTDIR,   // Not a directory
        _ => libc::EIO,       // Generic I/O error
    }
}
```

## Connection Management (MVP)

For Phase 2, use reconnect-per-request as MVP:
- Simple, no connection state management
- Higher latency but acceptable for initial implementation
- Persistent connection optimization deferred to Phase 3

```rust
// client.rs - MVP approach
pub async fn fetch_data_segment(...) -> Result<Vec<u8>> {
    // Create new connection for each request (MVP)
    let connection = endpoint.connect(server_addr, "localhost")?.await?;

    let (mut send, mut recv) = connection.open_bi().await?;
    // ... send request, receive response

    connection.close(0u32.into(), b"done");
    Ok(data)
}
```
