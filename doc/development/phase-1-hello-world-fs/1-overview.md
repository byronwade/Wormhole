# Phase 1 — Execution Manual

## Goal
Build the networking plumbing and metadata engine. Success: run host on Computer A and mount on Computer B; `ls -R` on the client instantly lists thousands of remote files.

## Why This Phase First
Phase 1 establishes the foundational architecture that all subsequent phases build upon:
- **QUIC Transport Layer**: quinn + rustls provides the encrypted, multiplexed transport used throughout
- **Wire Protocol**: NetMessage enum defines the communication contract between host and client
- **Metadata Engine**: DirEntry tree structure and VFS inode mapping form the basis for all file operations
- **FUSE Integration**: The basic FUSE shim proves the mount mechanism works before adding complexity

## Success Criteria
- Host starts and binds to port 5000 with self-signed TLS certificate
- Client connects, completes TLS handshake, sends ListRequest
- Host scans directory tree and returns ListResponse with complete DirEntry tree
- Client builds inode map from DirEntry, mounts via FUSE
- `ls -R` on mount point shows full remote tree with correct sizes/mtimes
- Metadata fetch completes in <200ms on LAN for ~10k entries
- Memory usage stays reasonable (track VFS memory footprint)
