# Architecture Decision Records (ADRs)

This document records the key architectural decisions made for Project Wormhole, including context, options considered, and rationale.

---

## ADR-001: Transport Protocol - QUIC over Alternatives

### Status
**Accepted**

### Context
We need a transport protocol for peer-to-peer file transfer that handles:
- Large file transfers (50GB+)
- Unreliable networks (WiFi, mobile)
- NAT traversal
- Security (encryption)
- Multiple concurrent streams

### Options Considered

| Option | Pros | Cons |
|--------|------|------|
| **TCP + TLS** | Mature, universal support | Head-of-line blocking, slow handshake, poor NAT traversal |
| **WebRTC** | Built-in NAT traversal, browser support | Complex, overkill for non-browser, high overhead |
| **QUIC** | Multiplexed streams, 0-RTT, built-in TLS 1.3, UDP-based | Newer, fewer libraries |
| **Custom UDP** | Full control | Reinventing the wheel, security risks |

### Decision
**QUIC via the `quinn` crate**

### Rationale
1. **Multiplexed streams** - Multiple file transfers without head-of-line blocking
2. **0-RTT reconnection** - Fast reconnects for unstable connections
3. **Built-in TLS 1.3** - No separate TLS layer needed
4. **UDP-based** - Better NAT traversal than TCP
5. **Connection migration** - Handles network changes (WiFi → cellular)
6. **Rust ecosystem** - `quinn` is mature, well-maintained, async-native

### Consequences
- Requires UDP port forwarding or hole punching for NAT traversal
- Some firewalls block UDP (fallback needed in future)
- Learning curve for team unfamiliar with QUIC

---

## ADR-002: Serialization Format - bincode over JSON/MessagePack

### Status
**Accepted**

### Context
We need to serialize protocol messages for network transmission. Messages include:
- Metadata (file listings, attributes)
- File chunks (up to 128KB binary data)
- Control messages (locks, sync)

### Options Considered

| Option | Size | Speed | Human-readable | Schema |
|--------|------|-------|----------------|--------|
| **JSON** | Large | Slow | Yes | No |
| **MessagePack** | Medium | Fast | No | No |
| **bincode** | Smallest | Fastest | No | Rust types |
| **Protocol Buffers** | Small | Fast | No | .proto files |
| **FlatBuffers** | Small | Fastest | No | .fbs files |

### Decision
**bincode**

### Rationale
1. **Performance** - Fastest serialization in Rust benchmarks
2. **Size** - Smallest wire format (critical for 128KB chunks)
3. **Rust-native** - Direct `serde` derive, no schema files
4. **Zero-copy potential** - Can deserialize without allocation in some cases
5. **Simplicity** - No code generation, no build step

### Consequences
- Not human-readable (use tracing for debugging)
- Not language-agnostic (Rust-only protocol)
- Version compatibility requires careful `Option<T>` usage for new fields

### Migration Path
If we need non-Rust clients in future:
1. Add MessagePack as alternative format
2. Negotiate format in handshake
3. Keep bincode as default for Rust↔Rust

---

## ADR-003: Filesystem Interface - FUSE via `fuser`

### Status
**Accepted**

### Context
We need to present remote files as a local filesystem. Options:
- Kernel module (requires root, platform-specific)
- FUSE (Filesystem in Userspace)
- Virtual drive letter (Windows-specific)

### Options Considered

| Option | Cross-platform | Privileges | Complexity |
|--------|----------------|------------|------------|
| **Kernel module** | No | Root | Very High |
| **FUSE (fuser)** | Linux/macOS | User | Medium |
| **WinFSP** | Windows only | User | Medium |
| **Dokan** | Windows only | User | Medium |
| **Custom VFS** | Yes | User | Very High |

### Decision
**FUSE via `fuser` crate** (Linux/macOS) + **WinFSP** (Windows)

### Rationale for `fuser` over alternatives:
1. **Pure Rust** - No C bindings, memory-safe
2. **Async-friendly** - Works with tokio via channels
3. **Maintained** - Active development, good docs
4. **Feature-complete** - Supports all FUSE operations we need

### Alternatives rejected:
- `fuse-rs`: Abandoned
- `fuse3`: Less mature than fuser
- `polyfuse`: Good but less documented

### Consequences
- Requires macFUSE on macOS (user must install)
- Requires libfuse3-dev on Linux
- Windows needs separate WinFSP implementation
- FUSE methods are synchronous (need actor bridge for async)

---

## ADR-004: Desktop Framework - Tauri over Electron

### Status
**Accepted**

### Context
We need a cross-platform desktop GUI for:
- System tray integration
- Native file dialogs
- Notifications
- Auto-updates

### Options Considered

| Option | Bundle Size | Memory | Language | Native Feel |
|--------|-------------|--------|----------|-------------|
| **Electron** | 150MB+ | 200MB+ | JS/TS | Poor |
| **Tauri** | 3-10MB | 30-50MB | Rust + JS | Good |
| **Flutter** | 20MB | 100MB | Dart | Good |
| **Qt** | 30MB | 50MB | C++ | Excellent |
| **Native (each)** | Smallest | Smallest | Swift/C#/GTK | Best |

### Decision
**Tauri v2**

### Rationale
1. **Rust backend** - Shares code with daemon, single language
2. **Small bundle** - 10MB vs 150MB for Electron
3. **Low memory** - Uses system WebView, not bundled Chromium
4. **Security** - Rust backend, IPC allowlist
5. **v2 features** - Better mobile support, improved APIs
6. **React compatible** - Use familiar frontend stack

### Consequences
- WebView rendering varies by OS (mostly fine for simple UIs)
- Smaller ecosystem than Electron
- Must learn Tauri-specific APIs
- React + Vite, NOT Next.js (incompatible with Tauri)

---

## ADR-005: State Management - Zustand over Redux/Context

### Status
**Accepted**

### Context
Frontend needs to manage:
- Connection state (sharing/connected/disconnected)
- Peer list
- Transfer progress
- Settings

### Options Considered

| Option | Boilerplate | Bundle Size | Learning Curve |
|--------|-------------|-------------|----------------|
| **Redux Toolkit** | Medium | 10KB | Medium |
| **Zustand** | Minimal | 1KB | Low |
| **Jotai** | Minimal | 2KB | Low |
| **React Context** | None | 0KB | None |
| **MobX** | Medium | 15KB | Medium |

### Decision
**Zustand**

### Rationale
1. **Minimal boilerplate** - No actions, reducers, selectors
2. **Tiny bundle** - 1KB gzipped
3. **TypeScript-first** - Excellent type inference
4. **Works outside React** - Can access from Tauri commands
5. **Simple async** - Just use async functions, no middleware

### Consequences
- Less structured than Redux (team discipline needed)
- No Redux DevTools (but Zustand has its own)
- May need to add middleware for complex cases

---

## ADR-006: Chunk Size - 128KB

### Status
**Accepted**

### Context
Files are transferred in chunks. Chunk size affects:
- Memory usage (larger = more RAM per request)
- Latency (smaller = faster first byte)
- Throughput (larger = less overhead)
- Cache efficiency (smaller = finer granularity)

### Options Considered

| Size | Requests for 1GB | Overhead | Memory | Use Case |
|------|------------------|----------|--------|----------|
| 4KB | 262,144 | Very High | Low | Random access |
| 32KB | 32,768 | High | Low | Mixed |
| 64KB | 16,384 | Medium | Medium | Balanced |
| **128KB** | 8,192 | Low | Medium | Streaming |
| 256KB | 4,096 | Very Low | High | Bulk transfer |
| 1MB | 1,024 | Minimal | Very High | Archival |

### Decision
**128KB (131,072 bytes)**

### Rationale
1. **Video editing sweet spot** - Matches common video I/O patterns
2. **Memory reasonable** - 100 chunks in flight = 12.8MB
3. **Low overhead** - 8K requests for 1GB is manageable
4. **Prefetch-friendly** - Can prefetch next chunks easily
5. **Industry standard** - Similar to S3 multipart, GCS

### Consequences
- Small random reads may fetch unnecessary data
- Must implement partial chunk caching for efficiency
- Constant defined in `storage_defs.rs`, not configurable (for now)

---

## ADR-007: Encryption - PAKE (SPAKE2) for Join Codes

### Status
**Accepted**

### Context
Users share access via "join codes" (e.g., `7KJM-XBCD-QRST-VWYZ`). Need to:
- Derive encryption key from code
- Prevent brute-force attacks
- No pre-shared keys or certificates

### Options Considered

| Option | Security | UX | Implementation |
|--------|----------|-----|----------------|
| **Pre-shared key** | Good | Poor (share key manually) | Simple |
| **PKI/Certificates** | Excellent | Poor (certificate management) | Complex |
| **PAKE (SPAKE2)** | Excellent | Good (short code) | Medium |
| **SRP** | Good | Good | Medium |
| **OPAQUE** | Excellent | Good | Complex |

### Decision
**SPAKE2 via `spake2` crate**

### Rationale
1. **Password-authenticated** - Derive key from short, memorable code
2. **No trusted third party** - Pure P2P
3. **Brute-force resistant** - Attacker can't verify guesses offline
4. **Forward secrecy** - Each session has unique key
5. **Simple implementation** - `spake2` crate is well-audited

### Join Code Format
```
7KJM-XBCD-QRST-VWYZ (16 chars, base32, ~80 bits entropy)
```

### Consequences
- Code entropy limits security (16 chars = ~80 bits, sufficient)
- Both sides must enter same code
- Signal server facilitates initial exchange (doesn't see key)

---

## ADR-008: Cache Architecture - Two-Tier (RAM + Disk)

### Status
**Accepted**

### Context
Caching improves performance for:
- Repeated reads (same file section)
- Offline access
- Prefetching

### Options Considered

| Option | Speed | Persistence | Complexity |
|--------|-------|-------------|------------|
| **RAM only** | Fastest | None | Simple |
| **Disk only** | Fast | Yes | Simple |
| **RAM + Disk (L1/L2)** | Fastest | Yes | Medium |
| **Memory-mapped files** | Fast | Yes | Medium |

### Decision
**Two-tier: RAM (L1) + Disk (L2)**

### Architecture
```
Read Request
    ↓
[L1 RAM Cache] ← LRU, 256MB default
    ↓ miss
[L2 Disk Cache] ← ~/.cache/wormhole, LRU eviction
    ↓ miss
[Network Fetch] → Populate both caches
```

### Rationale
1. **Best of both** - Fast hot reads, persistent warm data
2. **Offline support** - Disk cache survives restarts
3. **Memory bounded** - L1 has hard limit, won't OOM
4. **Prefetch target** - Disk cache holds prefetched chunks

### Configuration
```rust
CacheConfig {
    l1_size: 256 * 1024 * 1024,  // 256MB RAM
    l2_path: ~/.cache/wormhole,
    l2_max_size: 10 * 1024 * 1024 * 1024,  // 10GB disk
    chunk_size: 128 * 1024,  // 128KB
}
```

### Consequences
- Disk I/O on L1 miss (use SSD for best performance)
- Cache invalidation complexity when files change
- Need garbage collection for L2

---

## ADR-009: Signal Server - WebSocket over HTTP Polling

### Status
**Accepted**

### Context
Peers need to find each other before direct P2P connection. Signal server:
- Exchanges connection info (IP, port, ICE candidates)
- Facilitates NAT traversal
- Does NOT relay file data

### Options Considered

| Option | Latency | Complexity | Firewall |
|--------|---------|------------|----------|
| **HTTP polling** | High (seconds) | Simple | Good |
| **WebSocket** | Low (ms) | Medium | Good |
| **gRPC streaming** | Low | Medium | Some issues |
| **MQTT** | Low | Medium | Good |

### Decision
**WebSocket via `tokio-tungstenite`**

### Rationale
1. **Low latency** - Instant peer discovery
2. **Bidirectional** - Server can push to clients
3. **Firewall-friendly** - Uses HTTP upgrade, port 443
4. **Simple** - JSON messages, easy to debug
5. **Scalable** - Stateless, can run multiple instances

### Message Types
```json
{"type": "register", "code": "7KJM-XBCD-QRST-VWYZ"}
{"type": "offer", "sdp": "..."}
{"type": "answer", "sdp": "..."}
{"type": "ice", "candidate": "..."}
```

### Consequences
- Need to deploy signal server (can be free tier)
- Single point of initial failure (P2P continues after connect)
- Must handle reconnection logic

---

## ADR-010: Error Handling Strategy - thiserror + anyhow

### Status
**Accepted**

### Context
Rust error handling options for a multi-crate project.

### Decision

| Crate Type | Error Crate | Rationale |
|------------|-------------|-----------|
| **Library (teleport-core)** | `thiserror` | Typed errors, good API |
| **Application (daemon, signal)** | `anyhow` | Flexible, context chaining |
| **FUSE callbacks** | `libc` error codes | Kernel interface requirement |

### Pattern
```rust
// Library error (teleport-core)
#[derive(thiserror::Error, Debug)]
pub enum ProtocolError {
    #[error("invalid message type: {0}")]
    InvalidMessage(u8),
    #[error("path traversal attempt")]
    PathTraversal,
}

// Application error (teleport-daemon)
use anyhow::{Context, Result};
let data = fs::read(&path).context("failed to read config")?;

// FUSE error
fn read(...) {
    match result {
        Ok(data) => reply.data(&data),
        Err(_) => reply.error(libc::EIO),
    }
}
```

### Consequences
- Must convert between error types at crate boundaries
- `anyhow` errors lose type info (can't match on variant)
- FUSE errors are integers (must map manually)

---

## Summary Table

| ADR | Decision | Key Reason |
|-----|----------|------------|
| 001 | QUIC (quinn) | Multiplexed streams, built-in TLS |
| 002 | bincode | Fastest, smallest, Rust-native |
| 003 | FUSE (fuser) | Pure Rust, async-friendly |
| 004 | Tauri v2 | Small bundle, Rust backend |
| 005 | Zustand | Minimal boilerplate, tiny |
| 006 | 128KB chunks | Video editing sweet spot |
| 007 | SPAKE2 | Password-authenticated key exchange |
| 008 | RAM + Disk cache | Fast + persistent |
| 009 | WebSocket | Low latency signaling |
| 010 | thiserror + anyhow | Library vs app error handling |

---

## Future ADRs (To Be Written)

- ADR-011: Conflict Resolution Strategy
- ADR-012: File Locking Protocol
- ADR-013: Versioning and Migration
- ADR-014: Telemetry and Analytics (if any)
