# Phase 8 — Scope

## In Scope

### Core Features

| Feature | Description |
|---------|-------------|
| **Zero-copy I/O abstraction** | Platform-specific implementations for Linux (io_uring), macOS (kqueue+sendfile), Windows (IOCP+TransmitFile) |
| **Content-addressed chunking** | BLAKE3 hashing, 4MB bulk chunks, dedup index |
| **Parallel stream manager** | 4-256 concurrent streams, auto-tuning based on BDP |
| **Adaptive transport** | QUIC primary, TCP fallback, automatic switching |
| **Smart compression** | File-type detection, entropy analysis, selective zstd |
| **Benchmark suite** | Automated performance tests, CI integration |

### Platform Support

| Platform | I/O Backend | Zero-Copy Send | Status |
|----------|-------------|----------------|--------|
| Linux 5.1+ | io_uring | splice/sendfile | Full support |
| Linux <5.1 | epoll | sendfile | Fallback |
| macOS 10.15+ | kqueue | sendfile | Full support |
| Windows 10+ | IOCP | TransmitFile | Full support |

### Wire Protocol Extensions

| Message | Description |
|---------|-------------|
| `RequestManifest` | Request chunk hashes for a file |
| `ManifestResponse` | List of (offset, size, hash) tuples |
| `RequestChunks` | Batch request by hash |
| `ChunkData` | Chunk content with hash verification |

---

## Out of Scope

### Explicitly Deferred

| Feature | Reason | Future Phase |
|---------|--------|--------------|
| **RDMA/RoCE** | Requires special hardware | Phase 9+ |
| **NVMe-oF** | Requires kernel modules | Phase 9+ |
| **Kernel FUSE bypass** | Platform-specific, complex | Phase 9+ |
| **Multi-path networking** | Complexity, limited benefit for most users | Phase 9 |
| **Erasure coding** | Useful for unreliable links, but adds CPU overhead | Phase 9 |
| **Delta sync (rsync-like)** | Block-level diffing, different use case | Phase 10 |

### Not Changing

| Component | Reason |
|-----------|--------|
| **FUSE interface** | Works well, no changes needed |
| **Signal server** | Already optimized |
| **Join code system** | Already working |
| **Phase 7 write support** | Unchanged, but will use new I/O layer |

---

## Dependencies

### Required Before Phase 8

| Dependency | Status | Notes |
|------------|--------|-------|
| Phase 7 (write support) | Complete | Locking, sync engine |
| Phase 4 (disk cache) | Complete | Will extend with content-addressing |
| Phase 3 (RAM cache) | Complete | Will add pooled buffers |

### Crate Dependencies to Add

```toml
# Cargo.toml additions

[target.'cfg(target_os = "linux")'.dependencies]
io-uring = "0.6"

[dependencies]
blake3 = "1.5"
zstd = "0.13"
dashmap = "5.5"  # Already have this
bytes = "1.5"    # Already have this
```

---

## Boundaries

### What Phase 8 WILL Do

1. **Maximize throughput** for mounted drive → local copy operations
2. **Eliminate redundant transfers** via content-addressed deduplication
3. **Adapt to network conditions** automatically
4. **Work on standard hardware** without special NICs or kernel modules

### What Phase 8 WILL NOT Do

1. **Replace FUSE** — We're optimizing the data plane, not the VFS layer
2. **Require root** — Everything runs in userspace
3. **Break backward compatibility** — Old clients can still connect
4. **Sacrifice latency for throughput** — Random access must stay fast

---

## Risk Boundaries

### Acceptable Risks

- Slightly higher memory usage for buffer pools (bounded by config)
- More complex codebase (offset by comprehensive tests)
- Platform-specific code paths (abstracted behind trait)

### Unacceptable Risks

- Crashes or data corruption
- Regression in random-access latency
- Breaking changes to wire protocol (must be additive)
- Root/admin requirements

---

## Success Boundary

Phase 8 is complete when the benchmark suite shows:

| Test | Requirement |
|------|-------------|
| `bench_bulk_10gb_lan` | >500 MB/s on 10GbE |
| `bench_bulk_1gb_wan_50ms` | >90% of link capacity |
| `bench_dedup_1gb_identical` | <1 second (after first transfer) |
| `bench_random_4kb` | <10ms latency (no regression) |
| `bench_many_small_100k` | >10,000 files/second |
