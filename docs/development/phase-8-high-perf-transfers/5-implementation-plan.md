# Phase 8 — Implementation Plan

## Overview

This plan builds the high-performance transfer engine in 6 steps, each building on the previous. The order is designed to enable incremental testing — each step produces measurable improvements.

---

## Step 1: Platform I/O Abstraction

**Goal:** Create a unified async I/O trait with platform-specific implementations.

### Files to Create

```
crates/teleport-core/src/io/
├── mod.rs          # AsyncIO trait, platform detection
├── linux.rs        # io_uring implementation
├── macos.rs        # kqueue + sendfile
├── windows.rs      # IOCP + TransmitFile
└── fallback.rs     # Standard tokio (for old Linux)
```

### Key Code

```rust
// mod.rs
pub trait AsyncIO: Send + Sync + 'static {
    /// Read directly into provided buffer (zero-copy where possible)
    fn read_at(&self, path: &Path, offset: u64, buf: &mut [u8]) -> impl Future<Output = io::Result<usize>>;

    /// Write from buffer directly to file
    fn write_at(&self, path: &Path, offset: u64, buf: &[u8]) -> impl Future<Output = io::Result<usize>>;

    /// Send file data to socket (sendfile/splice/TransmitFile)
    fn sendfile(&self, file: &File, socket: &TcpStream, offset: u64, len: usize) -> impl Future<Output = io::Result<usize>>;
}

/// Get the best I/O implementation for this platform
pub fn platform_io() -> Box<dyn AsyncIO> {
    #[cfg(all(target_os = "linux", feature = "io_uring"))]
    return Box::new(linux::IoUring::new());

    #[cfg(target_os = "linux")]
    return Box::new(linux::Epoll::new());

    #[cfg(target_os = "macos")]
    return Box::new(macos::Kqueue::new());

    #[cfg(target_os = "windows")]
    return Box::new(windows::Iocp::new());
}
```

### Tests

- [ ] Unit test: Read 1GB file via each implementation
- [ ] Unit test: Verify zero-copy via `strace`/`dtrace`
- [ ] Benchmark: Compare throughput vs standard `tokio::fs`

### Deliverable

`cargo test -p teleport-core io_` passes on all platforms.

---

## Step 2: Content-Addressed Chunk Store

**Goal:** Hash chunks with BLAKE3, maintain dedup index.

### Files to Create/Modify

```
crates/teleport-core/src/
├── chunks.rs       # ContentChunk, ChunkIndex (new)
└── protocol.rs     # Add ManifestRequest/Response messages

crates/teleport-daemon/src/
└── chunk_store.rs  # On-disk chunk storage with dedup
```

### Key Code

```rust
// chunks.rs
use blake3::Hasher;

pub struct ContentChunk {
    pub path: String,
    pub offset: u64,
    pub size: u32,
    pub hash: [u8; 32],
}

impl ContentChunk {
    /// Compute hash of chunk data
    pub fn hash_data(data: &[u8]) -> [u8; 32] {
        *blake3::hash(data).as_bytes()
    }
}

pub struct ChunkIndex {
    by_hash: DashMap<[u8; 32], PathBuf>,  // hash → local file
}

impl ChunkIndex {
    /// Check if we have this chunk locally
    pub fn has(&self, hash: &[u8; 32]) -> bool {
        self.by_hash.contains_key(hash)
    }

    /// Get local path for chunk (for zero-copy read)
    pub fn get_path(&self, hash: &[u8; 32]) -> Option<PathBuf> {
        self.by_hash.get(hash).map(|r| r.clone())
    }

    /// Register a chunk we've received
    pub fn insert(&self, hash: [u8; 32], path: PathBuf) {
        self.by_hash.insert(hash, path);
    }
}
```

### Protocol Extensions

```rust
// protocol.rs additions
pub enum NetMessage {
    // ... existing ...

    /// Request chunk manifest for a file
    ManifestRequest { path: String },

    /// Response with all chunk hashes
    ManifestResponse {
        path: String,
        total_size: u64,
        chunks: Vec<(u64, u32, [u8; 32])>,  // (offset, size, hash)
    },

    /// Request specific chunks by hash
    ChunkRequest { hashes: Vec<[u8; 32]> },

    /// Chunk data with hash for verification
    ChunkResponse {
        hash: [u8; 32],
        data: Vec<u8>,
    },
}
```

### Tests

- [ ] Unit test: BLAKE3 hashing performance (should be >1 GB/s)
- [ ] Unit test: Dedup index operations
- [ ] Integration test: Transfer same file twice, second transfer skips network

### Deliverable

`cargo test -p teleport-core chunks` passes, dedup demo works.

---

## Step 3: Parallel Stream Manager

**Goal:** Send/receive multiple chunks concurrently across QUIC streams.

### Files to Create/Modify

```
crates/teleport-daemon/src/
├── stream_pool.rs    # StreamPool, auto-tuning (new)
└── client_actor.rs   # Update to use StreamPool
```

### Key Code

```rust
// stream_pool.rs
pub struct StreamPool {
    connection: quinn::Connection,
    streams: Vec<SendStream>,
    pending: VecDeque<PendingRequest>,
    config: StreamConfig,
}

pub struct StreamConfig {
    pub min_streams: usize,      // 4
    pub max_streams: usize,      // 256
    pub initial_streams: usize,  // 16
}

impl StreamPool {
    /// Fetch multiple chunks in parallel
    pub async fn fetch_chunks(
        &mut self,
        chunks: Vec<[u8; 32]>,
        index: &ChunkIndex,
    ) -> Vec<Result<ChunkResponse>> {
        // 1. Filter out chunks we already have
        let needed: Vec<_> = chunks.into_iter()
            .filter(|h| !index.has(h))
            .collect();

        if needed.is_empty() {
            return vec![];  // All chunks already local!
        }

        // 2. Send requests across available streams
        let (tx, rx) = mpsc::channel(needed.len());
        for hash in needed {
            let stream = self.get_available_stream().await?;
            let tx = tx.clone();
            tokio::spawn(async move {
                let result = stream.request_chunk(hash).await;
                tx.send(result).await.ok();
            });
        }
        drop(tx);

        // 3. Collect all results
        rx.collect().await
    }

    /// Auto-tune stream count based on measured BDP
    pub fn tune(&mut self, bandwidth_mbps: f64, rtt_ms: f64) {
        let bdp_bytes = (bandwidth_mbps * 1_000_000.0 / 8.0) * (rtt_ms / 1000.0);
        let chunk_size = 4 * 1024 * 1024;  // 4MB
        let optimal = (bdp_bytes / chunk_size as f64).ceil() as usize;
        self.config.target_streams = optimal.clamp(
            self.config.min_streams,
            self.config.max_streams,
        );
    }
}
```

### Tests

- [ ] Unit test: Stream pool correctly distributes requests
- [ ] Unit test: Auto-tuning adjusts stream count
- [ ] Benchmark: Compare 1 stream vs 64 streams on 10GbE

### Deliverable

`cargo bench parallel_streams` shows linear scaling with stream count.

---

## Step 4: Transport Layer Upgrade

**Goal:** Add TCP zero-copy fallback, QUIC tuning for high bandwidth.

### Files to Create/Modify

```
crates/teleport-daemon/src/
├── transport/
│   ├── mod.rs      # AdaptiveTransport trait
│   ├── quic.rs     # QUIC with BBR tuning
│   └── tcp.rs      # TCP with sendfile
└── host.rs         # Update to use AdaptiveTransport
```

### Key Code

```rust
// transport/tcp.rs
pub struct TcpZeroCopy {
    stream: TcpStream,
}

impl TcpZeroCopy {
    /// Send file data using sendfile (zero-copy)
    #[cfg(unix)]
    pub async fn sendfile(&self, file: &File, offset: u64, len: usize) -> io::Result<usize> {
        use std::os::unix::io::AsRawFd;

        // Use platform sendfile
        #[cfg(target_os = "linux")]
        {
            nix::sys::sendfile::sendfile(
                self.stream.as_raw_fd(),
                file.as_raw_fd(),
                Some(&mut (offset as i64)),
                len,
            ).map(|n| n as usize)
        }

        #[cfg(target_os = "macos")]
        {
            // macOS sendfile has different signature
            let mut sent = 0i64;
            nix::sys::sendfile::sendfile(
                file.as_raw_fd(),
                self.stream.as_raw_fd(),
                offset as i64,
                Some(len as i64),
                None,
                Some(&mut sent),
            )?;
            Ok(sent as usize)
        }
    }
}
```

### QUIC Tuning

```rust
// transport/quic.rs
pub fn high_bandwidth_config() -> quinn::TransportConfig {
    let mut config = quinn::TransportConfig::default();

    // Increase stream limits for parallel transfers
    config.max_concurrent_bidi_streams(256u32.into());
    config.max_concurrent_uni_streams(256u32.into());

    // Larger buffers for high-bandwidth links
    config.receive_window(16 * 1024 * 1024);  // 16 MB
    config.send_window(16 * 1024 * 1024);

    // Stream-level flow control
    config.stream_receive_window(4 * 1024 * 1024);  // 4 MB per stream

    config
}
```

### Tests

- [ ] Unit test: TCP sendfile works on each platform
- [ ] Integration test: Automatic fallback when QUIC blocked
- [ ] Benchmark: QUIC vs TCP throughput comparison

### Deliverable

`cargo test transport` passes, TCP fallback demo works.

---

## Step 5: Smart Compression

**Goal:** Compress only compressible files, detect via extension and entropy.

### Files to Create

```
crates/teleport-core/src/
└── compression.rs  # SmartCompressor
```

### Key Code

```rust
// compression.rs
use zstd::stream::{Encoder, Decoder};

pub struct SmartCompressor {
    level: i32,  // zstd level (3 is good balance)
}

/// Extensions that are already compressed
const SKIP_EXTENSIONS: &[&str] = &[
    "mp4", "mkv", "avi", "mov", "webm",  // Video
    "mp3", "aac", "flac", "ogg",          // Audio
    "jpg", "jpeg", "png", "webp", "gif",  // Images
    "zip", "gz", "xz", "zst", "bz2",      // Archives
    "7z", "rar",                          // Archives
];

impl SmartCompressor {
    /// Decide whether to compress
    pub fn should_compress(&self, path: &str, first_4kb: &[u8]) -> bool {
        // 1. Check extension
        if let Some(ext) = Path::new(path).extension().and_then(|e| e.to_str()) {
            if SKIP_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
                return false;
            }
        }

        // 2. Check entropy (skip if >7.5 bits/byte)
        let entropy = self.shannon_entropy(first_4kb);
        if entropy > 7.5 {
            return false;
        }

        true
    }

    fn shannon_entropy(&self, data: &[u8]) -> f64 {
        let mut counts = [0u64; 256];
        for &b in data {
            counts[b as usize] += 1;
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

    /// Compress data (returns None if compression doesn't help)
    pub fn compress(&self, data: &[u8]) -> Option<Vec<u8>> {
        let mut output = Vec::new();
        let mut encoder = Encoder::new(&mut output, self.level).ok()?;
        encoder.write_all(data).ok()?;
        encoder.finish().ok()?;

        // Only use compressed if it's actually smaller
        if output.len() < data.len() * 95 / 100 {  // At least 5% savings
            Some(output)
        } else {
            None
        }
    }
}
```

### Tests

- [ ] Unit test: Correctly identifies compressible files
- [ ] Unit test: Skips already-compressed formats
- [ ] Benchmark: Compression ratio on typical file types

### Deliverable

`cargo test compression` passes, shows >2x ratio on text files.

---

## Step 6: Benchmark Suite

**Goal:** Automated performance tests with CI integration.

### Files to Create

```
benches/
├── phase8_throughput.rs    # End-to-end transfer benchmarks
├── zero_copy.rs            # I/O layer benchmarks
├── parallel_streams.rs     # Stream pool benchmarks
├── dedup.rs                # Deduplication benchmarks
└── compression.rs          # Compression benchmarks
```

### Key Benchmarks

```rust
// benches/phase8_throughput.rs
use criterion::{criterion_group, criterion_main, Criterion, BenchmarkId};

fn bench_bulk_transfer(c: &mut Criterion) {
    let mut group = c.benchmark_group("bulk_transfer");

    for size in [100_000_000, 1_000_000_000, 10_000_000_000u64] {
        group.bench_with_input(
            BenchmarkId::new("lan", format_bytes(size)),
            &size,
            |b, &size| {
                b.iter(|| {
                    transfer_file_lan(size)
                });
            },
        );
    }

    group.finish();
}

fn bench_dedup_efficiency(c: &mut Criterion) {
    c.bench_function("dedup_1gb_identical", |b| {
        // First transfer populates index
        transfer_file(ONE_GB);

        b.iter(|| {
            // Second transfer should be instant
            transfer_file(ONE_GB)
        });
    });
}

criterion_group!(benches, bench_bulk_transfer, bench_dedup_efficiency);
criterion_main!(benches);
```

### CI Integration

```yaml
# .github/workflows/benchmarks.yml
name: Performance Benchmarks

on:
  push:
    branches: [main]
  pull_request:

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run benchmarks
        run: cargo bench --bench phase8_throughput -- --save-baseline pr
      - name: Compare to main
        run: cargo bench --bench phase8_throughput -- --baseline main
```

### Deliverable

`cargo bench` runs full suite, CI reports regressions.

---

## Timeline-Free Checklist

| Step | Status | Blocked By |
|------|--------|------------|
| 1. Platform I/O Abstraction | Not started | - |
| 2. Content-Addressed Chunks | Not started | Step 1 |
| 3. Parallel Stream Manager | Not started | Step 2 |
| 4. Transport Layer Upgrade | Not started | Step 1 |
| 5. Smart Compression | Not started | Step 2 |
| 6. Benchmark Suite | Not started | Steps 1-5 |
