1) Add storage_defs.rs with CHUNK_SIZE=128KB and ChunkId helpers.
2) Add lru dep to teleport-daemon; implement cache.rs (RamCache with LruCache, ~4000 entries).
3) Add governor.rs (sequential streak detector returning prefetch ChunkIds).
4) Extend client_actor.rs: ActorMessage (Priority/Background), inject cache+governor; fetch_and_cache uses fetch_data_segment(start_offset, CHUNK_SIZE).
5) Update fs.rs read: map offset..offset+size across chunks; check cache first; otherwise oneshot to actor; slice overlaps and stitch; keep clustering minimal beyond chunking.
6) Update main.rs: create shared cache, spawn actor with cache, pass cache to TeleportFS; keep RO mount options.
7) Test: create 5MB video.bin; cp from mount and observe logs showing prefetch of subsequent chunks; dd skip into middle chunk to confirm priority + next prefetch; verify hashes.
