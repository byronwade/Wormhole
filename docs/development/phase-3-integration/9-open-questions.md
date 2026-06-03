# Phase 3 Open Questions - RESOLVED

## Q1: Should CHUNK_SIZE adapt to link speed or media type? Auto-tune vs fixed 128KB.

**Decision:** **Fixed 128 KB for MVP**

**Rationale:**
- 128 KB is a well-tested sweet spot:
  - Small enough for reasonable latency on slow links (~1s on 1 Mbps)
  - Large enough to amortize per-chunk overhead
  - Matches common disk block sizes (good for caching)
- Adaptive sizing adds significant complexity:
  - Requires bandwidth estimation
  - Complicates checksums and caching
  - Benefits diminish with QUIC's built-in congestion control

**Future consideration (Phase 4+):**
- Could offer "turbo mode" with 1 MB chunks for LAN transfers
- Media-type awareness could skip seeking for video files

---

## Q2: Max cache size and eviction policy knobs for users?

**Decision:**
- **Default L1 (RAM):** 256 MB
- **Default L2 (Disk):** 1 GB (Phase 4)
- **User configurable:** Yes, via config file
- **Eviction policy:** LRU (Least Recently Used)

**Rationale:**
- 256 MB RAM is safe on modern systems (phones have 4+ GB)
- LRU is simple, effective, and predictable
- LFU adds complexity without clear benefit for streaming workloads

**Config schema:**
```toml
[cache]
l1_max_bytes = 268435456  # 256 MB
l2_max_bytes = 1073741824 # 1 GB
l2_path = "~/.wormhole/cache"
```

---

## Q3: Persistent cache timeline (Phase 4) and hash integration with caching?

**Decision:**
- **Timeline:** Phase 4 (Performance & Caching)
- **Hash integration:** BLAKE3 checksums stored with each cached chunk

**Implementation plan:**
1. L1 (RAM, Phase 3): HashMap<ChunkId, (data, checksum, expiry)>
2. L2 (Disk, Phase 4): SQLite or file-per-chunk with metadata
3. Validation: Re-hash on read, evict if mismatch (corruption detected)

**Offline mounts (future):**
- Requires metadata persistence (inode→path mappings)
- Full offline support is Phase 5+ territory

---

## Q4: Keep persistent QUIC connection in actor vs per-request reconnect?

**Decision:** **Persistent connection in actor** (same as Phase 2 Q1)

**Actor architecture:**
```
┌─────────────────┐
│   FUSE Thread   │
└────────┬────────┘
         │ crossbeam-channel
         ▼
┌─────────────────┐
│  Bridge Actor   │ ← Owns QUIC connection
└────────┬────────┘
         │ Multiple streams
         ▼
┌─────────────────┐
│  Remote Host    │
└─────────────────┘
```

**Benefits:**
- Single connection = less overhead
- Stream multiplexing for concurrency
- Server can push invalidations
- Clean reconnection logic in one place
