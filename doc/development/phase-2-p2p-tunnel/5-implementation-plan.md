1) Protocol expansion: add ReadRequest/ReadResponse/ErrorResponse to NetMessage in teleport-core.
2) disk_io.rs: safe ranged reads (path sanitization, seek/read, truncate on EOF).
3) host.rs: handle ReadRequest; serialize ReadResponse or ErrorResponse; reuse existing List handling.
4) client.rs: add fetch_data_segment mirroring fetch_metadata; cap response size (~10MB).
5) client_actor.rs: mpsc/oneshot bridge; reconnect-per-request MVP using fetch_data_segment.
6) vfs.rs: add inode_to_path and ingest path strings; helper get_path().
7) fs.rs: implement read; resolve path, send FetchRequest over channel; blocking recv for data; clustering: fetch max(size, 64KB).
8) main.rs: wire actor/channel; spawn actor on mount; pass sender into TeleportFS; set AutoUnmount.
9) Smoke tests: text read, binary hash match, small video playback.
