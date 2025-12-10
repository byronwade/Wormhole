# Phase 8 — Execution Manual

**Goal:** Maximum-throughput file transfers using software-only optimizations.

**Success:** Copy 50GB from mounted remote to local in <90 seconds on 10GbE LAN (>550 MB/s sustained), or saturate any consumer internet link within 5 seconds of transfer start.

This phase transforms the data plane from "good enough" to "best possible without hardware upgrades" — a userspace data plane that behaves like NVMe-oF over standard internet links.

---

## What This Phase Enables

After Phase 8, Wormhole will:

1. **Saturate any network link** — 95-99% of theoretical throughput on LAN, 90%+ on WAN
2. **Beat SMB/NFS/SCP** — 2-5x faster on real workloads
3. **Zero-copy transfers** — Data moves directly from remote disk to local disk with minimal CPU involvement
4. **Smart deduplication** — Only transfer bytes that don't already exist locally
5. **Adaptive transport** — Automatically switch between QUIC and TCP based on network conditions

---

## Key Constraints

| Constraint | Reason |
|------------|--------|
| Software-only | No hardware upgrades (RDMA, NVMe-oF, InfiniBand) |
| Cross-platform | Must work on macOS, Linux, Windows |
| No kernel modules | Userspace-only for easy installation |
| Backward compatible | Existing Phase 7 clients can still connect |

---

## Target Users

- **Video editors** scrubbing 4K/8K footage over the network
- **Game developers** loading massive asset libraries
- **VFX artists** rendering from shared texture caches
- **Anyone** who needs to move large files fast without cloud uploads
