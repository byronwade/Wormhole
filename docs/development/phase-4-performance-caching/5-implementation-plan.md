1) Add deps to teleport-daemon: directories, fs2, hex, sha2 (keep lru from Phase 3).
2) Create disk_cache.rs: resolve ProjectDirs cache dir, hash file_path+chunk_index (SHA-256 hex), two-level subdir, atomic write tmp->rename, read helper.
3) Update cache.rs to HybridCache: RAM LRU (~4000 chunks) + DiskCache; get() promotes disk hits into RAM; insert() writes RAM then spawns thread to persist to disk.
4) Update client_actor.rs to use HybridCache (no logic change beyond type swap).
5) Add gc.rs: MAX_CACHE_BYTES=10GB; periodic walk + LRU-by-atime eviction every 60s.
6) main.rs: instantiate HybridCache; spawn gc::run_gc_loop; pass cache clones to actor and TeleportFS.
7) Verify multi-level lookup order; ensure atomic writes and path safety remain intact; plan follow-up to persist metadata snapshots for offline remount.
