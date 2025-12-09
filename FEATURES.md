# FEATURES.md

> Complete feature documentation for Wormhole - the peer-to-peer distributed filesystem

---

## Overview

**Wormhole** is a peer-to-peer (P2P) distributed filesystem that mounts remote directories locally via QUIC transport. Share a folder with a code, others mount it as a local drive.

**Core Value Proposition:**
- **Mount Any Folder** - Remote directories appear as local drives
- **Zero Configuration** - Join codes instead of IP addresses/credentials
- **No Cloud** - Files never touch third-party servers; direct peer-to-peer
- **Free Forever** - P2P architecture = minimal infrastructure costs
- **Cross-Platform** - macOS, Windows, Linux

**Target Users:** Creative professionals (video editors, game developers, VFX artists) who need fast, free, private file sharing without cloud uploads.

---

## Table of Contents

1. [Core Filesystem Features](#1-core-filesystem-features)
2. [Networking & Connectivity](#2-networking--connectivity)
3. [Security & Privacy](#3-security--privacy)
4. [Caching & Performance](#4-caching--performance)
5. [User Interface](#5-user-interface)
6. [Platform Support](#6-platform-support)
7. [Configuration](#7-configuration)
8. [Development Phases](#8-development-phases)
9. [Technical Specifications](#9-technical-specifications)
10. [Use Cases](#10-use-cases)

---

## 1. Core Filesystem Features

### FUSE Integration
- **Mount Remote Directories** - Full FUSE implementation via `fuser` crate
- **Transparent Access** - Remote files appear as local filesystem
- **POSIX Compatibility** - Standard `ls`, `cat`, `find`, `stat` commands work
- **Directory Listings** - Fast recursive `ls -R` on ~10k files (<200ms)
- **File Metadata** - Attributes including size, mtime, ctime, permissions
- **Virtual Filesystem (VFS)** - In-memory inode mapping for efficient traversal

### File Reading
- **Byte-Range Requests** - Efficient partial file reads (not whole-file)
- **Streaming Reads** - Real-time access while remote peer streams data
- **128KB Chunking** - Industry-standard chunk size for performance
- **Sequential Optimization** - Prefetching for streaming workloads
- **Random Access** - Jump to any file position (for editors, video players)
- **Large File Support** - Tested with 100GB+ files
- **Binary Data** - Full support for all file types (video, audio, images, documents)

### File Writing (Bidirectional Sync)
- **Write Operations** - Create, edit, and save files through mount
- **Atomic Writes** - Buffered locally, synced in background
- **Distributed Locking** - Prevent simultaneous edits causing corruption
- **Lock Management** - TTL-based locks with automatic renewal
- **Conflict Resolution** - Handles simultaneous writes gracefully
- **File Creation/Deletion** - Create and remove files on remote peer
- **Directory Operations** - Create, delete, and rename directories

---

## 2. Networking & Connectivity

### QUIC Transport Layer
- **QUIC (RFC 9000)** - UDP-based, multiplexed transport
- **TLS 1.3 Integration** - Built-in encryption via `rustls`
- **Multiplexed Streams** - Multiple concurrent transfers without head-of-line blocking
- **0-RTT Reconnection** - Fast recovery from network interruptions
- **Connection Migration** - Seamless WiFi ↔ Cellular switches
- **Adaptive Bitrate** - Works on 1Mbps to 1Gbps connections

### LAN Connectivity
- **Direct IP Connection** - Host on IP:port, client connects directly
- **Same-Network Optimization** - Optimized for LAN latency (<1ms)
- **Performance:** >100 MB/s throughput, <50ms metadata latency

### WAN Connectivity (Global Internet)
- **NAT Traversal** - Hole punching via STUN servers
- **Signal Server Coordination** - WebSocket-based peer discovery
- **Join Codes** - 16-character base32 codes (e.g., `7KJM-XBCD-QRST-VWYZ`)
- **PAKE Authentication** - Password-authenticated key exchange (SPAKE2)
- **Multi-Server Support** - Multiple STUN servers for reliability
- **Performance:** >10 MB/s over internet, <5 second connection time

### Signal Server
- **WebSocket-based Signaling** - Low-latency peer discovery
- **Code Exchange** - Temporary rooms for peer matching
- **Session Management** - Auto-expiring join codes
- **SQLite Persistence** - Codes survive server restarts
- **Rate Limiting** - Prevent abuse
- **No Data Relay** - Only signals; files never touch signal server

---

## 3. Security & Privacy

### Encryption
- **E2E Encrypted** - TLS 1.3 via QUIC
- **PAKE (SPAKE2)** - Derive keys from short join codes
- **80-bit Entropy** - Join codes are cryptographically secure
- **Session Keys** - Unique per connection session

### Authentication & Authorization
- **Join Code Authentication** - Simple, memorable codes instead of passwords
- **TOFU (Trust-on-First-Use)** - Certificate pinning for known peers
- **Path Sanitization** - Prevent directory traversal attacks
- **Symlink Protection** - Skip symlinks, prevent escape
- **File Permissions** - Respect Unix permissions (uid, gid, mode)

### Privacy
- **No Account Required** - Zero registration
- **No Data Collection** - Open source, no telemetry
- **P2P Only** - Files never touch cloud servers
- **No Metadata Leakage** - Even peer names are optional
- **Secure Deletion** - Option to wipe disk cache

### Threat Mitigations
| Threat | Mitigation |
|--------|------------|
| Path Traversal | Canonicalization + prefix checks |
| Symlink Escape | Skip in scanning, validate in safe_path |
| MITM Attack | TLS 1.3 + certificate verification |
| Passive Eavesdropping | Full encryption on all traffic |
| DoS Attacks | Max request size (10MB), rate limiting |
| Lock Starvation | TTL-based locks prevent indefinite holds |

---

## 4. Caching & Performance

### Two-Tier Cache Architecture

**L1 Cache (RAM)**
- LRU eviction policy
- Default 256MB (configurable)
- Sub-millisecond access
- Hot data (frequently accessed files)

**L2 Cache (Disk)**
- Location: `~/.cache/wormhole/`
- Default 10GB (configurable)
- Persistent across restarts
- LRU with garbage collection

### Prefetching
- **Governor/Prefetch Engine** - Predict next chunks
- **Streaming Prefetch** - Load ahead of current position
- **Sequential Detection** - Aggressive prefetch for sequential reads
- **Configurable Windows** - Prefetch size and concurrency tunable

### Cache Integrity
- **BLAKE3 Checksums** - Verify chunk integrity
- **Corruption Detection** - Identify and reject bad chunks
- **Atomic Writes** - Write to temp file, then atomic rename

### Performance Targets

| Metric | Target |
|--------|--------|
| First Byte Latency | <100ms |
| LAN Throughput | >100 MB/s |
| WAN Throughput | >10 MB/s |
| Metadata Latency | <50ms |
| Memory (Idle) | <50 MB |
| Memory (Active) | <200 MB |
| CPU (Idle) | <1% |
| CPU (Transfer) | <25% |

---

## 5. User Interface

### CLI (Command-Line Interface)
```bash
# Host a folder
wormhole host ./folder

# Mount a remote folder
wormhole mount CODE ./mountpoint

# Show status
wormhole status
```

### GUI (Desktop Application)

**Host Panel**
- Drag-and-drop folder selection
- Large, monospace join code display
- One-click copy (code + link)
- Live peer status with syncing percentage
- Connection indicators (green=connected, yellow=syncing)

**Connect Panel**
- Join code input with auto-formatting
- Smart paste detection
- Mount point browser
- Progress bar with transfer speed
- "Open in Finder/Explorer" button

**System Tray**
- Status indicator (green/yellow/gray)
- Quick actions (Share/Connect without opening main window)
- Active shares list
- Hover tooltips with join codes

### Installers
- **macOS** - .dmg installer with drag-to-Applications
- **Windows** - .exe installer with system PATH registration
- **Linux** - .deb/.rpm packages
- **Auto-Updates** - Built-in update checking

---

## 6. Platform Support

| OS | Status | Minimum Version | Required Software |
|----|--------|-----------------|-------------------|
| **macOS** | ✅ Active | 10.13+ | macFUSE 4.x |
| **Linux** | ✅ Active | Kernel 4.18+ | libfuse3-dev |
| **Windows** | 🔜 Planned | 10 (1809) | WinFsp 2.0 |
| **iOS** | 🔜 Future | TBD | Tauri mobile |
| **Android** | 🔜 Future | TBD | Tauri mobile |

### Architecture Support
- x86_64 (Intel/AMD)
- ARM64 (Apple Silicon, Raspberry Pi)
- ARMv7 (Raspberry Pi 32-bit)

---

## 7. Configuration

Configuration file: `~/.config/wormhole/config.toml`

```toml
[network]
default_port = 5000
signal_server = "wss://signal.wormhole.app/ws"
stun_servers = ["stun.l.google.com:19302"]

[cache]
ram_cache_chunks = 4000        # ~500MB
disk_cache_max_gb = 10
chunk_size_kb = 128

[performance]
prefetch_window = 5
max_concurrent_prefetch = 4

[locking]
lock_ttl_secs = 60
lock_renewal_secs = 30

[logging]
log_level = "info"
log_file = "/var/log/wormhole.log"
```

---

## 8. Development Phases

| Phase | Name | Status | Key Features |
|-------|------|--------|--------------|
| **1** | Hello World FS | ✅ | FUSE mount, `ls`/`stat` work, LAN connection |
| **2** | P2P Tunnel | ✅ | Byte-range reads, file streaming, 128KB chunks |
| **3** | Integration | ✅ | RAM cache (L1), prefetching governor |
| **4** | Performance | ✅ | Disk cache (L2), offline file access |
| **5** | Product Wrapper | ✅ | Tauri GUI, system tray, installers |
| **6** | Security | 🔄 | Signal server, NAT traversal, join codes, PAKE |
| **7** | Release | 🔜 | Bidirectional writes, distributed locking |

---

## 9. Technical Specifications

### Architecture
```
wormhole/
├── crates/
│   ├── teleport-core/     # Shared types, wire protocol, crypto
│   ├── teleport-daemon/   # FUSE driver + QUIC Host/Client
│   └── teleport-signal/   # WebSocket rendezvous server
├── apps/
│   └── teleport-ui/       # Tauri + React frontend
└── doc/                   # Documentation
```

### Wire Protocol
- **Serialization:** bincode (binary format)
- **Framing:** 4-byte little-endian length prefix
- **Messages:** Hello, ListDir, GetAttr, ReadChunk, WriteChunk, AcquireLock, ReleaseLock, Ping/Pong, Error

### Chunk Architecture
- **Chunk Size:** 128KB (131,072 bytes)
- **L1 RAM:** 256MB = ~2,000 chunks in flight
- **L2 Disk:** 10GB = ~81,920 chunks persistent

### Async/Sync Bridge Pattern
```
FUSE Sync Thread
     ↓
Crossbeam Channel (bounded)
     ↓
Tokio Async Runtime (quinn, cache, I/O)
```

### Key Dependencies
- **Tokio** - Async runtime
- **Quinn** - QUIC transport
- **Rustls** - TLS 1.3
- **Fuser** - FUSE bindings
- **SPAKE2** - PAKE authentication
- **BLAKE3** - Checksums
- **Tauri v2** - Desktop framework
- **React + Vite** - Frontend

---

## 10. Use Cases

### Video Editing Workflow
1. Editor mounts render farm's output folder
2. Files appear instantly as available
3. Edit while renders still completing
4. No 30+ minute upload delays
5. Save edits synced back to farm

### Game Development Pipeline
1. Build machine hosts latest build folder
2. QA tester joins with code
3. Builds mount as local drive
4. Launch game directly from mount
5. No manual download step

### VFX Studio Collaboration
1. Host shares project folder (5TB)
2. Remote colorist joins with code
3. Mounts in `/mnt/project`
4. Works on shots directly
5. Changes synced back with locking

### Development Team
1. Host mounts ML model outputs or build artifacts
2. Team members access via local filesystem
3. Load models/binaries directly via file path
4. Offline cache for experimentation

---

## Comparison with Alternatives

| Feature | Wormhole | Dropbox | Syncthing | SSH/SFTP |
|---------|----------|---------|-----------|----------|
| Mount as drive | ✅ | ❌ | ❌ | ❌ |
| P2P (no cloud) | ✅ | ❌ | ✅ | ✅ |
| Join codes | ✅ | ❌ | ❌ | ❌ |
| E2E encrypted | ✅ | ❌ | ✅ | ✅ |
| GUI | ✅ | ✅ | ✅ | ❌ |
| Free forever | ✅ | ❌ | ✅ | ✅ |
| Cross-platform | ✅ | ✅ | ✅ | ✅ |

---

## Pricing

| Tier | Price | Target |
|------|-------|--------|
| **Free** | $0/forever | Individuals, viral growth |
| **Pro** | $8/user/mo | Freelancers, power users |
| **Team** | $15/user/mo | Studios (3-25 people) |
| **Enterprise** | Custom | Organizations (50+) |

---

## Quick Start

```bash
# Install (macOS)
brew install macfuse
cargo install wormhole

# Host a folder
wormhole host ~/Documents/project
# Output: Join code: 7KJM-XBCD-QRST-VWYZ

# On another machine, mount it
wormhole mount 7KJM-XBCD-QRST-VWYZ ~/mnt/project

# Access files normally
ls ~/mnt/project
cat ~/mnt/project/README.md
```

---

## Learn More

- [Master Implementation Plan](doc/development/00-master-implementation-plan.md)
- [Security Guide](doc/development/02-security-guide.md)
- [Testing Strategy](doc/development/01-testing-strategy.md)
- [Brand Identity](doc/marketing/02-brand-identity.md)

---

*Mount Any Folder. Any Computer. No Setup.*
