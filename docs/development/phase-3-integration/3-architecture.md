# Phase 3 Architecture - Streaming Governor and Smart Caching

## Core Abstractions

### storage_defs.rs - Chunk Addressing

```rust
pub const CHUNK_SIZE: usize = 128 * 1024;  // 128KB - optimal for network + SSD

#[derive(Hash, Eq, PartialEq, Clone, Copy, Debug)]
pub struct ChunkId {
    pub file_path: String,   // Relative path from share root
    pub chunk_index: u64,    // 0-indexed chunk number
}

impl ChunkId {
    pub fn from_offset(file_path: &str, offset: u64) -> Self {
        Self {
            file_path: file_path.to_string(),
            chunk_index: offset / CHUNK_SIZE as u64,
        }
    }

    pub fn start_offset(&self) -> u64 {
        self.chunk_index * CHUNK_SIZE as u64
    }

    pub fn end_offset(&self) -> u64 {
        (self.chunk_index + 1) * CHUNK_SIZE as u64
    }
}
```

### cache.rs - RAM LRU Cache

```rust
use lru::LruCache;
use std::sync::{Arc, RwLock};

pub struct RamCache {
    // ~4000 chunks × 128KB = ~500MB max RAM usage
    cache: Arc<RwLock<LruCache<ChunkId, Arc<Vec<u8>>>>>,
    capacity: usize,
}

impl RamCache {
    pub fn new(capacity: usize) -> Self {
        Self {
            cache: Arc::new(RwLock::new(
                LruCache::new(std::num::NonZeroUsize::new(capacity).unwrap())
            )),
            capacity,
        }
    }

    pub fn get(&self, chunk_id: &ChunkId) -> Option<Arc<Vec<u8>>> {
        // Promotes to front (LRU update)
        self.cache.write().unwrap().get(chunk_id).cloned()
    }

    pub fn peek(&self, chunk_id: &ChunkId) -> Option<Arc<Vec<u8>>> {
        // Read without LRU promotion (for checking)
        self.cache.read().unwrap().peek(chunk_id).cloned()
    }

    pub fn insert(&self, chunk_id: ChunkId, data: Vec<u8>) {
        self.cache.write().unwrap().put(chunk_id, Arc::new(data));
    }

    pub fn contains(&self, chunk_id: &ChunkId) -> bool {
        self.cache.read().unwrap().contains(chunk_id)
    }
}
```

### governor.rs - Sequential Access Detection & Prefetch

```rust
use std::collections::HashMap;

pub struct Governor {
    // Track per-file access patterns
    file_state: HashMap<String, FileAccessState>,
    // Prefetch configuration
    prefetch_window: usize,  // How many chunks ahead to fetch
}

struct FileAccessState {
    last_chunk: u64,         // Last accessed chunk index
    sequential_streak: u32,  // Consecutive sequential accesses
    direction: AccessDirection,
}

enum AccessDirection {
    Forward,
    Backward,
    Random,
}

impl Governor {
    pub fn new() -> Self {
        Self {
            file_state: HashMap::new(),
            prefetch_window: 5,  // Prefetch up to 5 chunks ahead
        }
    }

    /// Record access and return prefetch targets
    pub fn record_access(&mut self, chunk_id: &ChunkId) -> Vec<ChunkId> {
        let state = self.file_state
            .entry(chunk_id.file_path.clone())
            .or_insert(FileAccessState {
                last_chunk: chunk_id.chunk_index,
                sequential_streak: 0,
                direction: AccessDirection::Random,
            });

        let diff = chunk_id.chunk_index as i64 - state.last_chunk as i64;

        // Update pattern detection
        match diff {
            1 => {
                state.sequential_streak += 1;
                state.direction = AccessDirection::Forward;
            }
            -1 => {
                state.sequential_streak += 1;
                state.direction = AccessDirection::Backward;
            }
            0 => {
                // Same chunk, no update
            }
            _ => {
                // Random access, reset streak
                state.sequential_streak = 0;
                state.direction = AccessDirection::Random;
            }
        }

        state.last_chunk = chunk_id.chunk_index;

        // Generate prefetch targets if sequential pattern detected
        if state.sequential_streak >= 3 {
            self.generate_prefetch_targets(chunk_id, &state.direction)
        } else {
            vec![]
        }
    }

    fn generate_prefetch_targets(&self, current: &ChunkId, direction: &AccessDirection) -> Vec<ChunkId> {
        let mut targets = Vec::new();
        let window = self.prefetch_window as u64;

        match direction {
            AccessDirection::Forward => {
                for i in 1..=window {
                    targets.push(ChunkId {
                        file_path: current.file_path.clone(),
                        chunk_index: current.chunk_index + i,
                    });
                }
            }
            AccessDirection::Backward => {
                for i in 1..=window {
                    if current.chunk_index >= i {
                        targets.push(ChunkId {
                            file_path: current.file_path.clone(),
                            chunk_index: current.chunk_index - i,
                        });
                    }
                }
            }
            AccessDirection::Random => {}
        }

        targets
    }
}
```

### client_actor.rs - Enhanced Actor with Caching

```rust
pub enum ActorMessage {
    /// Priority fetch with response channel (blocking caller)
    FetchPriority {
        chunk_id: ChunkId,
        responder: oneshot::Sender<Result<Arc<Vec<u8>>>>,
    },
    /// Background prefetch (fire-and-forget)
    FetchBackground {
        chunk_id: ChunkId,
    },
}

pub struct ClientActor {
    rx: mpsc::Receiver<ActorMessage>,
    connection: Connection,
    cache: Arc<RamCache>,
    // Limit concurrent prefetch requests
    prefetch_semaphore: Arc<Semaphore>,
}

impl ClientActor {
    pub async fn run(mut self) {
        while let Some(msg) = self.rx.recv().await {
            match msg {
                ActorMessage::FetchPriority { chunk_id, responder } => {
                    let result = self.fetch_and_cache(chunk_id).await;
                    let _ = responder.send(result);
                }
                ActorMessage::FetchBackground { chunk_id } => {
                    // Skip if already cached
                    if self.cache.contains(&chunk_id) {
                        continue;
                    }

                    // Limit concurrent prefetches
                    let permit = self.prefetch_semaphore.clone().acquire_owned().await;
                    let cache = self.cache.clone();
                    let connection = self.connection.clone();

                    tokio::spawn(async move {
                        let _permit = permit;
                        if let Ok(data) = Self::fetch_chunk(&connection, &chunk_id).await {
                            cache.insert(chunk_id, data);
                        }
                    });
                }
            }
        }
    }

    async fn fetch_and_cache(&self, chunk_id: ChunkId) -> Result<Arc<Vec<u8>>> {
        // Check cache first
        if let Some(data) = self.cache.get(&chunk_id) {
            return Ok(data);
        }

        // Fetch from network
        let data = Self::fetch_chunk(&self.connection, &chunk_id).await?;
        let arc_data = Arc::new(data.clone());

        // Cache for future access
        self.cache.insert(chunk_id, data);

        Ok(arc_data)
    }

    async fn fetch_chunk(connection: &Connection, chunk_id: &ChunkId) -> Result<Vec<u8>> {
        client::fetch_data_segment(
            connection,
            &chunk_id.file_path,
            chunk_id.start_offset(),
            CHUNK_SIZE as u32,
        ).await
    }
}
```

### fs.rs - Read with Chunk Stitching

```rust
impl Filesystem for TeleportFS {
    fn read(&mut self, _req: &Request, ino: u64, fh: u64,
            offset: i64, size: u32, ..., reply: ReplyData) {

        let path = match self.vfs.read().get_path(ino) {
            Some(p) => p.to_string(),
            None => { reply.error(libc::ENOENT); return; }
        };

        let offset = offset as u64;
        let size = size as usize;

        // Calculate chunk range needed
        let start_chunk = ChunkId::from_offset(&path, offset);
        let end_chunk = ChunkId::from_offset(&path, offset + size as u64);

        let mut result = Vec::with_capacity(size);

        // Fetch and stitch chunks
        for chunk_idx in start_chunk.chunk_index..=end_chunk.chunk_index {
            let chunk_id = ChunkId {
                file_path: path.clone(),
                chunk_index: chunk_idx,
            };

            // Record access for governor (prefetch decision)
            let prefetch_targets = self.governor.write().record_access(&chunk_id);

            // Spawn background prefetches
            for target in prefetch_targets {
                let _ = self.actor_tx.try_send(ActorMessage::FetchBackground {
                    chunk_id: target,
                });
            }

            // Fetch current chunk (blocks)
            let (tx, rx) = oneshot::channel();
            self.actor_tx.blocking_send(ActorMessage::FetchPriority {
                chunk_id: chunk_id.clone(),
                responder: tx,
            }).unwrap();

            let chunk_data = match rx.blocking_recv() {
                Ok(Ok(data)) => data,
                _ => { reply.error(libc::EIO); return; }
            };

            // Calculate slice within chunk
            let chunk_start = chunk_id.start_offset();
            let slice_start = if offset > chunk_start {
                (offset - chunk_start) as usize
            } else {
                0
            };
            let slice_end = std::cmp::min(
                CHUNK_SIZE,
                slice_start + (size - result.len())
            );

            result.extend_from_slice(&chunk_data[slice_start..slice_end]);
        }

        reply.data(&result);
    }
}
```

## Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│ FUSE Kernel Request: read(ino, offset, size)                         │
└──────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│ fs.rs: Map offset → ChunkId(s)                                       │
│ ┌─────────────────────────────────────────────────────────────────┐  │
│ │ offset=150000, size=100000                                      │  │
│ │ → Chunk 1 (128KB-256KB) + Chunk 2 (256KB-384KB)                │  │
│ └─────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Governor: Record access, detect pattern                              │
│ ┌─────────────────────────────────────────────────────────────────┐  │
│ │ Sequential streak: 4 → Prefetch chunks 3, 4, 5, 6, 7            │  │
│ └─────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
          ▼                     ▼                     ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ FetchPriority   │   │ FetchBackground │   │ FetchBackground │
│ Chunk 1 (block) │   │ Chunk 3         │   │ Chunk 4         │
└─────────────────┘   └─────────────────┘   └─────────────────┘
          │                     │                     │
          ▼                     ▼                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│ RamCache (LRU)                                                       │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ [Chunk 1] [Chunk 2] [Chunk 0] ... [~4000 chunks max]             │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│                              │                                       │
│                     Cache Hit? ──────► Return immediately            │
│                              │                                       │
│                     Cache Miss ──────► Network fetch                 │
└──────────────────────────────────────────────────────────────────────┘
```

## Configuration Recommendations

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| CHUNK_SIZE | 128KB | Balance between granularity and network efficiency |
| RAM Cache Capacity | 4000 chunks (~500MB) | Reasonable RAM usage |
| Prefetch Window | 5 chunks | Aggressive enough for video, not wasteful |
| Sequential Threshold | 3 accesses | Avoid prefetching on random access |
| Max Concurrent Prefetch | 4 | Don't overwhelm network |
