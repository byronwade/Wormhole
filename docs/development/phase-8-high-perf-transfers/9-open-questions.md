# Phase 8 — Open Questions

This document captures design decisions made for Phase 8, with rationale and alternatives considered.

---

## Q1: Chunk Size for Bulk Transfers

**Question:** What chunk size should we use for bulk transfers?

**Decision:** 4 MB for sustained transfers, 128 KB for random access.

**Rationale:**
- 4 MB reduces syscall overhead by 32x compared to 128 KB
- Matches typical SSD write buffer sizes
- Large enough for efficient BLAKE3 hashing (SIMD benefits)
- Not so large that a dropped chunk wastes significant bandwidth

**Alternatives Considered:**

| Size | Pros | Cons |
|------|------|------|
| 128 KB | Low latency, fine-grained dedup | High syscall overhead |
| 1 MB | Good balance | Not optimal for either use case |
| **4 MB** | Excellent throughput, efficient hashing | Higher latency for first byte |
| 16 MB | Maximum efficiency | Too much wasted on partial transfers |

**Implementation:**

```rust
const BULK_CHUNK_SIZE: usize = 4 * 1024 * 1024;     // 4 MB
const RANDOM_CHUNK_SIZE: usize = 128 * 1024;        // 128 KB

fn chunk_size_for_access_pattern(pattern: AccessPattern) -> usize {
    match pattern {
        AccessPattern::Sequential => BULK_CHUNK_SIZE,
        AccessPattern::Random => RANDOM_CHUNK_SIZE,
    }
}
```

**Future:** Consider adaptive chunk sizing based on measured throughput.

---

## Q2: QUIC vs TCP for LAN

**Question:** Should we use QUIC or TCP on LAN where latency is minimal?

**Decision:** Start with QUIC, fall back to TCP if QUIC is blocked or underperforming.

**Rationale:**
- QUIC provides multiplexing without head-of-line blocking
- Single codebase for LAN and WAN
- QUIC handles congestion control well
- TCP fallback catches cases where UDP is blocked

**Alternatives Considered:**

| Approach | Pros | Cons |
|----------|------|------|
| QUIC only | Simple, modern | Blocked on some networks |
| TCP only | Universal | No multiplexing, HOL blocking |
| **QUIC + TCP fallback** | Best coverage | More code complexity |
| User choice | Flexibility | Confusing for users |

**Implementation:**

```rust
pub struct AdaptiveTransport {
    quic_conn: Option<QuicConnection>,
    tcp_conn: Option<TcpConnection>,
}

impl AdaptiveTransport {
    pub async fn connect(&mut self, addr: SocketAddr) -> Result<()> {
        // Try QUIC first
        match QuicConnection::connect(addr).await {
            Ok(conn) => {
                self.quic_conn = Some(conn);
                return Ok(());
            }
            Err(e) if is_udp_blocked(&e) => {
                tracing::info!("QUIC blocked, falling back to TCP");
            }
            Err(e) => return Err(e),
        }

        // Fall back to TCP
        self.tcp_conn = Some(TcpConnection::connect(addr).await?);
        Ok(())
    }
}
```

**Future:** Benchmark QUIC vs TCP on 10GbE LAN to verify QUIC doesn't underperform.

---

## Q3: Compression Threshold

**Question:** When should we compress data?

**Decision:** Skip files <1 KB, skip known compressed formats, check entropy for unknown formats.

**Rationale:**
- Files <1 KB have high overhead relative to savings
- Known formats (MP4, ZIP, etc.) are already compressed
- Entropy check catches unknown compressed data
- zstd level 3 is fast enough to not bottleneck transfers

**Alternatives Considered:**

| Approach | Pros | Cons |
|----------|------|------|
| Always compress | Simple | Wastes CPU on incompressible data |
| Never compress | No CPU overhead | Misses easy wins on text |
| Extension-based only | Fast check | Misses unknown formats |
| **Extension + entropy** | Best accuracy | Slight overhead for entropy calc |

**Implementation:**

```rust
const COMPRESSION_THRESHOLD: usize = 1024;  // 1 KB minimum
const ENTROPY_THRESHOLD: f64 = 7.5;         // bits per byte

fn should_compress(path: &str, data: &[u8]) -> bool {
    // Skip tiny files
    if data.len() < COMPRESSION_THRESHOLD {
        return false;
    }

    // Skip known compressed extensions
    if is_compressed_extension(path) {
        return false;
    }

    // Check entropy on first 4KB
    let sample = &data[..data.len().min(4096)];
    shannon_entropy(sample) < ENTROPY_THRESHOLD
}
```

**Future:** Build training data for common file types to improve heuristics.

---

## Q4: Maximum Concurrent Streams

**Question:** How many parallel streams should we use?

**Decision:** 64 default, auto-scale between 4-256 based on bandwidth-delay product.

**Rationale:**
- Too few streams underutilizes high-bandwidth links
- Too many streams causes contention and CPU overhead
- BDP-based scaling adapts to network conditions
- 64 is a good default for 1-10 Gbps networks

**Alternatives Considered:**

| Approach | Pros | Cons |
|----------|------|------|
| Fixed 16 | Simple | Underutilizes 10GbE |
| Fixed 256 | Maximal parallelism | Wasteful on slow links |
| **BDP-based 4-256** | Adapts to conditions | More complex |
| User configurable | Flexibility | Users don't know optimal |

**Implementation:**

```rust
impl StreamPool {
    const MIN_STREAMS: usize = 4;
    const MAX_STREAMS: usize = 256;
    const DEFAULT_STREAMS: usize = 64;

    pub fn tune(&mut self, bandwidth_mbps: f64, rtt_ms: f64) {
        // BDP = bandwidth × RTT
        let bdp_bytes = (bandwidth_mbps * 1_000_000.0 / 8.0) * (rtt_ms / 1000.0);

        // Optimal streams = BDP / chunk_size
        let chunk_size = 4 * 1024 * 1024;  // 4 MB
        let optimal = (bdp_bytes / chunk_size as f64).ceil() as usize;

        self.target_streams = optimal.clamp(Self::MIN_STREAMS, Self::MAX_STREAMS);
    }
}
```

**Future:** Add hysteresis to prevent thrashing on variable networks.

---

## Q5: Dedup Index Persistence

**Question:** Should the dedup index persist across sessions?

**Decision:** Yes, persist to disk with configurable size limit.

**Rationale:**
- Enables instant resume after restart
- Massive speedup for repeated transfers (e.g., daily syncs)
- Disk space is cheap, user time is expensive

**Alternatives Considered:**

| Approach | Pros | Cons |
|----------|------|------|
| Memory only | Simple | Lost on restart |
| **Persistent on disk** | Survives restarts | Disk space, startup time |
| Optional persistence | User choice | Confusing default |

**Implementation:**

```rust
pub struct ChunkIndex {
    // In-memory index for fast lookups
    memory: DashMap<[u8; 32], PathBuf>,

    // Persistent storage
    db_path: PathBuf,
    max_entries: usize,
}

impl ChunkIndex {
    pub async fn load(&mut self) -> Result<()> {
        // Load from disk on startup
        let db = sled::open(&self.db_path)?;
        for entry in db.iter() {
            let (hash, path) = entry?;
            self.memory.insert(hash.try_into()?, path.into());
        }
        Ok(())
    }

    pub async fn persist(&self) -> Result<()> {
        // Write to disk periodically
        let db = sled::open(&self.db_path)?;
        for entry in self.memory.iter() {
            db.insert(entry.key(), entry.value().as_bytes())?;
        }
        db.flush_async().await?;
        Ok(())
    }
}
```

**Future:** Consider LRU eviction for index to bound disk usage.

---

## Q6: Protocol Versioning

**Question:** How do we handle protocol changes?

**Decision:** Version field in handshake, additive-only changes, graceful degradation.

**Rationale:**
- Allows gradual rollout of new features
- Old clients can still connect to new servers
- Clear upgrade path for users

**Implementation:**

```rust
pub struct Handshake {
    pub version: u32,  // Protocol version
    pub features: Vec<Feature>,  // Supported features
}

pub enum Feature {
    ChunkDedup,       // Phase 8
    Compression,      // Phase 8
    BulkTransfer,     // Phase 8
}

impl Connection {
    pub fn negotiate_features(&self, peer: &Handshake) -> Vec<Feature> {
        self.supported_features.iter()
            .filter(|f| peer.features.contains(f))
            .cloned()
            .collect()
    }
}
```

---

## Q7: Content Hash Algorithm

**Question:** Which hash algorithm for content addressing?

**Decision:** BLAKE3.

**Rationale:**
- Fastest cryptographic hash (>3 GB/s on modern CPUs)
- SIMD-accelerated (AVX2, NEON)
- Secure against collision attacks
- 256-bit output fits in 32 bytes

**Alternatives Considered:**

| Algorithm | Speed | Security | Size |
|-----------|-------|----------|------|
| MD5 | Fast | Broken | 16 bytes |
| SHA-256 | Medium | Good | 32 bytes |
| SHA-3 | Slow | Excellent | 32 bytes |
| **BLAKE3** | Fastest | Good | 32 bytes |
| xxHash | Fastest | Non-crypto | 8 bytes |

**Implementation:**

```rust
use blake3::Hasher;

pub fn hash_chunk(data: &[u8]) -> [u8; 32] {
    *blake3::hash(data).as_bytes()
}

// Verify: BLAKE3 achieves >3 GB/s on modern CPUs
#[bench]
fn bench_blake3_4mb(b: &mut Bencher) {
    let data = vec![0u8; 4 * 1024 * 1024];
    b.iter(|| blake3::hash(&data));
    b.bytes = 4 * 1024 * 1024;
}
```

---

## Q8: Zero-Copy on Receive Path

**Question:** Can we achieve zero-copy on the receive side?

**Decision:** Partial — use registered buffers and direct-to-disk writes where possible.

**Rationale:**
- True zero-copy receive is harder than send (need kernel support)
- Linux MSG_ZEROCOPY helps but has limitations
- io_uring registered buffers reduce copies
- Direct-to-disk writes avoid RAM staging

**Implementation:**

```rust
#[cfg(target_os = "linux")]
impl IoUring {
    pub async fn receive_to_file(&self, socket: &UdpSocket, file: &File, offset: u64) -> io::Result<usize> {
        // Use io_uring with registered buffer
        let sqe = opcode::RecvMsg::new(Fd(socket.as_raw_fd()), ...)
            .buf_group(self.buffer_group_id)
            .build();

        // Direct write to file without intermediate copy
        let write_sqe = opcode::Write::new(Fd(file.as_raw_fd()), ...)
            .offset(offset)
            .build();

        // Submit both operations
        self.submit_linked(sqe, write_sqe).await
    }
}
```

**Future:** Investigate kernel bypass (DPDK, AF_XDP) for even lower overhead.

---

## Open for Discussion

These questions don't have firm answers yet:

1. **Multi-path support:** Should we aggregate multiple network interfaces?
2. **Partial file dedup:** Can we dedup at sub-chunk granularity (rsync-like)?
3. **Encryption at rest:** Should cached chunks be encrypted?
4. **Telemetry:** What performance metrics should we collect (opt-in)?
