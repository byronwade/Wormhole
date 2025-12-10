# Phase 8 — Goals

## Primary Performance Targets

| Metric | Current (Phase 7) | Phase 8 Target | Theoretical Max | Improvement |
|--------|-------------------|----------------|-----------------|-------------|
| **1 Gbps LAN** | 80-100 MB/s | **112-118 MB/s** | 125 MB/s | ~20% |
| **2.5 Gbps LAN** | ~180 MB/s | **280-295 MB/s** | 312 MB/s | ~55% |
| **10 Gbps LAN** | ~450-700 MB/s | **900-1,050 MB/s** | 1,250 MB/s | ~50% |
| **WAN (100 Mbps)** | 40-70% of max | **90-97%** of link | 12.5 MB/s | ~30% |
| **First-byte latency** | <100ms | **<50ms** | ~RTT | 50% |

---

## Zero-Copy Targets

| Operation | Current | Target | Why It Matters |
|-----------|---------|--------|----------------|
| RAM copies per chunk | 2-3 | **0-1** | CPU bottleneck eliminated |
| Syscalls per 128KB | 4-6 | **1-2** | Kernel transition overhead |
| Allocations per chunk | 1-2 | **0** (pooled) | GC pressure, memory bandwidth |

---

## Efficiency Targets

| Metric | Target |
|--------|--------|
| **CPU per MB/s** | <0.5% per 100 MB/s |
| **Memory overhead** | <50 MB for engine (excluding cache) |
| **Line-rate efficiency** | >95% on LAN, >90% on WAN |
| **Compression ratio** | >2x on compressible files, 0 overhead on incompressible |

---

## Scalability Targets

| Scenario | Target |
|----------|--------|
| **Single large file** (100GB) | Full line-rate sustained |
| **Many small files** (100K × 10KB) | >10,000 files/sec |
| **Concurrent transfers** | 4+ streams at full aggregate throughput |
| **Dedup hit rate** | >99% for identical files across sessions |

---

## Comparison Targets

Beat these alternatives by the specified margin:

| Tool | Current Wormhole | Phase 8 Target |
|------|------------------|----------------|
| **SMB/CIFS** | ~same | **1.5-2x faster** |
| **NFS v4** | ~same | **1.2x faster** (NFS is kernel, hard to beat) |
| **SCP/SFTP** | 1.5x faster | **2-3x faster** |
| **rsync** | ~same (first transfer) | **10x faster** (resume with dedup) |
| **Syncthing** | N/A (different model) | N/A |

---

## Success Criteria

Phase 8 is complete when:

1. [ ] 50GB file transfers at >500 MB/s on 10GbE LAN (benchmark proof)
2. [ ] 90%+ line-rate on 100 Mbps WAN with 50ms RTT
3. [ ] Zero-copy path verified via `strace`/`dtrace` (0-1 copies)
4. [ ] Dedup working: re-transfer of identical 1GB file completes in <1 second
5. [ ] All three platforms (macOS, Linux, Windows) achieving targets
6. [ ] Benchmark suite automated in CI
