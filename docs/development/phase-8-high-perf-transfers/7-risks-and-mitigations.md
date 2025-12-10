# Phase 8 — Risks and Mitigations

## Risk Matrix

| Risk | Likelihood | Impact | Severity | Mitigation |
|------|------------|--------|----------|------------|
| io_uring unavailable | Medium | Medium | **Medium** | Fallback to epoll |
| macOS sendfile limitations | Low | Medium | **Low** | Documented limitations |
| Windows zero-copy complexity | Medium | High | **High** | Thorough testing |
| Buffer bloat | Medium | Medium | **Medium** | BBR + rate limiting |
| BLAKE3 CPU overhead | Low | Low | **Low** | SIMD acceleration |
| Memory pressure | Medium | Medium | **Medium** | Pooled buffers |
| QUIC blocked by firewall | Medium | Medium | **Medium** | TCP fallback |
| Latency regression | Low | High | **Medium** | Regression tests |
| Backward compatibility break | Low | High | **Medium** | Protocol versioning |

---

## Detailed Risks and Mitigations

### 1. Platform I/O Availability

#### Risk: io_uring Not Available (Linux)

**Situation:** io_uring requires Linux 5.1+ kernel. Older systems or containerized environments may not have it.

**Likelihood:** Medium (many servers run older kernels)

**Impact:** Falls back to slower epoll-based I/O

**Mitigation:**

```rust
pub fn platform_io() -> Box<dyn AsyncIO> {
    #[cfg(target_os = "linux")]
    {
        // Try io_uring first
        if let Ok(io) = IoUring::try_new() {
            return Box::new(io);
        }
        // Fall back to epoll
        tracing::warn!("io_uring unavailable, using epoll fallback");
        return Box::new(Epoll::new());
    }
    // ... other platforms
}
```

**Acceptance:** Epoll fallback achieves ~80% of io_uring performance, acceptable for older systems.

---

#### Risk: macOS sendfile Limitations

**Situation:** macOS sendfile() has different semantics than Linux, may not support all use cases.

**Likelihood:** Low (well-documented API)

**Impact:** May need to fall back to regular read/write

**Mitigation:**

```rust
#[cfg(target_os = "macos")]
pub async fn sendfile(&self, file: &File, socket: &TcpStream, offset: u64, len: usize) -> io::Result<usize> {
    match nix::sys::sendfile::sendfile(...) {
        Ok(sent) => Ok(sent as usize),
        Err(nix::errno::Errno::ENOTSUP) => {
            // Fall back to regular copy
            self.copy_via_buffer(file, socket, offset, len).await
        }
        Err(e) => Err(e.into()),
    }
}
```

**Acceptance:** macOS users get slightly lower throughput in edge cases, but still significantly faster than Phase 7.

---

#### Risk: Windows Zero-Copy Complexity

**Situation:** Windows TransmitFile has quirks, IOCP completion model is complex.

**Likelihood:** Medium (Windows I/O is notoriously tricky)

**Impact:** Potential bugs, lower performance than expected

**Mitigation:**

1. Comprehensive test suite on Windows CI
2. Use well-tested `windows` crate bindings
3. Dedicated Windows performance testing before release
4. Document known limitations

```rust
#[cfg(target_os = "windows")]
pub async fn transmit_file(&self, file: &File, socket: &TcpSocket, offset: u64, len: usize) -> io::Result<usize> {
    use windows::Win32::Networking::WinSock::TransmitFile;

    // Careful handling of OVERLAPPED structure
    // Proper completion port integration
    // Error handling for all Windows-specific failures
}
```

**Acceptance:** Windows may have slightly lower performance than Linux, but must still beat Phase 7.

---

### 2. Network Issues

#### Risk: Buffer Bloat on Fast Networks

**Situation:** Sending too fast fills router buffers, causing latency spikes and packet loss.

**Likelihood:** Medium (common on 10GbE with consumer routers)

**Impact:** Throughput collapse, high latency

**Mitigation:**

1. Use BBR congestion control (built into QUIC)
2. Implement explicit rate limiting option
3. Monitor RTT and back off when latency increases

```rust
impl StreamPool {
    fn check_buffer_bloat(&mut self, measured_rtt: Duration) {
        let expected_rtt = self.baseline_rtt;
        if measured_rtt > expected_rtt * 2 {
            // Buffer bloat detected, reduce streams
            self.target_streams = (self.target_streams * 3 / 4).max(4);
            tracing::warn!("Buffer bloat detected, reducing to {} streams", self.target_streams);
        }
    }
}
```

---

#### Risk: QUIC Blocked by Firewall

**Situation:** Corporate firewalls or ISPs may block UDP (which QUIC uses).

**Likelihood:** Medium (common in enterprise environments)

**Impact:** Connection fails

**Mitigation:**

1. Automatic TCP fallback
2. TCP uses same zero-copy optimizations
3. Clear error message explaining the fallback

```rust
pub async fn connect(&mut self) -> Result<()> {
    match self.try_quic().await {
        Ok(conn) => return Ok(conn),
        Err(e) if self.is_udp_blocked(&e) => {
            tracing::info!("QUIC blocked, falling back to TCP");
            return self.connect_tcp().await;
        }
        Err(e) => return Err(e),
    }
}
```

---

### 3. Performance Risks

#### Risk: BLAKE3 CPU Overhead

**Situation:** Hashing every chunk adds CPU overhead.

**Likelihood:** Low (BLAKE3 is extremely fast)

**Impact:** Reduced throughput on CPU-constrained systems

**Mitigation:**

1. BLAKE3 uses SIMD (AVX2/NEON) automatically
2. Hash rate is typically >3 GB/s on modern CPUs
3. Skip hashing for very small files (dedup less valuable)
4. Optional: disable content-addressing for LAN-only transfers

```rust
impl ChunkStore {
    fn should_hash(&self, chunk_size: usize) -> bool {
        // Skip hashing for tiny chunks (overhead > benefit)
        chunk_size > 4096
    }
}
```

**Acceptance:** BLAKE3 overhead is <5% of total transfer time, acceptable.

---

#### Risk: Memory Pressure from Large Chunks

**Situation:** 4MB chunks with 64+ parallel streams could use >256MB RAM.

**Likelihood:** Medium (depends on stream count)

**Impact:** OOM on memory-constrained systems, swapping

**Mitigation:**

1. Buffer pool with fixed maximum size
2. Backpressure: pause new requests when pool exhausted
3. Configurable pool size with sensible defaults
4. Spill to disk if RAM pool full

```rust
pub struct BufferPool {
    pool: Vec<Vec<u8>>,
    max_buffers: usize,
    buffer_size: usize,
}

impl BufferPool {
    pub async fn acquire(&mut self) -> Option<Vec<u8>> {
        if let Some(buf) = self.pool.pop() {
            return Some(buf);
        }
        if self.allocated < self.max_buffers {
            self.allocated += 1;
            return Some(vec![0u8; self.buffer_size]);
        }
        // Pool exhausted, apply backpressure
        None
    }
}
```

---

#### Risk: Latency Regression

**Situation:** Optimizing for throughput could hurt random access latency.

**Likelihood:** Low (if careful)

**Impact:** High (video scrubbing, IDE workflows break)

**Mitigation:**

1. Dedicated latency regression tests in CI
2. Random access uses smaller 128KB chunks (unchanged)
3. Prioritize small reads over bulk transfers
4. Alert on any latency increase >10%

```rust
// Dedicated benchmark that fails if latency regresses
#[test]
fn test_random_read_latency_regression() {
    let result = bench_random_read_4kb();
    assert!(result.mean < Duration::from_millis(10),
        "Random read latency regressed: {:?}", result.mean);
}
```

---

### 4. Compatibility Risks

#### Risk: Backward Compatibility Break

**Situation:** New protocol messages could break old clients.

**Likelihood:** Low (if careful)

**Impact:** High (users can't connect mixed versions)

**Mitigation:**

1. Protocol versioning in handshake
2. New messages are additive only
3. Old clients ignore unknown message types
4. Version negotiation falls back to common subset

```rust
pub enum NetMessage {
    // Existing Phase 7 messages (unchanged)
    Handshake { version: u32, ... },
    ReadRequest { ... },
    ReadResponse { ... },

    // Phase 8 additions (new clients only)
    ManifestRequest { ... },
    ManifestResponse { ... },
    ChunkRequest { ... },
    ChunkResponse { ... },
}

impl Connection {
    fn supports_phase8(&self) -> bool {
        self.negotiated_version >= 8
    }
}
```

---

### 5. Operational Risks

#### Risk: Complex Debugging

**Situation:** Zero-copy paths are harder to debug than regular read/write.

**Likelihood:** Medium (during development)

**Impact:** Slower bug resolution

**Mitigation:**

1. Comprehensive tracing with spans
2. Debug mode that uses regular I/O
3. Metrics exported via Prometheus
4. Detailed error messages

```rust
#[cfg(feature = "debug_io")]
pub fn read_at(&self, path: &Path, offset: u64, buf: &mut [u8]) -> io::Result<usize> {
    // Use standard I/O for debugging
    std::fs::File::open(path)?.read_at(buf, offset)
}

#[cfg(not(feature = "debug_io"))]
pub fn read_at(&self, path: &Path, offset: u64, buf: &mut [u8]) -> io::Result<usize> {
    // Zero-copy path
    self.io_uring.read_at(path, offset, buf).await
}
```

---

## Risk Acceptance Criteria

| Risk Level | Action Required |
|------------|-----------------|
| **Critical** | Block release until resolved |
| **High** | Must have mitigation implemented and tested |
| **Medium** | Mitigation documented, fallback exists |
| **Low** | Acknowledged, may defer to future release |

---

## Monitoring

### Metrics to Alert On

| Metric | Warning | Critical |
|--------|---------|----------|
| Throughput vs baseline | <90% | <70% |
| First-byte latency | >100ms | >500ms |
| Random read latency | >20ms | >50ms |
| Memory usage | >200MB | >500MB |
| CPU per 100 MB/s | >1% | >5% |
| Fallback rate (io_uring→epoll) | >10% | >50% |
| QUIC→TCP fallback rate | >20% | >50% |
