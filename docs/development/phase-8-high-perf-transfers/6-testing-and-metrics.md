# Phase 8 — Testing and Metrics

## Overview

Performance testing is critical for Phase 8. Every optimization must be measured against baselines, and regressions must be caught before merge.

---

## Benchmark Suite

### Directory Structure

```
benches/
├── phase8_throughput.rs    # End-to-end bulk transfers
├── zero_copy_io.rs         # Platform I/O layer
├── parallel_streams.rs     # Stream pool scaling
├── content_chunks.rs       # Hashing and dedup
├── compression.rs          # Smart compression
└── regression.rs           # Latency regression tests
```

### Running Benchmarks

```bash
# Full Phase 8 suite
cargo bench --features phase8

# Specific benchmark
cargo bench --bench phase8_throughput

# With HTML report
cargo bench -- --save-baseline current
cargo bench -- --baseline current --format html > report.html

# Compare against previous run
cargo bench -- --load-baseline main --baseline pr
```

---

## Key Benchmarks

### 1. Bulk Transfer Throughput

```rust
// benches/phase8_throughput.rs

#[bench]
fn bench_bulk_1gb_lan(b: &mut Bencher) {
    let test_env = TestEnvironment::lan_simulation();
    let file = test_env.create_file(1_000_000_000); // 1 GB

    b.iter(|| {
        test_env.transfer_file(&file)
    });

    // Report throughput
    b.bytes = 1_000_000_000;
}

#[bench]
fn bench_bulk_10gb_lan(b: &mut Bencher) {
    let test_env = TestEnvironment::lan_simulation();
    let file = test_env.create_file(10_000_000_000); // 10 GB

    b.iter(|| {
        test_env.transfer_file(&file)
    });

    b.bytes = 10_000_000_000;
}

#[bench]
fn bench_bulk_1gb_wan_50ms(b: &mut Bencher) {
    let test_env = TestEnvironment::wan_simulation(
        latency_ms: 50,
        bandwidth_mbps: 100,
        packet_loss: 0.0,
    );
    let file = test_env.create_file(1_000_000_000);

    b.iter(|| {
        test_env.transfer_file(&file)
    });

    b.bytes = 1_000_000_000;
}
```

### 2. Deduplication Efficiency

```rust
// benches/content_chunks.rs

#[bench]
fn bench_dedup_identical_1gb(b: &mut Bencher) {
    let test_env = TestEnvironment::lan_simulation();
    let file = test_env.create_file(1_000_000_000);

    // First transfer (cold)
    test_env.transfer_file(&file);

    // Second transfer (should hit dedup)
    b.iter(|| {
        test_env.transfer_file(&file)
    });

    // Should complete in <1 second regardless of file size
}

#[bench]
fn bench_dedup_90_percent_similar(b: &mut Bencher) {
    let test_env = TestEnvironment::lan_simulation();
    let original = test_env.create_file(1_000_000_000);
    test_env.transfer_file(&original);

    // Modify 10% of the file
    let modified = test_env.modify_file(&original, 0.10);

    b.iter(|| {
        test_env.transfer_file(&modified)
    });

    // Should only transfer ~100 MB
}
```

### 3. Parallel Stream Scaling

```rust
// benches/parallel_streams.rs

#[bench]
fn bench_streams_1(b: &mut Bencher) {
    run_with_streams(b, 1);
}

#[bench]
fn bench_streams_4(b: &mut Bencher) {
    run_with_streams(b, 4);
}

#[bench]
fn bench_streams_16(b: &mut Bencher) {
    run_with_streams(b, 16);
}

#[bench]
fn bench_streams_64(b: &mut Bencher) {
    run_with_streams(b, 64);
}

#[bench]
fn bench_streams_256(b: &mut Bencher) {
    run_with_streams(b, 256);
}

fn run_with_streams(b: &mut Bencher, count: usize) {
    let test_env = TestEnvironment::lan_simulation()
        .with_stream_count(count);
    let file = test_env.create_file(10_000_000_000);

    b.iter(|| {
        test_env.transfer_file(&file)
    });
}
```

### 4. Zero-Copy Verification

```rust
// benches/zero_copy_io.rs

#[bench]
fn bench_read_1gb_standard(b: &mut Bencher) {
    let file = create_temp_file(1_000_000_000);

    b.iter(|| {
        // Standard tokio::fs read
        tokio::fs::read(&file).await
    });
}

#[bench]
fn bench_read_1gb_zero_copy(b: &mut Bencher) {
    let file = create_temp_file(1_000_000_000);
    let io = platform_io();

    b.iter(|| {
        io.read_direct(&file, 0, 1_000_000_000).await
    });
}

#[bench]
fn bench_sendfile_1gb(b: &mut Bencher) {
    let file = create_temp_file(1_000_000_000);
    let (client, server) = create_tcp_pair();
    let io = platform_io();

    b.iter(|| {
        io.sendfile(&file, &server, 0, 1_000_000_000).await
    });
}
```

### 5. Compression Benchmarks

```rust
// benches/compression.rs

#[bench]
fn bench_compress_text_100mb(b: &mut Bencher) {
    let data = generate_text_data(100_000_000);
    let compressor = SmartCompressor::new(3);

    b.iter(|| {
        compressor.compress(&data)
    });
}

#[bench]
fn bench_entropy_calculation(b: &mut Bencher) {
    let data = generate_random_data(4096);
    let compressor = SmartCompressor::new(3);

    b.iter(|| {
        compressor.should_compress("test.dat", &data)
    });
}

#[bench]
fn bench_skip_compressed_format(b: &mut Bencher) {
    let data = generate_mp4_header(4096);
    let compressor = SmartCompressor::new(3);

    b.iter(|| {
        compressor.should_compress("video.mp4", &data)
    });
}
```

### 6. Latency Regression Tests

```rust
// benches/regression.rs

/// CRITICAL: Random access latency must not regress
#[bench]
fn bench_random_read_4kb_cold(b: &mut Bencher) {
    let test_env = TestEnvironment::lan_simulation();
    let file = test_env.create_file(1_000_000_000);

    b.iter(|| {
        let offset = rand::random::<u64>() % (1_000_000_000 - 4096);
        test_env.read_range(&file, offset, 4096)
    });
}

/// CRITICAL: First byte latency must stay <50ms
#[bench]
fn bench_first_byte_latency(b: &mut Bencher) {
    let test_env = TestEnvironment::lan_simulation();
    let file = test_env.create_file(100_000_000);

    b.iter(|| {
        test_env.clear_cache();
        test_env.read_range(&file, 0, 1)
    });
}
```

---

## Metrics to Track

### Primary Metrics

| Metric | Target | Critical | Measurement Method |
|--------|--------|----------|-------------------|
| Bulk throughput (1G LAN) | >112 MB/s | >100 MB/s | `bench_bulk_1gb_lan` |
| Bulk throughput (10G LAN) | >900 MB/s | >700 MB/s | `bench_bulk_10gb_lan` |
| WAN efficiency | >90% | >80% | `bench_bulk_1gb_wan_50ms` |
| Dedup hit transfer | <1 sec | <5 sec | `bench_dedup_identical_1gb` |
| First byte latency | <50ms | <100ms | `bench_first_byte_latency` |
| Random 4KB read | <10ms | <20ms | `bench_random_read_4kb_cold` |

### Secondary Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| RAM copies per chunk | 0-1 | `strace -e trace=read,write,copy_file_range` |
| Syscalls per MB | <10 | `strace -c` during transfer |
| CPU per 100 MB/s | <0.5% | `perf stat` during transfer |
| Memory high-water | <100 MB | `valgrind --tool=massif` |
| BLAKE3 hash rate | >1 GB/s | `bench_blake3_throughput` |
| zstd compression ratio | >2x (text) | `bench_compress_text_100mb` |

---

## Test Scenarios

### 1. Single Large File

**Purpose:** Test sustained throughput on bulk transfers.

```bash
# Create 50GB test file
dd if=/dev/urandom of=/tmp/test_50gb bs=1M count=51200

# Transfer via Wormhole mount
time cp /mnt/wormhole/test_50gb /tmp/local_copy

# Expected: <90 seconds on 10GbE (>555 MB/s)
```

### 2. Many Small Files

**Purpose:** Test IOPS and metadata overhead.

```bash
# Create 100,000 small files
mkdir /tmp/small_files
for i in $(seq 1 100000); do
    dd if=/dev/urandom of=/tmp/small_files/file_$i bs=10K count=1
done

# Transfer all files
time cp -r /mnt/wormhole/small_files /tmp/local_copy

# Expected: <10 seconds (>10,000 files/sec)
```

### 3. Video Scrubbing Simulation

**Purpose:** Test random access pattern for video editing.

```bash
# Simulate scrubbing through a 50GB video
./bench_video_scrub /mnt/wormhole/video.mov \
    --seek-count 1000 \
    --read-size 4MB

# Expected: <100ms per seek
```

### 4. Concurrent Transfers

**Purpose:** Test aggregate throughput with multiple clients.

```bash
# Start 4 parallel transfers
for i in 1 2 3 4; do
    time cp /mnt/wormhole/file_$i /tmp/local_$i &
done
wait

# Expected: Combined throughput near line rate
```

---

## Profiling Guide

### CPU Profiling

```bash
# Linux - perf
perf record -g cargo run --release -- host /tmp/share
perf report

# Linux - flamegraph
cargo install flamegraph
sudo cargo flamegraph -- host /tmp/share

# macOS - Instruments
cargo build --release
instruments -t "Time Profiler" target/release/wormhole host /tmp/share
```

### Memory Profiling

```bash
# Linux - valgrind
valgrind --tool=massif target/release/wormhole host /tmp/share
ms_print massif.out.*

# Linux - heaptrack
heaptrack target/release/wormhole host /tmp/share
heaptrack_gui heaptrack.*.gz
```

### I/O Profiling

```bash
# Linux - verify zero-copy
strace -e trace=read,write,sendfile,splice,copy_file_range \
    target/release/wormhole host /tmp/share

# Count syscalls
strace -c target/release/wormhole host /tmp/share

# macOS - dtrace
sudo dtrace -n 'syscall::read:entry,syscall::write:entry /execname == "wormhole"/ { @[probefunc] = count(); }'
```

### Network Profiling

```bash
# Wireshark filter for QUIC
quic

# iperf3 baseline (what's possible)
iperf3 -s  # Server
iperf3 -c <host> -t 60  # Client

# ss connection stats
ss -tunapl | grep wormhole
```

---

## CI Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/phase8-benchmarks.yml
name: Phase 8 Performance

on:
  push:
    branches: [main]
  pull_request:

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install io_uring headers
        run: sudo apt-get install -y liburing-dev

      - name: Run benchmarks
        run: |
          cargo bench --features phase8 -- \
            --save-baseline ${{ github.sha }}

      - name: Compare to main
        if: github.event_name == 'pull_request'
        run: |
          git fetch origin main
          git checkout origin/main
          cargo bench --features phase8 -- --save-baseline main
          git checkout -
          cargo bench --features phase8 -- \
            --baseline main \
            --compare

      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: benchmark-results
          path: target/criterion/

      - name: Fail on regression
        run: |
          # Parse criterion output for >10% regressions
          ./scripts/check_benchmarks.sh
```

### Regression Detection Script

```bash
#!/bin/bash
# scripts/check_benchmarks.sh

THRESHOLD=10  # Percent regression allowed

for report in target/criterion/*/new/estimates.json; do
    bench_name=$(dirname "$report" | xargs dirname | xargs basename)
    mean=$(jq '.mean.point_estimate' "$report")
    baseline=$(jq '.mean.point_estimate' "${report/new/base}")

    if [ -n "$baseline" ] && [ "$baseline" != "null" ]; then
        pct_change=$(echo "scale=2; ($mean - $baseline) / $baseline * 100" | bc)
        if (( $(echo "$pct_change > $THRESHOLD" | bc -l) )); then
            echo "REGRESSION: $bench_name increased by ${pct_change}%"
            exit 1
        fi
    fi
done

echo "All benchmarks within threshold"
```

---

## Performance Report Template

```markdown
## Performance Report: Phase 8 Build [VERSION]

### Environment
- **Hardware:** [CPU, RAM, NIC, Storage]
- **OS:** [Name, Version, Kernel]
- **Network:** [LAN/WAN, simulated conditions]

### Results

| Benchmark | Phase 7 | Phase 8 | Change |
|-----------|---------|---------|--------|
| bulk_1gb_lan | X MB/s | Y MB/s | +Z% |
| bulk_10gb_lan | X MB/s | Y MB/s | +Z% |
| wan_50ms_100mbps | X% efficiency | Y% | +Z% |
| dedup_identical | X sec | Y sec | -Z% |
| first_byte | X ms | Y ms | -Z% |
| random_4kb | X ms | Y ms | unchanged |

### Zero-Copy Verification
- Syscalls per MB: X (target: <10)
- RAM copies per chunk: Y (target: 0-1)

### Notes
- [Any anomalies or observations]
```
