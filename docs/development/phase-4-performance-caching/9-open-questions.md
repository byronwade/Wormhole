# Phase 4 Open Questions - RESOLVED

## Q1: Default/max cache size knobs and user configurability?

**Decision:**

| Setting | Default | Min | Max | Configurable |
|---------|---------|-----|-----|--------------|
| L1 (RAM) | 256 MB | 64 MB | 2 GB | Yes |
| L2 (Disk) | 1 GB | 100 MB | 100 GB | Yes |
| TTL (attrs) | 5 seconds | 1 second | 60 seconds | Yes |
| TTL (chunks) | 60 seconds | 10 seconds | 1 hour | Yes |

**Config example:**
```toml
[cache]
l1_max_bytes = 268435456      # 256 MB (RAM)
l2_max_bytes = 1073741824     # 1 GB (Disk)
l2_path = "~/.wormhole/cache"
attr_ttl_secs = 5
chunk_ttl_secs = 60
```

**Rationale:**
- Defaults work for 90% of users (8+ GB RAM, 100+ GB free disk)
- Power users can tune for their workload
- Hard limits prevent accidental resource exhaustion

---

## Q2: Should GC consider frequency (LFU) vs pure recency (LRU)?

**Decision:** **LRU for MVP, with metrics to inform future decisions**

**Rationale:**
- LRU is simpler to implement and debug
- LRU works well for video editing (sequential access)
- LRU works well for code editing (working set)
- LFU better for datasets with hot/cold separation
- We'll add metrics to track hit rates and revisit if LRU underperforms

**Implementation:**
- L1: `lru` crate (already in workspace)
- L2: SQLite with `last_accessed` column, periodic GC sweep

**Future consideration:**
- Could add "pinning" for user-specified files
- Could implement ARC (Adaptive Replacement Cache) if LRU proves insufficient

---

## Q3: Do we need integrity hashes on disk chunks or trust transport?

**Decision:** **Yes, store BLAKE3 checksums with disk-cached chunks**

**Rationale:**
- Disk corruption happens (bit rot, filesystem bugs)
- BLAKE3 is extremely fast (~3 GB/s per core)
- Already computing checksums for transport verification
- Storage overhead: 32 bytes per chunk (0.025% for 128 KB chunks)

**Implementation:**
```rust
// Disk cache entry
struct CachedChunk {
    chunk_id: ChunkId,
    data: Vec<u8>,
    checksum: [u8; 32],  // BLAKE3
    cached_at: SystemTime,
    last_accessed: SystemTime,
}

// On read: verify checksum, evict if corrupt
fn read_cached_chunk(id: &ChunkId) -> Option<Vec<u8>> {
    let entry = db.get(id)?;
    if blake3::hash(&entry.data).as_bytes() != &entry.checksum {
        db.delete(id);
        metrics.cache_corruptions.inc();
        return None;
    }
    Some(entry.data)
}
```

---

## Q4: Plan and timeline for metadata persistence to enable true offline mounts?

**Decision:**
- **Phase 4:** Chunk caching only (data survives restarts)
- **Phase 5+:** Full metadata persistence for offline mounts

**Metadata persistence requirements:**
1. Inode ↔ path mappings (InodeTable)
2. File attributes (FileAttr)
3. Directory structures (parent → children)
4. Pending writes queue

**Offline mount behavior:**
- Read-only access to cached files
- Queue writes for sync on reconnection
- Show "offline" indicator in UI
- Conflict resolution on reconnect

**Timeline:**
- Phase 4: Data cache persistence (SQLite or files)
- Phase 5: UI shows cached vs uncached files
- Phase 6+: Full offline mode with sync queue
