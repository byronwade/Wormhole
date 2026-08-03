# ADR-018: Content-Addressed Blob Store

**Status:** Accepted  
**Date:** 2026-08-02  
**Related:** ADR-015 (iroh), ADR-016 (postcard), `16-bleeding-edge-oss-modernization.md` Wave C

## Context

Wormhole caches were keyed by `(inode, chunk_index)`. That works for a live mount but prevents cross-file dedup and resume-after-reboot when path identity changes. The modernization plan calls for BLAKE3 content addressing aligned with iroh-blobs.

## Decision

1. **Local store first:** `teleport-blobs::BlobStore` keys chunks by BLAKE3 (`ContentHash`) under `~/.cache/wormhole/blobs/`.
2. **Hybrid cache dual-write:** `HybridChunkCache` writes to classic `DiskCache` *and* the content store, maintaining a `ChunkId → ContentHash` index for L3 hits.
3. **iroh-blobs optional:** Feature `iroh-blobs` on `teleport-blobs` exposes ticket helpers for verified streaming pulls. Full provider/get swap is incremental — VFS semantics stay in `teleport-daemon`.
4. **Ticket labels:** Portable `blake3:<hex>` labels for manifests; full `BlobTicket` when a provider endpoint is known.

## Consequences

- Remounts can skip re-download when hashes are known.
- Dedup across files/peers becomes natural.
- Classic ChunkId paths remain until all readers consult the hash index.
- Enabling `iroh-blobs` pulls additional deps (redb, etc.); keep it optional for lean builds.
