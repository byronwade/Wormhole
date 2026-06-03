1) Protocol: add write/lock/create/delete messages to teleport-core NetMessage.
2) Host: add host_write.rs with LockManager and apply_write; wire into host.rs handlers (LockRequest, WriteRequest, CreateFileRequest, DeleteRequest, WriteAck).
3) Client cache: extend HybridCache with dirty_set, write_local, clear_dirty; ensure chunk hashing persists.
4) Sync engine: new sync_engine.rs consuming chunk queue; fetch from cache; call send_write_request(host, path, start_offset, data, lock_token); clear dirty on success.
5) Client net: implement send_write_request; consider lock acquire/release helpers.
6) FUSE: implement write with read-modify-write over chunk, cache update, queue to sync_tx; setattr (truncate) and create wired to host; maintain inode->path mapping.
7) Main wiring: add sync queue channel and pass to TeleportFS; start SyncEngine task; define lock TTL/renewal/cleanup on crash.
8) UI: show sync-progress via events; show lock status/errors; allow join code/IP flows to request locks.
