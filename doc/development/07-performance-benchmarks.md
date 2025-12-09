# Performance Benchmarks & Targets

This document defines performance targets, benchmarking methodology, and baseline metrics for Wormhole.

---

## Table of Contents

1. [Performance Targets](#1-performance-targets)
2. [Benchmarking Methodology](#2-benchmarking-methodology)
3. [Benchmark Suite](#3-benchmark-suite)
4. [Baseline Metrics](#4-baseline-metrics)
5. [Profiling Guide](#5-profiling-guide)
6. [Optimization Checklist](#6-optimization-checklist)
7. [Comparison with Alternatives](#7-comparison-with-alternatives)

---

## 1. Performance Targets

### Primary Metrics

| Metric | Target | Critical | Measurement |
|--------|--------|----------|-------------|
| **First Byte Latency** | <100ms | <500ms | Time from read() to first data |
| **Throughput (LAN)** | >100 MB/s | >50 MB/s | Sustained sequential read |
| **Throughput (WAN)** | >10 MB/s | >1 MB/s | Over internet connection |
| **Metadata Latency** | <50ms | <200ms | ls, stat operations |
| **Memory (Idle)** | <50 MB | <100 MB | Daemon memory usage |
| **Memory (Active)** | <200 MB | <500 MB | During file transfer |
| **CPU (Idle)** | <1% | <5% | No active operations |
| **CPU (Transfer)** | <25% | <50% | During 100MB/s transfer |

### Scalability Targets

| Metric | Target | Notes |
|--------|--------|-------|
| **Max File Size** | 1 TB+ | Tested with 100GB |
| **Max Files** | 1M+ | In shared directory |
| **Max Peers** | 100 | Concurrent connections |
| **Max Shares** | 10 | Simultaneous hosted folders |

### Latency Breakdown Targets

```
Read Operation (cache miss):
├── FUSE overhead:        <5ms
├── Actor message:        <1ms
├── Network request:      <20ms (LAN) / <100ms (WAN)
├── Host disk read:       <10ms (SSD)
├── Network response:     <20ms (LAN) / <100ms (WAN)
├── Cache write:          <5ms
└── Total:                <61ms (LAN) / <221ms (WAN)

Read Operation (L1 cache hit):
├── FUSE overhead:        <5ms
├── Actor message:        <1ms
├── Cache lookup:         <1ms
└── Total:                <7ms
```

---

## 2. Benchmarking Methodology

### Test Environment

**Reference Hardware:**
```
CPU: Apple M1 / AMD Ryzen 5 / Intel i5 (10th gen+)
RAM: 16 GB
Storage: NVMe SSD (>500 MB/s read)
Network: 1 Gbps Ethernet (LAN tests)
         100 Mbps (WAN simulation)
```

**Reference Software:**
```
OS: Ubuntu 22.04 / macOS 13+ / Windows 11
Rust: 1.75+
FUSE: libfuse 3.x / macFUSE 4.x
```

### Test Conditions

1. **Warm-up:** Run operation 3 times before measuring
2. **Iterations:** Minimum 10 iterations per test
3. **Statistics:** Report p50, p95, p99, max
4. **Isolation:** No other significant processes running
5. **Cache State:** Specify (cold, warm, hot)

### Network Conditions

| Condition | Latency | Bandwidth | Packet Loss |
|-----------|---------|-----------|-------------|
| **LAN** | 1ms | 1 Gbps | 0% |
| **WAN-Good** | 50ms | 100 Mbps | 0% |
| **WAN-Poor** | 150ms | 10 Mbps | 1% |
| **WAN-Bad** | 300ms | 1 Mbps | 5% |

Simulate with:
```bash
# Linux - simulate WAN conditions
sudo tc qdisc add dev eth0 root netem delay 50ms rate 100mbit
```

---

## 3. Benchmark Suite

### Running Benchmarks

```bash
# Run all benchmarks
cargo bench

# Run specific benchmark
cargo bench --bench throughput

# With flamegraph
cargo bench --bench throughput -- --profile-time 10
```

### Benchmark Categories

#### 3.1 Throughput Benchmarks

```rust
// benches/throughput.rs

/// Sequential read throughput
/// Measures: MB/s for reading large files sequentially
#[bench]
fn bench_sequential_read_1gb(b: &mut Bencher) {
    let file = setup_1gb_file();
    b.iter(|| {
        read_file_sequential(&file)
    });
}

/// Random read throughput
/// Measures: IOPS for random 4KB reads
#[bench]
fn bench_random_read_4kb(b: &mut Bencher) {
    let file = setup_1gb_file();
    b.iter(|| {
        read_random_4kb(&file, 1000)  // 1000 random reads
    });
}

/// Write throughput (Phase 7)
#[bench]
fn bench_sequential_write_1gb(b: &mut Bencher) {
    b.iter(|| {
        write_file_sequential(1024 * 1024 * 1024)
    });
}
```

#### 3.2 Latency Benchmarks

```rust
// benches/latency.rs

/// First byte latency (cold cache)
#[bench]
fn bench_first_byte_cold(b: &mut Bencher) {
    b.iter(|| {
        clear_cache();
        let start = Instant::now();
        read_first_byte(&file);
        start.elapsed()
    });
}

/// First byte latency (warm cache)
#[bench]
fn bench_first_byte_warm(b: &mut Bencher) {
    warm_cache(&file);
    b.iter(|| {
        let start = Instant::now();
        read_first_byte(&file);
        start.elapsed()
    });
}

/// Metadata latency (stat)
#[bench]
fn bench_stat_latency(b: &mut Bencher) {
    b.iter(|| {
        stat_file(&file)
    });
}

/// Directory listing latency
#[bench]
fn bench_readdir_1000_files(b: &mut Bencher) {
    let dir = setup_dir_with_1000_files();
    b.iter(|| {
        list_directory(&dir)
    });
}
```

#### 3.3 Concurrency Benchmarks

```rust
// benches/concurrency.rs

/// Concurrent reads from multiple files
#[bench]
fn bench_concurrent_reads_10(b: &mut Bencher) {
    let files = setup_10_files();
    b.iter(|| {
        let handles: Vec<_> = files.iter()
            .map(|f| thread::spawn(|| read_file(f)))
            .collect();
        for h in handles { h.join().unwrap(); }
    });
}

/// Concurrent connections
#[bench]
fn bench_concurrent_clients_50(b: &mut Bencher) {
    let host = setup_host();
    b.iter(|| {
        let clients: Vec<_> = (0..50)
            .map(|_| spawn_client(&host))
            .collect();
        for c in clients { c.disconnect(); }
    });
}
```

#### 3.4 Cache Benchmarks

```rust
// benches/cache.rs

/// L1 cache hit rate
#[bench]
fn bench_l1_hit_rate(b: &mut Bencher) {
    let cache = setup_cache_256mb();
    let data = generate_200mb_workload();

    b.iter(|| {
        for chunk in &data {
            cache.get(chunk.id);
        }
    });
}

/// L2 cache read speed
#[bench]
fn bench_l2_read_speed(b: &mut Bencher) {
    let cache = setup_disk_cache();
    populate_cache(&cache, 1_000_000);  // 1M chunks

    b.iter(|| {
        read_random_chunks(&cache, 10000)
    });
}

/// Cache eviction performance
#[bench]
fn bench_cache_eviction(b: &mut Bencher) {
    let cache = setup_cache_256mb();

    b.iter(|| {
        // Write more than cache size to trigger eviction
        write_512mb_to_cache(&cache)
    });
}
```

#### 3.5 Protocol Benchmarks

```rust
// benches/protocol.rs

/// Message serialization speed
#[bench]
fn bench_serialize_read_response(b: &mut Bencher) {
    let msg = ReadChunkResponse {
        chunk_id: ChunkId::new(1, 0),
        data: vec![0u8; 128 * 1024],
        checksum: [0u8; 32],
        is_final: false,
    };

    b.iter(|| {
        bincode::serialize(&msg).unwrap()
    });
}

/// Message deserialization speed
#[bench]
fn bench_deserialize_read_response(b: &mut Bencher) {
    let bytes = setup_serialized_response();

    b.iter(|| {
        bincode::deserialize::<ReadChunkResponse>(&bytes).unwrap()
    });
}

/// Checksum calculation
#[bench]
fn bench_blake3_128kb(b: &mut Bencher) {
    let data = vec![0u8; 128 * 1024];

    b.iter(|| {
        blake3::hash(&data)
    });
}
```

---

## 4. Baseline Metrics

### Theoretical Limits

| Operation | Theoretical Max | Limiting Factor |
|-----------|-----------------|-----------------|
| LAN throughput | 125 MB/s | 1 Gbps network |
| SSD read | 3,500 MB/s | NVMe spec |
| Memory copy | 20,000 MB/s | DDR4 bandwidth |
| FUSE overhead | ~5-10% | Kernel/userspace crossing |
| QUIC overhead | ~2-5% | Encryption + framing |

### Expected Baseline (LAN, SSD, No Cache)

| Operation | Expected | Notes |
|-----------|----------|-------|
| Sequential read 1GB | 80-100 MB/s | Network limited |
| Random read 4KB | 5,000-10,000 IOPS | Latency limited |
| stat() | <10ms | Cached after first |
| readdir() 1000 files | <100ms | First call |
| First byte (cold) | <100ms | Network RTT + disk |
| First byte (warm) | <10ms | L1 cache |

### Real-World Scenarios

#### Video Editing Workload
```
Scenario: Scrubbing 4K ProRes video
- File size: 50GB
- Access pattern: Sequential with jumps
- Expected: 60+ MB/s sustained (playback at 24fps)
```

#### Game Development Workload
```
Scenario: Loading game assets
- File count: 10,000 small files
- Access pattern: Random, bursty
- Expected: <500ms to load 100MB of assets
```

#### VFX Rendering Workload
```
Scenario: Reading texture files
- File size: 100MB-1GB each
- Access pattern: Sequential read, parallel files
- Expected: 80+ MB/s per stream, 4+ streams
```

---

## 5. Profiling Guide

### CPU Profiling

```bash
# Flamegraph (Linux)
cargo install flamegraph
sudo cargo flamegraph --bin teleport-daemon -- host ./folder

# perf (Linux)
perf record -g cargo run --release --bin teleport-daemon -- host ./folder
perf report

# Instruments (macOS)
cargo build --release
instruments -t "Time Profiler" target/release/teleport-daemon host ./folder
```

### Memory Profiling

```bash
# Valgrind (Linux)
cargo build --release
valgrind --tool=massif target/release/teleport-daemon host ./folder
ms_print massif.out.*

# heaptrack (Linux)
heaptrack target/release/teleport-daemon host ./folder
heaptrack_gui heaptrack.*.gz

# Instruments (macOS)
instruments -t "Allocations" target/release/teleport-daemon host ./folder
```

### Async Profiling

```bash
# tokio-console
cargo install tokio-console

# In Cargo.toml, add:
# tokio = { version = "1", features = ["full", "tracing"] }
# console-subscriber = "0.1"

# In main():
# console_subscriber::init();

# Then run:
tokio-console
```

### Network Profiling

```bash
# Wireshark filter for QUIC
quic

# Custom dissector for Wormhole protocol
# (TODO: implement Wireshark plugin)

# Network statistics
ss -tunapl | grep teleport
netstat -s | grep -A5 Udp
```

---

## 6. Optimization Checklist

### Before Optimizing

- [ ] Have a benchmark that reproduces the issue
- [ ] Profile to find the actual bottleneck
- [ ] Set a specific, measurable target
- [ ] Ensure correctness tests exist

### Common Optimizations

#### Memory Optimizations
- [ ] Avoid unnecessary allocations in hot paths
- [ ] Reuse buffers (`Vec::clear()` instead of `Vec::new()`)
- [ ] Use `Arc<Vec<u8>>` instead of cloning large buffers
- [ ] Consider `bytes::Bytes` for zero-copy
- [ ] Pool allocations for fixed-size objects

#### CPU Optimizations
- [ ] Avoid redundant checksums (trust QUIC's integrity)
- [ ] Use SIMD for checksum calculation (BLAKE3 does this)
- [ ] Batch small operations
- [ ] Reduce lock contention (use `RwLock` for read-heavy)

#### Network Optimizations
- [ ] Enable Nagle's algorithm disable (already done by QUIC)
- [ ] Tune buffer sizes
- [ ] Pipeline requests (don't wait for response before next request)
- [ ] Compress metadata (but not already-compressed files)

#### Cache Optimizations
- [ ] Tune L1/L2 sizes for workload
- [ ] Implement negative caching (cache "not found")
- [ ] Use read-ahead for sequential access
- [ ] Prioritize eviction by access pattern

### After Optimizing

- [ ] Run full benchmark suite
- [ ] Verify no regression in other metrics
- [ ] Document the optimization and its impact
- [ ] Update baseline metrics

---

## 7. Comparison with Alternatives

### Methodology

Test conditions:
- Same hardware
- Same network conditions
- Same file set (1GB file, 10,000 small files)
- Fresh cache state

### Benchmark Results (Expected)

| Tool | Sequential Read | Random Read | First Byte |
|------|-----------------|-------------|------------|
| **Wormhole** | 90 MB/s | 8,000 IOPS | 50ms |
| **sshfs** | 40 MB/s | 500 IOPS | 200ms |
| **NFS** | 100 MB/s | 10,000 IOPS | 20ms |
| **Syncthing** | N/A (sync) | N/A | N/A |
| **Dropbox** | 50 MB/s | 1,000 IOPS | 500ms |

### Notes

- **sshfs:** Limited by SSH encryption overhead, single-threaded
- **NFS:** Kernel-level, lowest latency, but complex setup
- **Syncthing:** Not comparable (full sync, not mount)
- **Dropbox:** Cloud latency dominates

### Wormhole Advantages

1. **vs sshfs:** Multiplexed streams, modern crypto, better throughput
2. **vs NFS:** Zero configuration, NAT traversal, E2E encryption
3. **vs Syncthing:** On-demand access, no full sync required
4. **vs Dropbox:** No cloud, free, lower latency

---

## Appendix: Benchmark Data Template

```markdown
## Benchmark Report: [Date]

### Environment
- Hardware: [CPU, RAM, Storage]
- OS: [Name, Version]
- Wormhole Version: [Version]
- Network: [LAN/WAN, conditions]

### Results

| Benchmark | p50 | p95 | p99 | Max |
|-----------|-----|-----|-----|-----|
| seq_read_1gb | | | | |
| random_read_4kb | | | | |
| first_byte_cold | | | | |
| first_byte_warm | | | | |
| stat_latency | | | | |
| readdir_1000 | | | | |

### Notes
- [Any anomalies or observations]

### Comparison to Previous
- [Changes from last benchmark]
```
