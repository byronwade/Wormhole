# Phase 8 — Architecture

## Core Transfer Pipeline

The key insight: **eliminate every unnecessary copy between remote disk and local disk**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ZERO-COPY DATA PATH                                │
└─────────────────────────────────────────────────────────────────────────────┘

Remote Host                                              Local Client
═══════════                                              ════════════

  ┌─────────────┐
  │  Remote     │
  │  NVMe SSD   │
  └──────┬──────┘
         │
         ▼
  ┌─────────────────────────────────────┐
  │  Direct Kernel Read                  │
  │  (io_uring / kqueue / IOCP)          │
  │  • No userspace buffer               │
  │  • Async completion                  │
  └──────┬──────────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────────┐
  │  Zero-Copy Send                      │
  │  (sendfile / splice / TransmitFile)  │
  │  • Data stays in kernel              │
  │  • DMA directly to NIC               │
  └──────┬──────────────────────────────┘
         │
         ▼
  ╔═══════════════════════════════════════════════════════════════════════╗
  ║                    WIRE (QUIC or TCP)                                  ║
  ║  • TLS 1.3 encryption                                                  ║
  ║  • Multiplexed streams (QUIC) or parallel connections (TCP)            ║
  ║  • BBR congestion control                                              ║
  ╚═══════════════════════════════════════════════════════════════════════╝
         │
         ▼
  ┌─────────────────────────────────────┐
  │  Zero-Copy Receive                   │
  │  • MSG_ZEROCOPY (Linux)              │         ┌─────────────┐
  │  • Registered buffers                │         │  Local      │
  └──────┬──────────────────────────────┘         │  NVMe SSD   │
         │                                         └──────▲──────┘
         ▼                                                │
  ┌─────────────────────────────────────┐                │
  │  Direct Kernel Write                 │                │
  │  (io_uring / kqueue / IOCP)          │────────────────┘
  │  • Preallocated file regions         │
  │  • Write-through or fsync batching   │
  └─────────────────────────────────────┘
```

---

## Component Architecture

### 1. Platform I/O Abstraction Layer

```rust
// crates/teleport-core/src/io/mod.rs

pub trait AsyncIO: Send + Sync {
    /// Read file directly into registered buffer (zero-copy)
    async fn read_direct(&self, fd: RawFd, offset: u64, len: usize) -> io::Result<Bytes>;

    /// Write from registered buffer directly to file (zero-copy)
    async fn write_direct(&self, fd: RawFd, offset: u64, data: &[u8]) -> io::Result<usize>;

    /// Send file data directly to socket (sendfile/splice)
    async fn sendfile(&self, src_fd: RawFd, dst: &TcpStream, offset: u64, len: usize) -> io::Result<usize>;
}

// Platform implementations
#[cfg(target_os = "linux")]
mod linux;    // io_uring

#[cfg(target_os = "macos")]
mod macos;    // kqueue + sendfile

#[cfg(target_os = "windows")]
mod windows;  // IOCP + TransmitFile
```

### 2. Content-Addressed Chunk Store

```rust
// crates/teleport-core/src/chunks.rs

/// Chunk identifier with content hash
pub struct ContentChunk {
    /// File path (for ordering)
    pub path: String,
    /// Byte offset in file
    pub offset: u64,
    /// Chunk size (4MB for bulk, 128KB for random access)
    pub size: u32,
    /// BLAKE3 hash of content
    pub hash: [u8; 32],
}

/// Deduplication index
pub struct ChunkIndex {
    /// Hash → local storage location
    by_hash: DashMap<[u8; 32], ChunkLocation>,
    /// Path+offset → hash (for serving)
    by_location: DashMap<(String, u64), [u8; 32]>,
}

impl ChunkIndex {
    /// Check if chunk already exists locally
    pub fn has_chunk(&self, hash: &[u8; 32]) -> bool {
        self.by_hash.contains_key(hash)
    }

    /// Get chunk data without network transfer
    pub async fn get_local(&self, hash: &[u8; 32]) -> Option<Bytes> {
        // Read from local cache
    }
}
```

### 3. Parallel Stream Manager

```rust
// crates/teleport-daemon/src/stream_pool.rs

pub struct StreamPool {
    /// Active streams
    streams: Vec<QuicStream>,
    /// Pending chunk requests
    pending: VecDeque<ChunkRequest>,
    /// Congestion state per stream
    congestion: Vec<CongestionState>,
    /// Target concurrent streams (auto-tuned)
    target_streams: usize,
}

impl StreamPool {
    /// Request multiple chunks in parallel
    pub async fn fetch_chunks(&mut self, chunks: Vec<ContentChunk>) -> Vec<ChunkResult> {
        // 1. Filter out chunks we already have (dedup)
        let needed: Vec<_> = chunks.iter()
            .filter(|c| !self.index.has_chunk(&c.hash))
            .collect();

        // 2. Distribute across streams
        for chunk in needed {
            let stream = self.select_best_stream();
            stream.request_chunk(chunk).await;
        }

        // 3. Collect results as they arrive
        self.collect_results().await
    }

    /// Auto-tune stream count based on bandwidth-delay product
    fn tune_stream_count(&mut self, measured_bandwidth: u64, rtt_ms: u64) {
        let bdp = measured_bandwidth * rtt_ms / 1000;
        let chunk_size = 4 * 1024 * 1024; // 4MB
        self.target_streams = (bdp / chunk_size).clamp(4, 256) as usize;
    }
}
```

### 4. Adaptive Transport Engine

```rust
// crates/teleport-daemon/src/transport.rs

pub enum Transport {
    Quic(QuicConnection),
    Tcp(TcpZeroCopy),
}

pub struct AdaptiveTransport {
    primary: Transport,      // Usually QUIC
    fallback: Option<Transport>,  // TCP if QUIC blocked
}

impl AdaptiveTransport {
    /// Automatically switch based on conditions
    pub async fn send(&mut self, data: &[u8]) -> io::Result<()> {
        match self.try_quic(data).await {
            Ok(()) => Ok(()),
            Err(e) if self.is_quic_blocked(&e) => {
                // Fall back to TCP
                self.switch_to_tcp().await?;
                self.primary.send(data).await
            }
            Err(e) => Err(e),
        }
    }

    fn is_quic_blocked(&self, e: &io::Error) -> bool {
        // Detect UDP blocking (corporate firewalls, etc.)
        matches!(e.kind(), io::ErrorKind::ConnectionRefused | io::ErrorKind::TimedOut)
    }
}
```

### 5. Smart Compression Layer

```rust
// crates/teleport-core/src/compression.rs

pub struct SmartCompressor {
    /// zstd compressor with dictionary
    zstd: zstd::Encoder<'static>,
}

impl SmartCompressor {
    /// Decide whether to compress based on file type and content
    pub fn should_compress(&self, path: &str, sample: &[u8]) -> bool {
        // Skip known compressed formats
        let ext = Path::new(path).extension().and_then(|e| e.to_str());
        if matches!(ext, Some("mp4" | "mkv" | "zip" | "gz" | "xz" | "webp" | "jpg" | "png")) {
            return false;
        }

        // Skip if sample has high entropy (already compressed)
        if self.entropy(sample) > 7.5 {
            return false;
        }

        // Compress text, JSON, source code, etc.
        true
    }

    /// Calculate Shannon entropy (bits per byte)
    fn entropy(&self, data: &[u8]) -> f64 {
        let mut counts = [0u64; 256];
        for &byte in data {
            counts[byte as usize] += 1;
        }
        let len = data.len() as f64;
        counts.iter()
            .filter(|&&c| c > 0)
            .map(|&c| {
                let p = c as f64 / len;
                -p * p.log2()
            })
            .sum()
    }
}
```

---

## Rust Crate Stack

### Platform I/O

| Platform | Crate | Purpose |
|----------|-------|---------|
| Linux | `io-uring` or `tokio-uring` | Async I/O with zero-copy |
| macOS | `mio` + libc `sendfile` | kqueue + zero-copy send |
| Windows | `windows` crate | IOCP + TransmitFile |

### Networking

| Crate | Purpose |
|-------|---------|
| `quinn` (current) | QUIC with rustls |
| `quiche` (alternative) | Cloudflare QUIC, more tuning options |
| `s2n-quic` (alternative) | AWS QUIC, excellent performance |

### Hashing & Compression

| Crate | Purpose |
|-------|---------|
| `blake3` | SIMD-accelerated content hashing |
| `zstd` | Fast compression with dictionaries |

### Async Runtime

| Crate | Purpose |
|-------|---------|
| `tokio` | Async runtime (with `io_uring` feature on Linux) |
| `bytes` | Zero-copy buffer management |

---

## Data Flow Diagrams

### Bulk Transfer (Large File)

```
Client                                     Host
   │                                         │
   │  1. RequestFileManifest(path)           │
   │ ───────────────────────────────────────►│
   │                                         │
   │  2. FileManifest(chunks: [hash, ...])   │
   │ ◄───────────────────────────────────────│
   │                                         │
   │  3. Filter: remove chunks we have       │
   │     (dedup via ChunkIndex)              │
   │                                         │
   │  4. RequestChunks([hash1, hash2, ...])  │
   │ ═══════════════════════════════════════►│  (parallel streams)
   │                                         │
   │  5. ChunkData(hash, data)               │
   │ ◄═══════════════════════════════════════│  (parallel responses)
   │                                         │
   │  6. Write directly to disk              │
   │     (zero-copy via io_uring)            │
   │                                         │
```

### Resume Transfer

```
Client                                     Host
   │                                         │
   │  1. RequestFileManifest(path)           │
   │ ───────────────────────────────────────►│
   │                                         │
   │  2. FileManifest(chunks: [hash, ...])   │
   │ ◄───────────────────────────────────────│
   │                                         │
   │  3. 95% of chunks already in index!     │
   │     Only need 5% from network           │
   │                                         │
   │  4. RequestChunks([only_missing])       │
   │ ───────────────────────────────────────►│
   │                                         │
   │  ⚡ Transfer completes 20x faster        │
```

---

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `BULK_CHUNK_SIZE` | 4 MB | Chunk size for sustained transfers |
| `RANDOM_CHUNK_SIZE` | 128 KB | Chunk size for random access |
| `MAX_PARALLEL_STREAMS` | 64 | Maximum concurrent QUIC streams |
| `MIN_PARALLEL_STREAMS` | 4 | Minimum streams (low bandwidth) |
| `COMPRESSION_THRESHOLD` | 1 KB | Skip compression for tiny files |
| `DEDUP_INDEX_SIZE` | 1M entries | Max chunks in dedup index |
