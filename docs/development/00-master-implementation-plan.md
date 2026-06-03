# Wormhole - Master Implementation Plan

## Document Purpose

This is the **authoritative implementation guide** for building Project Wormhole from start to finish. It consolidates all phase documentation, addresses identified gaps, provides solutions to blocking issues, and establishes a clear execution path.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Prerequisites & Environment Setup](#2-prerequisites--environment-setup)
3. [Complete Dependency Matrix](#3-complete-dependency-matrix)
4. [Phase Execution Order](#4-phase-execution-order)
5. [Top Features & Roadmap](#5-top-features--roadmap)
6. [Blocking Issues & Solutions](#6-blocking-issues--solutions)
7. [Configuration System](#7-configuration-system)
8. [Error Handling Strategy](#8-error-handling-strategy)
9. [Testing Strategy](#9-testing-strategy)
10. [Security Implementation](#10-security-implementation)
11. [CI/CD Pipeline](#11-ci-cd-pipeline)
12. [Platform-Specific Requirements](#12-platform-specific-requirements)
13. [Migration & Upgrade Path](#13-migration--upgrade-path)
14. [Production Checklist](#14-production-checklist)

---

## 1. Project Overview

### What is Wormhole?

A cross-platform, peer-to-peer networked filesystem that allows users to:
- **Host**: Share a folder over the network with a simple join code
- **Mount**: Access remote folders as if they were local drives
- **Sync**: Bi-directional file synchronization with conflict resolution

### Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              WORMHOLE STACK                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  UI Layer        │  Tauri + React + Tailwind                                │
│  Desktop App     │  System tray, native dialogs, cross-platform             │
├─────────────────────────────────────────────────────────────────────────────┤
│  Service Layer   │  teleport-daemon (Rust library)                          │
│                  │  Host service, mount service, sync engine                │
├─────────────────────────────────────────────────────────────────────────────┤
│  Network Layer   │  QUIC (quinn) + TLS 1.3                                  │
│                  │  NAT traversal, hole punching, PAKE                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  Filesystem      │  FUSE (fuser) + VFS                                      │
│                  │  Inode management, read/write operations                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  Cache Layer     │  L1 RAM (LRU) + L2 Disk (persistent)                     │
│                  │  Chunked storage, prefetch, garbage collection           │
├─────────────────────────────────────────────────────────────────────────────┤
│  Protocol        │  NetMessage (bincode serialization)                      │
│                  │  Request/response, streaming, locking                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Crate Structure

```
wormhole/
├── Cargo.toml                      # Workspace root
├── crates/
│   ├── teleport-core/              # Shared types, protocol, crypto
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── protocol.rs         # NetMessage enum
│   │       ├── types.rs            # DirEntry, ChunkId, LockToken
│   │       └── crypto.rs           # PAKE, certificates
│   │
│   ├── teleport-daemon/            # Core daemon logic
│   │   └── src/
│   │       ├── lib.rs              # Library exports
│   │       ├── bin/
│   │       │   └── teleport_cli.rs # CLI binary
│   │       ├── host.rs             # Host server
│   │       ├── host_write.rs       # Write operations + locking
│   │       ├── client.rs           # Client connection
│   │       ├── client_actor.rs     # Async/sync bridge
│   │       ├── scanner.rs          # Directory walker
│   │       ├── vfs.rs              # Virtual filesystem
│   │       ├── fs.rs               # FUSE implementation
│   │       ├── cache.rs            # Hybrid cache (RAM + disk)
│   │       ├── disk_cache.rs       # Persistent storage
│   │       ├── governor.rs         # Prefetch logic
│   │       ├── gc.rs               # Garbage collection
│   │       ├── sync_engine.rs      # Write sync queue
│   │       ├── config.rs           # Configuration management
│   │       └── net/
│   │           ├── mod.rs
│   │           ├── rendezvous.rs   # NAT traversal
│   │           ├── stun.rs         # STUN client
│   │           └── quinn_config.rs # QUIC configuration
│   │
│   └── teleport-signal/            # Signaling server
│       └── src/
│           ├── main.rs
│           ├── rooms.rs            # Room management
│           └── db.rs               # Persistence (SQLite)
│
└── apps/
    └── desktop/                # Tauri desktop app
        ├── package.json
        ├── src/                    # React frontend
        └── src-tauri/              # Rust backend
```

---

## 2. Prerequisites & Environment Setup

### Required Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Rust | 1.75+ | Core language |
| Node.js | 20 LTS | Frontend tooling |
| pnpm | 8+ | Package manager (faster than npm) |
| Git | 2.40+ | Version control |

### Platform-Specific Requirements

#### macOS
```bash
# Install Xcode command line tools
xcode-select --install

# Install macFUSE (required for FUSE)
brew install --cask macfuse

# After installation, allow kernel extension in System Preferences > Security
# Reboot required

# Verify installation
ls /Library/Filesystems/macfuse.fs
```

#### Linux (Ubuntu/Debian)
```bash
# Install FUSE3 and build dependencies
sudo apt-get update
sudo apt-get install -y \
    build-essential \
    pkg-config \
    libfuse3-dev \
    libssl-dev \
    libgtk-3-dev \
    libwebkit2gtk-4.1-dev \
    librsvg2-dev

# Verify FUSE
fusermount3 --version
```

#### Linux (Fedora/RHEL)
```bash
sudo dnf install -y \
    fuse3-devel \
    openssl-devel \
    gtk3-devel \
    webkit2gtk4.1-devel \
    librsvg2-devel
```

#### Windows
```powershell
# Install WinFsp (Windows FUSE equivalent)
# Download from: https://winfsp.dev/rel/
winget install WinFsp.WinFsp

# Install WebView2 runtime (usually pre-installed on Windows 11)
# Download from: https://developer.microsoft.com/en-us/microsoft-edge/webview2/

# Verify
winfsp-tests-x64.exe
```

### Rust Setup
```bash
# Install Rust via rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add targets for cross-compilation (optional)
rustup target add x86_64-pc-windows-msvc
rustup target add x86_64-apple-darwin
rustup target add aarch64-apple-darwin
rustup target add x86_64-unknown-linux-gnu

# Install cargo tools
cargo install cargo-watch   # Auto-rebuild on changes
cargo install cargo-nextest # Better test runner
cargo install cargo-audit   # Security audit
```

### Node.js Setup
```bash
# Install pnpm
npm install -g pnpm

# Verify
pnpm --version
```

---

## 3. Complete Dependency Matrix

### Workspace Cargo.toml

```toml
[workspace]
resolver = "2"
members = [
    "crates/teleport-core",
    "crates/teleport-daemon",
    "crates/teleport-signal",
]

[workspace.package]
version = "0.1.0"
edition = "2021"
license = "MIT OR Apache-2.0"
repository = "https://github.com/yourorg/wormhole"
rust-version = "1.75"

[workspace.dependencies]
# Async Runtime
tokio = { version = "1.35.1", features = ["full"] }
tokio-util = { version = "0.7.10", features = ["rt"] }
futures = "0.3.30"

# Networking
quinn = "0.11.1"
rustls = { version = "0.22.2", default-features = false, features = ["ring", "std"] }
rcgen = "0.12.1"
webpki-roots = "0.26.1"

# Serialization
serde = { version = "1.0.196", features = ["derive"] }
serde_json = "1.0.113"
bincode = "1.3.3"
toml = "0.8.10"

# Filesystem
fuser = "0.14.0"
walkdir = "2.4.0"
notify = "6.1.1"

# Caching
lru = "0.12.2"
directories = "5.0.1"
fs2 = "0.4.3"

# Cryptography
sha2 = "0.10.8"
blake3 = "1.5.0"
hex = "0.4.3"
spake2 = "0.4.0"
rand = "0.8.5"
base32 = "0.4.0"
uuid = { version = "1.7.0", features = ["v4"] }

# Web Server (Signal)
axum = { version = "0.7.4", features = ["ws"] }
tokio-tungstenite = "0.21.0"
tower = "0.4.13"
tower-http = { version = "0.5.1", features = ["cors", "trace"] }

# Database (Signal)
sqlx = { version = "0.7.3", features = ["runtime-tokio", "sqlite"] }

# Error Handling
anyhow = "1.0.79"
thiserror = "1.0.56"

# Logging
tracing = "0.1.40"
tracing-subscriber = { version = "0.3.18", features = ["env-filter", "json"] }

# CLI
clap = { version = "4.4.18", features = ["derive"] }

# Platform
libc = "0.2.153"

# Testing
mockall = "0.12.1"
tempfile = "3.10.0"
proptest = "1.4.0"
```

### teleport-core/Cargo.toml

```toml
[package]
name = "teleport-core"
version.workspace = true
edition.workspace = true

[dependencies]
serde.workspace = true
bincode.workspace = true
thiserror.workspace = true
spake2.workspace = true
rand.workspace = true
base32.workspace = true
rcgen.workspace = true
rustls.workspace = true
sha2.workspace = true
hex.workspace = true
```

### teleport-daemon/Cargo.toml

```toml
[package]
name = "teleport-daemon"
version.workspace = true
edition.workspace = true

[lib]
name = "teleport_daemon"
path = "src/lib.rs"

[[bin]]
name = "teleport"
path = "src/bin/teleport_cli.rs"

[dependencies]
teleport-core = { path = "../teleport-core" }

# Async
tokio.workspace = true
tokio-util.workspace = true
futures.workspace = true

# Network
quinn.workspace = true
rustls.workspace = true
tokio-tungstenite.workspace = true

# Serialization
serde.workspace = true
serde_json.workspace = true
bincode.workspace = true
toml.workspace = true

# Filesystem
fuser.workspace = true
walkdir.workspace = true

# Caching
lru.workspace = true
directories.workspace = true
fs2.workspace = true
sha2.workspace = true
blake3.workspace = true
hex.workspace = true

# Crypto
spake2.workspace = true
rand.workspace = true
uuid.workspace = true

# Error handling
anyhow.workspace = true
thiserror.workspace = true

# Logging
tracing.workspace = true
tracing-subscriber.workspace = true

# CLI
clap.workspace = true

# Platform
libc.workspace = true

[dev-dependencies]
tempfile.workspace = true
mockall.workspace = true
proptest.workspace = true
```

### teleport-signal/Cargo.toml

```toml
[package]
name = "teleport-signal"
version.workspace = true
edition.workspace = true

[dependencies]
teleport-core = { path = "../teleport-core" }

tokio.workspace = true
axum.workspace = true
tower.workspace = true
tower-http.workspace = true
tokio-tungstenite.workspace = true
sqlx.workspace = true

serde.workspace = true
serde_json.workspace = true

uuid.workspace = true
rand.workspace = true

anyhow.workspace = true
thiserror.workspace = true
tracing.workspace = true
tracing-subscriber.workspace = true
```

### apps/desktop/package.json

```json
{
  "name": "desktop",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "lint": "eslint src --ext ts,tsx --fix",
    "format": "prettier --write src",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@tauri-apps/api": "2.0.0",
    "@tauri-apps/plugin-dialog": "2.0.0",
    "@tauri-apps/plugin-shell": "2.0.0",
    "@tauri-apps/plugin-os": "2.0.0",
    "@tauri-apps/plugin-clipboard-manager": "2.0.0",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "zustand": "4.5.0",
    "lucide-react": "0.400.0",
    "clsx": "2.1.0",
    "tailwind-merge": "2.3.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "2.0.0",
    "@types/react": "18.3.3",
    "@types/react-dom": "18.3.0",
    "@typescript-eslint/eslint-plugin": "7.0.0",
    "@typescript-eslint/parser": "7.0.0",
    "@vitejs/plugin-react": "4.3.0",
    "autoprefixer": "10.4.19",
    "eslint": "8.57.0",
    "eslint-plugin-react-hooks": "4.6.0",
    "postcss": "8.4.38",
    "prettier": "3.2.5",
    "tailwindcss": "3.4.4",
    "typescript": "5.4.5",
    "vite": "5.3.1"
  }
}
```

---

## 4. Phase Execution Order

### Recommended Build Order

```
Phase 1 ─────► Phase 2 ─────► Phase 3 ─────► Phase 4
   │              │              │              │
   │              │              │              │
   ▼              ▼              ▼              ▼
┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
│Metadata │  │  Read   │  │ Cache + │  │  Disk   │
│ + Mount │  │  Data   │  │Prefetch │  │ Persist │
│  (ls)   │  │ (cat)   │  │ (video) │  │(offline)│
└─────────┘  └─────────┘  └─────────┘  └─────────┘
                                            │
                    ┌───────────────────────┘
                    │
                    ▼
              Phase 5 ─────► Phase 6 ─────► Phase 7 ─────► Phase 8
                 │              │              │              │
                 ▼              ▼              ▼              ▼
           ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
           │   GUI   │  │   NAT   │  │  Write  │  │ Hi-Perf │
           │ + Tray  │  │ + Codes │  │ + Lock  │  │Transfer │
           └─────────┘  └─────────┘  └─────────┘  └─────────┘
```

### Phase Dependencies

| Phase | Depends On | Outputs |
|-------|------------|---------|
| 1 | None | FUSE mount, metadata fetch |
| 2 | Phase 1 | File reads working |
| 3 | Phase 2 | Cached reads, prefetch |
| 4 | Phase 3 | Persistent cache, offline |
| 5 | Phase 4 | Desktop app, installer |
| 6 | Phase 5 | Global connectivity |
| 7 | Phase 6 | Write support, sync |
| 8 | Phase 7 | Max throughput, zero-copy, dedup |

### Milestone Checkpoints

**M1 - Proof of Concept (Phase 1-2)**
- [ ] Can mount remote folder
- [ ] Can ls and cat files
- [ ] Works on LAN

**M2 - Usable Alpha (Phase 3-4)**
- [ ] Video playback works
- [ ] Survives app restart
- [ ] Offline file access

**M3 - Beta Release (Phase 5-6)**
- [ ] Desktop app with tray
- [ ] Works across internet
- [ ] Join codes functional

**M4 - Production (Phase 7)**
- [ ] Write support with real-time collaboration
- [ ] Distributed locking and conflict resolution
- [ ] Incremental syncing and content-aware transfers
- [ ] Pipeline integration APIs

**M5 - High Performance (Phase 8)**
- [ ] >500 MB/s on 10GbE LAN
- [ ] >90% WAN efficiency
- [ ] Zero-copy I/O verified
- [ ] Content-addressed deduplication

**M6 - Creative Collaboration (Phase 7-8)**
- [ ] Incremental syncing (90% faster iterations)
- [ ] Real-time collaboration with distributed locking
- [ ] Smart UX (QR codes, drag-drop discovery)
- [ ] Pipeline integrations (Unreal, Blender, Unity)

---

## 5. Top Features & Roadmap

### Research Summary
Comprehensive analysis of 10 proposed features identified **4 high-priority features** that should be implemented as top differentiators for Wormhole. See [Feature Research & Analysis](docs/development/feature-research-analysis.md) for detailed evaluation.

### Top 4 Priority Features

#### 1. Incremental & Content-Aware Syncing (Phase 7)
**Goal:** 90% reduction in transfer time for iterative creative workflows
- Change detection using filesystem watching
- Content hashing to skip unchanged chunks
- Delta compression for large files with small changes
- Smart prefetching for likely-needed assets

#### 2. Real-Time Collaboration (Phase 7)
**Goal:** Enable true collaborative workflows without cloud costs
- Distributed locking system with TTL-based expiry
- Conflict resolution strategies (automatic merge, manual review)
- Live sync indicators in UI
- Per-file or per-chunk locking granularity

#### 3. Smart UX / On-boarding Touches (Phase 5-6)
**Goal:** Remove adoption friction that kills P2P tool usage
- QR code join codes for easy mobile sharing
- LAN auto-discovery ("same network" peers)
- Progressive mount experience with real-time progress
- Paste-aware inputs and smart defaults

#### 4. Pipeline Integration (Phase 7+)
**Goal:** Direct replacement for expensive creative tools
- Unreal Engine virtual filesystem integration
- Build pipeline hooks and automation
- Live watch APIs for external tools
- Plugin system for custom integrations

### Implementation Priorities

| Priority | Feature | Impact | Effort | Timeline |
|----------|---------|--------|--------|----------|
| **P0** | Real-Time Collaboration | Very High | Medium-High | Phase 7 |
| **P0** | Incremental Syncing | Very High | Medium | Phase 7 |
| **P1** | Smart UX Touches | High | Low-Medium | Phase 5-6 |
| **P1** | Pipeline Integration | High | Medium-High | Phase 7+ |

### Features to Avoid
- **Edge/Cloud Hybrid Mode:** Dilutes core "no cloud dependency" value proposition
- **Enterprise Security Features:** Target audience prioritizes creative workflow over enterprise compliance

---

## 6. Blocking Issues & Solutions

### P0 - Project Cannot Start

#### Issue 1: Library exports undefined
**Problem**: Phase 5 references `teleport-daemon` as library but no `pub mod` list.

**Solution**: Define explicit public API in `lib.rs`:

```rust
// crates/teleport-daemon/src/lib.rs

//! Wormhole daemon library for embedding in applications.

// Re-export core types
pub use teleport_core::{DirEntry, NetMessage, ChunkId, LockToken};

// Public modules
pub mod config;

// Internal modules (not exposed)
mod cache;
mod client;
mod client_actor;
mod disk_cache;
mod fs;
mod gc;
mod governor;
mod host;
mod host_write;
mod scanner;
mod sync_engine;
mod vfs;

pub mod net {
    pub mod rendezvous;
    pub mod stun;
    pub mod quinn_config;
}

// Public API
use std::net::SocketAddr;
use std::path::PathBuf;
use tokio::sync::broadcast;

/// Events emitted by services
#[derive(Clone, Debug, serde::Serialize)]
#[serde(tag = "type", content = "data")]
pub enum ServiceEvent {
    HostStarted { port: u16, share_path: PathBuf },
    WaitingForPeer { code: String },
    PeerConnected { peer_addr: String },
    ClientConnected { peer_addr: String },
    MountReady { mountpoint: PathBuf },
    SyncProgress { file: String, percent: u8 },
    ChunkSynced { path: String, chunk_index: u64 },
    SyncComplete,
    LockAcquired { path: String },
    LockDenied { path: String, holder: String },
    Error { message: String },
}

/// Handle for graceful shutdown
#[derive(Clone)]
pub struct ShutdownHandle {
    token: tokio_util::sync::CancellationToken,
}

impl ShutdownHandle {
    pub fn new() -> Self {
        Self {
            token: tokio_util::sync::CancellationToken::new(),
        }
    }

    pub fn shutdown(&self) {
        self.token.cancel();
    }

    pub fn token(&self) -> tokio_util::sync::CancellationToken {
        self.token.clone()
    }

    pub fn is_cancelled(&self) -> bool {
        self.token.is_cancelled()
    }
}

impl Default for ShutdownHandle {
    fn default() -> Self {
        Self::new()
    }
}

/// Start hosting a directory (LAN mode)
pub async fn start_host_service(
    share_path: PathBuf,
    port: u16,
) -> anyhow::Result<(broadcast::Receiver<ServiceEvent>, ShutdownHandle)> {
    host::start_host_service(share_path, port).await
}

/// Start hosting with join code (global mode)
pub async fn start_host_global(
    share_path: PathBuf,
    port: u16,
) -> anyhow::Result<(String, broadcast::Receiver<ServiceEvent>, ShutdownHandle)> {
    net::rendezvous::start_host_global(share_path, port).await
}

/// Mount a remote share (LAN mode)
pub async fn start_mount_service(
    host_addr: SocketAddr,
    mountpoint: PathBuf,
) -> anyhow::Result<(broadcast::Receiver<ServiceEvent>, ShutdownHandle)> {
    client::start_mount_service(host_addr, mountpoint).await
}

/// Mount using join code (global mode)
pub async fn start_mount_global(
    code: String,
    mountpoint: PathBuf,
) -> anyhow::Result<(broadcast::Receiver<ServiceEvent>, ShutdownHandle)> {
    net::rendezvous::start_mount_global(code, mountpoint).await
}

/// Get current configuration
pub fn get_config() -> config::Config {
    config::Config::load().unwrap_or_default()
}

/// Update configuration
pub fn set_config(config: config::Config) -> anyhow::Result<()> {
    config.save()
}
```

#### Issue 2: Icon assets missing
**Problem**: Tauri requires icons but none provided.

**Solution**: Create icon generation script:

```bash
#!/bin/bash
# scripts/generate-icons.sh

# Requires: ImageMagick (brew install imagemagick)

SOURCE="assets/icon-source.png"  # 1024x1024 source image
OUT_DIR="apps/desktop/src-tauri/icons"

mkdir -p "$OUT_DIR"

# PNG sizes for all platforms
convert "$SOURCE" -resize 32x32 "$OUT_DIR/32x32.png"
convert "$SOURCE" -resize 128x128 "$OUT_DIR/128x128.png"
convert "$SOURCE" -resize 256x256 "$OUT_DIR/128x128@2x.png"

# macOS .icns
mkdir -p "$OUT_DIR/icon.iconset"
convert "$SOURCE" -resize 16x16 "$OUT_DIR/icon.iconset/icon_16x16.png"
convert "$SOURCE" -resize 32x32 "$OUT_DIR/icon.iconset/icon_16x16@2x.png"
convert "$SOURCE" -resize 32x32 "$OUT_DIR/icon.iconset/icon_32x32.png"
convert "$SOURCE" -resize 64x64 "$OUT_DIR/icon.iconset/icon_32x32@2x.png"
convert "$SOURCE" -resize 128x128 "$OUT_DIR/icon.iconset/icon_128x128.png"
convert "$SOURCE" -resize 256x256 "$OUT_DIR/icon.iconset/icon_128x128@2x.png"
convert "$SOURCE" -resize 256x256 "$OUT_DIR/icon.iconset/icon_256x256.png"
convert "$SOURCE" -resize 512x512 "$OUT_DIR/icon.iconset/icon_256x256@2x.png"
convert "$SOURCE" -resize 512x512 "$OUT_DIR/icon.iconset/icon_512x512.png"
convert "$SOURCE" -resize 1024x1024 "$OUT_DIR/icon.iconset/icon_512x512@2x.png"
iconutil -c icns "$OUT_DIR/icon.iconset" -o "$OUT_DIR/icon.icns"
rm -rf "$OUT_DIR/icon.iconset"

# Windows .ico
convert "$SOURCE" -define icon:auto-resize=256,128,64,48,32,16 "$OUT_DIR/icon.ico"

# Tray icon (monochrome template for macOS)
convert "$SOURCE" -resize 22x22 -colorspace Gray "$OUT_DIR/icon.png"

echo "Icons generated in $OUT_DIR"
```

#### Issue 3: Signal server has no persistence
**Problem**: Codes lost on restart.

**Solution**: Add SQLite persistence:

```rust
// crates/teleport-signal/src/db.rs

use sqlx::{sqlite::SqlitePool, Row};
use std::time::{SystemTime, UNIX_EPOCH};

pub struct Database {
    pool: SqlitePool,
}

impl Database {
    pub async fn new(path: &str) -> anyhow::Result<Self> {
        let pool = SqlitePool::connect(&format!("sqlite:{}?mode=rwc", path)).await?;

        // Create tables
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS rooms (
                code TEXT PRIMARY KEY,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                host_peer_id TEXT,
                host_public_addr TEXT,
                host_local_addrs TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_rooms_expires ON rooms(expires_at);
            "#,
        )
        .execute(&pool)
        .await?;

        Ok(Self { pool })
    }

    pub async fn create_room(&self, code: &str, ttl_secs: u64) -> anyhow::Result<()> {
        let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
        let expires = now + ttl_secs;

        sqlx::query("INSERT INTO rooms (code, created_at, expires_at) VALUES (?, ?, ?)")
            .bind(code)
            .bind(now as i64)
            .bind(expires as i64)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    pub async fn get_room(&self, code: &str) -> anyhow::Result<Option<RoomInfo>> {
        let row = sqlx::query("SELECT * FROM rooms WHERE code = ? AND expires_at > ?")
            .bind(code)
            .bind(SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as i64)
            .fetch_optional(&self.pool)
            .await?;

        Ok(row.map(|r| RoomInfo {
            code: r.get("code"),
            host_peer_id: r.get("host_peer_id"),
            host_public_addr: r.get("host_public_addr"),
        }))
    }

    pub async fn cleanup_expired(&self) -> anyhow::Result<u64> {
        let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
        let result = sqlx::query("DELETE FROM rooms WHERE expires_at < ?")
            .bind(now as i64)
            .execute(&self.pool)
            .await?;

        Ok(result.rows_affected())
    }
}

#[derive(Debug)]
pub struct RoomInfo {
    pub code: String,
    pub host_peer_id: Option<String>,
    pub host_public_addr: Option<String>,
}
```

#### Issue 4: STUN not implemented
**Problem**: Public IP detection is a stub.

**Solution**: Use proper STUN library:

```rust
// crates/teleport-daemon/src/net/stun.rs

use std::net::SocketAddr;
use tokio::net::UdpSocket;

const STUN_SERVERS: &[&str] = &[
    "stun.l.google.com:19302",
    "stun1.l.google.com:19302",
    "stun.cloudflare.com:3478",
];

/// STUN binding request (RFC 5389)
const STUN_BINDING_REQUEST: u16 = 0x0001;
const STUN_MAGIC_COOKIE: u32 = 0x2112A442;

pub async fn get_public_address() -> anyhow::Result<SocketAddr> {
    let socket = UdpSocket::bind("0.0.0.0:0").await?;

    for server in STUN_SERVERS {
        match query_stun_server(&socket, server).await {
            Ok(addr) => return Ok(addr),
            Err(e) => {
                tracing::warn!("STUN server {} failed: {}", server, e);
                continue;
            }
        }
    }

    anyhow::bail!("All STUN servers failed")
}

async fn query_stun_server(socket: &UdpSocket, server: &str) -> anyhow::Result<SocketAddr> {
    use tokio::time::{timeout, Duration};

    // Build STUN binding request
    let mut request = [0u8; 20];
    request[0..2].copy_from_slice(&STUN_BINDING_REQUEST.to_be_bytes());
    request[2..4].copy_from_slice(&0u16.to_be_bytes()); // Message length
    request[4..8].copy_from_slice(&STUN_MAGIC_COOKIE.to_be_bytes());

    // Transaction ID (12 random bytes)
    let mut transaction_id = [0u8; 12];
    getrandom::getrandom(&mut transaction_id)?;
    request[8..20].copy_from_slice(&transaction_id);

    // Resolve and send
    let server_addr: SocketAddr = tokio::net::lookup_host(server)
        .await?
        .next()
        .ok_or_else(|| anyhow::anyhow!("DNS lookup failed"))?;

    socket.send_to(&request, server_addr).await?;

    // Wait for response
    let mut response = [0u8; 256];
    let (len, _) = timeout(Duration::from_secs(3), socket.recv_from(&mut response)).await??;

    // Parse STUN response
    parse_stun_response(&response[..len], &transaction_id)
}

fn parse_stun_response(data: &[u8], expected_txn: &[u8; 12]) -> anyhow::Result<SocketAddr> {
    if data.len() < 20 {
        anyhow::bail!("Response too short");
    }

    // Verify transaction ID
    if &data[8..20] != expected_txn {
        anyhow::bail!("Transaction ID mismatch");
    }

    // Parse attributes
    let msg_len = u16::from_be_bytes([data[2], data[3]]) as usize;
    let mut offset = 20;

    while offset + 4 <= 20 + msg_len {
        let attr_type = u16::from_be_bytes([data[offset], data[offset + 1]]);
        let attr_len = u16::from_be_bytes([data[offset + 2], data[offset + 3]]) as usize;
        offset += 4;

        // XOR-MAPPED-ADDRESS (0x0020)
        if attr_type == 0x0020 && attr_len >= 8 {
            let family = data[offset + 1];
            let xor_port = u16::from_be_bytes([data[offset + 2], data[offset + 3]]);
            let port = xor_port ^ (STUN_MAGIC_COOKIE >> 16) as u16;

            if family == 0x01 {
                // IPv4
                let xor_ip = u32::from_be_bytes([
                    data[offset + 4],
                    data[offset + 5],
                    data[offset + 6],
                    data[offset + 7],
                ]);
                let ip = xor_ip ^ STUN_MAGIC_COOKIE;
                let addr = std::net::Ipv4Addr::from(ip);
                return Ok(SocketAddr::new(addr.into(), port));
            }
        }

        // Padding to 4-byte boundary
        offset += (attr_len + 3) & !3;
    }

    anyhow::bail!("No XOR-MAPPED-ADDRESS in response")
}
```

### P1 - Phases Cannot Complete

#### Issue 5: Path traversal not specified
**Solution**: Add comprehensive path sanitization:

```rust
// crates/teleport-daemon/src/host.rs

use std::path::{Path, PathBuf};

/// Safely resolve a relative path within a root directory
/// Returns None if path would escape the root
pub fn safe_path(root: &Path, relative: &str) -> Option<PathBuf> {
    // Reject obvious traversal attempts
    if relative.contains("..") {
        return None;
    }

    // Reject absolute paths
    if relative.starts_with('/') || relative.starts_with('\\') {
        return None;
    }

    // Reject paths with null bytes
    if relative.contains('\0') {
        return None;
    }

    // Build full path
    let full = root.join(relative);

    // Canonicalize both paths
    let canonical_root = root.canonicalize().ok()?;
    let canonical_full = full.canonicalize().ok()?;

    // Verify the resolved path is within root
    if canonical_full.starts_with(&canonical_root) {
        Some(canonical_full)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_safe_path_normal() {
        let root = tempdir().unwrap();
        std::fs::create_dir_all(root.path().join("subdir")).unwrap();
        std::fs::write(root.path().join("subdir/file.txt"), "test").unwrap();

        let result = safe_path(root.path(), "subdir/file.txt");
        assert!(result.is_some());
    }

    #[test]
    fn test_safe_path_traversal() {
        let root = tempdir().unwrap();
        assert!(safe_path(root.path(), "../etc/passwd").is_none());
        assert!(safe_path(root.path(), "subdir/../../etc/passwd").is_none());
    }

    #[test]
    fn test_safe_path_absolute() {
        let root = tempdir().unwrap();
        assert!(safe_path(root.path(), "/etc/passwd").is_none());
    }
}
```

#### Issue 6: Disk cache atomicity
**Solution**: Add recovery logic:

```rust
// crates/teleport-daemon/src/disk_cache.rs

impl DiskCache {
    /// Clean up orphaned .tmp files on startup
    pub fn cleanup_orphans(&self) -> anyhow::Result<usize> {
        let mut cleaned = 0;

        for entry in walkdir::WalkDir::new(&self.cache_dir)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if path.extension().map(|e| e == "tmp").unwrap_or(false) {
                // Check if file is old (> 5 minutes)
                if let Ok(metadata) = path.metadata() {
                    if let Ok(modified) = metadata.modified() {
                        if modified.elapsed().map(|d| d.as_secs() > 300).unwrap_or(true) {
                            if std::fs::remove_file(path).is_ok() {
                                cleaned += 1;
                                tracing::debug!("Cleaned orphan: {:?}", path);
                            }
                        }
                    }
                }
            }
        }

        Ok(cleaned)
    }

    /// Atomic write with retry logic
    pub async fn write_atomic(&self, chunk_id: ChunkId, data: &[u8]) -> anyhow::Result<()> {
        let target_path = self.chunk_path(&chunk_id);

        // Ensure parent directories exist
        if let Some(parent) = target_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        // Use unique temp file name to avoid collisions
        let temp_path = target_path.with_extension(format!(
            "tmp.{}",
            std::process::id()
        ));

        // Write to temp file
        let mut file = tokio::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&temp_path)
            .await?;

        tokio::io::AsyncWriteExt::write_all(&mut file, data).await?;
        file.sync_all().await?;
        drop(file);

        // Atomic rename (may fail on Windows if target exists)
        #[cfg(unix)]
        {
            tokio::fs::rename(&temp_path, &target_path).await?;
        }

        #[cfg(windows)]
        {
            // Windows requires removing target first
            let _ = tokio::fs::remove_file(&target_path).await;
            tokio::fs::rename(&temp_path, &target_path).await?;
        }

        Ok(())
    }
}
```

---

## 6. Configuration System

### Config File Format

```rust
// crates/teleport-daemon/src/config.rs

use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    // Network
    pub default_port: u16,
    pub signal_server: String,
    pub stun_servers: Vec<String>,

    // Cache
    pub cache_dir: Option<PathBuf>,
    pub ram_cache_chunks: usize,
    pub disk_cache_max_gb: u64,

    // Performance
    pub chunk_size_kb: usize,
    pub prefetch_window: usize,
    pub max_concurrent_prefetch: usize,

    // Locking
    pub lock_ttl_secs: u64,
    pub lock_renewal_secs: u64,

    // Logging
    pub log_level: String,
    pub log_file: Option<PathBuf>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            default_port: 5000,
            signal_server: "wss://signal.wormhole.app/ws".to_string(),
            stun_servers: vec![
                "stun.l.google.com:19302".to_string(),
                "stun.cloudflare.com:3478".to_string(),
            ],

            cache_dir: None, // Use platform default
            ram_cache_chunks: 4000,      // ~500MB
            disk_cache_max_gb: 10,

            chunk_size_kb: 128,
            prefetch_window: 5,
            max_concurrent_prefetch: 4,

            lock_ttl_secs: 60,
            lock_renewal_secs: 30,

            log_level: "info".to_string(),
            log_file: None,
        }
    }
}

impl Config {
    pub fn config_dir() -> Option<PathBuf> {
        ProjectDirs::from("", "", "wormhole").map(|d| d.config_dir().to_path_buf())
    }

    pub fn config_path() -> Option<PathBuf> {
        Self::config_dir().map(|d| d.join("config.toml"))
    }

    pub fn cache_dir(&self) -> PathBuf {
        self.cache_dir.clone().unwrap_or_else(|| {
            ProjectDirs::from("", "", "wormhole")
                .map(|d| d.cache_dir().to_path_buf())
                .unwrap_or_else(|| PathBuf::from(".wormhole-cache"))
        })
    }

    pub fn load() -> anyhow::Result<Self> {
        let path = Self::config_path().ok_or_else(|| anyhow::anyhow!("No config directory"))?;

        if path.exists() {
            let content = std::fs::read_to_string(&path)?;
            Ok(toml::from_str(&content)?)
        } else {
            Ok(Self::default())
        }
    }

    pub fn save(&self) -> anyhow::Result<()> {
        let path = Self::config_path().ok_or_else(|| anyhow::anyhow!("No config directory"))?;

        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let content = toml::to_string_pretty(self)?;
        std::fs::write(&path, content)?;

        Ok(())
    }
}
```

### Environment Variable Overrides

```rust
impl Config {
    pub fn from_env() -> Self {
        let mut config = Self::load().unwrap_or_default();

        if let Ok(port) = std::env::var("WORMHOLE_PORT") {
            if let Ok(p) = port.parse() {
                config.default_port = p;
            }
        }

        if let Ok(signal) = std::env::var("WORMHOLE_SIGNAL_SERVER") {
            config.signal_server = signal;
        }

        if let Ok(cache) = std::env::var("WORMHOLE_CACHE_DIR") {
            config.cache_dir = Some(PathBuf::from(cache));
        }

        if let Ok(level) = std::env::var("WORMHOLE_LOG_LEVEL") {
            config.log_level = level;
        }

        config
    }
}
```

---

## 7. Error Handling Strategy

### Error Types

```rust
// crates/teleport-core/src/error.rs

use thiserror::Error;

#[derive(Error, Debug)]
pub enum WormholeError {
    // Network errors
    #[error("Connection failed: {0}")]
    ConnectionFailed(String),

    #[error("Connection timeout after {0}ms")]
    Timeout(u64),

    #[error("Peer disconnected")]
    PeerDisconnected,

    // Filesystem errors
    #[error("Path not found: {0}")]
    PathNotFound(String),

    #[error("Path traversal attempt blocked")]
    PathTraversal,

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    // Cache errors
    #[error("Cache corrupted: {0}")]
    CacheCorrupted(String),

    #[error("Cache full")]
    CacheFull,

    // Lock errors
    #[error("Lock held by {holder}")]
    LockHeld { holder: String },

    #[error("Lock expired")]
    LockExpired,

    #[error("Invalid lock token")]
    InvalidLockToken,

    // Protocol errors
    #[error("Protocol version mismatch: expected {expected}, got {got}")]
    VersionMismatch { expected: u32, got: u32 },

    #[error("Malformed message")]
    MalformedMessage,

    // NAT/connectivity
    #[error("NAT traversal failed: {0}")]
    NatTraversalFailed(String),

    #[error("PAKE authentication failed")]
    PakeAuthFailed,

    // Configuration
    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),
}

// Map to FUSE errno
impl WormholeError {
    pub fn to_errno(&self) -> i32 {
        match self {
            Self::PathNotFound(_) => libc::ENOENT,
            Self::PathTraversal => libc::EACCES,
            Self::PermissionDenied(_) => libc::EACCES,
            Self::Io(e) => e.raw_os_error().unwrap_or(libc::EIO),
            Self::LockHeld { .. } => libc::EAGAIN,
            Self::Timeout(_) => libc::ETIMEDOUT,
            _ => libc::EIO,
        }
    }
}
```

### Error Recovery Patterns

```rust
// Retry with exponential backoff
pub async fn with_retry<T, F, Fut>(
    mut f: F,
    max_attempts: u32,
    initial_delay_ms: u64,
) -> anyhow::Result<T>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = anyhow::Result<T>>,
{
    let mut delay = initial_delay_ms;

    for attempt in 1..=max_attempts {
        match f().await {
            Ok(result) => return Ok(result),
            Err(e) if attempt < max_attempts => {
                tracing::warn!("Attempt {}/{} failed: {}, retrying in {}ms",
                    attempt, max_attempts, e, delay);
                tokio::time::sleep(Duration::from_millis(delay)).await;
                delay = (delay * 2).min(30_000); // Cap at 30 seconds
            }
            Err(e) => return Err(e),
        }
    }

    unreachable!()
}
```

---

## 8. Testing Strategy

### Test Structure

```
tests/
├── unit/                    # Unit tests (in crate src/)
├── integration/             # Cross-crate tests
│   ├── phase1_metadata.rs
│   ├── phase2_read.rs
│   ├── phase3_cache.rs
│   ├── phase4_persist.rs
│   ├── phase5_ui.rs
│   ├── phase6_nat.rs
│   └── phase7_write.rs
├── e2e/                     # End-to-end tests
│   ├── lan_transfer.rs
│   └── wan_transfer.rs
└── stress/                  # Stress tests
    ├── large_files.rs
    ├── many_files.rs
    └── concurrent_clients.rs
```

### Integration Test Example

```rust
// tests/integration/phase2_read.rs

use teleport_daemon::{start_host_service, start_mount_service};
use tempfile::tempdir;
use tokio::time::{timeout, Duration};

#[tokio::test]
async fn test_read_file_content() {
    // Setup host
    let host_dir = tempdir().unwrap();
    let test_content = b"Hello, Wormhole!";
    std::fs::write(host_dir.path().join("test.txt"), test_content).unwrap();

    let (_, host_handle) = start_host_service(host_dir.path().to_path_buf(), 15000)
        .await
        .unwrap();

    // Give host time to start
    tokio::time::sleep(Duration::from_millis(100)).await;

    // Setup client
    let mount_dir = tempdir().unwrap();
    let (mut events, client_handle) = start_mount_service(
        "127.0.0.1:15000".parse().unwrap(),
        mount_dir.path().to_path_buf(),
    )
    .await
    .unwrap();

    // Wait for mount
    timeout(Duration::from_secs(5), async {
        while let Ok(event) = events.recv().await {
            if matches!(event, ServiceEvent::MountReady { .. }) {
                break;
            }
        }
    })
    .await
    .unwrap();

    // Read file
    let content = std::fs::read(mount_dir.path().join("test.txt")).unwrap();
    assert_eq!(content, test_content);

    // Cleanup
    client_handle.shutdown();
    host_handle.shutdown();
}
```

### CI Test Matrix

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        rust: [stable, beta]

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-action@stable
        with:
          toolchain: ${{ matrix.rust }}

      - name: Install FUSE (Linux)
        if: runner.os == 'Linux'
        run: sudo apt-get install -y libfuse3-dev

      - name: Install macFUSE (macOS)
        if: runner.os == 'macOS'
        run: brew install --cask macfuse

      - name: Run tests
        run: cargo nextest run --all-features

      - name: Run clippy
        run: cargo clippy --all-targets -- -D warnings
```

---

## 9. Security Implementation

### Threat Model

| Threat | Phase | Mitigation |
|--------|-------|------------|
| MITM on LAN | 1-4 | Self-signed TLS (MVP), mutual TLS (future) |
| MITM on WAN | 6+ | PAKE-derived keys, signal server cannot decrypt |
| Path traversal | 2+ | Canonicalization + prefix check |
| DoS via large reads | 2+ | Max request size (10MB), rate limiting |
| Cache poisoning | 3+ | BLAKE3 integrity checks |
| Lock starvation | 7 | TTL expiry, no indefinite locks |
| Signal server abuse | 6 | Rate limiting, code expiry |

### Security Checklist

```markdown
## Phase 1-4 (LAN)
- [ ] Path sanitization implemented
- [ ] TLS certificate generation working
- [ ] Max message size enforced
- [ ] Cache integrity checks added

## Phase 5 (Desktop)
- [ ] Tauri CSP configured
- [ ] IPC commands validated
- [ ] No sensitive data in localStorage

## Phase 6 (Global)
- [ ] PAKE key derivation verified
- [ ] Signal server rate limited
- [ ] STUN responses validated
- [ ] Hole punch timing randomized

## Phase 7 (Write)
- [ ] Lock tokens unpredictable
- [ ] Write permissions checked
- [ ] Truncate bounds validated
```

---

## 10. CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags: ['v*']

jobs:
  build-tauri:
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: macos-latest
            target: x86_64-apple-darwin
          - platform: macos-latest
            target: aarch64-apple-darwin
          - platform: ubuntu-latest
            target: x86_64-unknown-linux-gnu
          - platform: windows-latest
            target: x86_64-pc-windows-msvc

    runs-on: ${{ matrix.platform }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Setup Rust
        uses: dtolnay/rust-action@stable
        with:
          targets: ${{ matrix.target }}

      - name: Install dependencies (Linux)
        if: runner.os == 'Linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y libfuse3-dev libgtk-3-dev libwebkit2gtk-4.1-dev

      - name: Install pnpm
        run: npm install -g pnpm

      - name: Install frontend dependencies
        working-directory: apps/desktop
        run: pnpm install

      - name: Build Tauri
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_PRIVATE_KEY: ${{ secrets.TAURI_PRIVATE_KEY }}
          TAURI_KEY_PASSWORD: ${{ secrets.TAURI_KEY_PASSWORD }}
        with:
          projectPath: apps/desktop
          tagName: v__VERSION__
          releaseName: 'Wormhole v__VERSION__'
          releaseBody: 'See CHANGELOG.md for details.'
          releaseDraft: true

  build-signal:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Build Docker image
        run: docker build -t wormhole-signal -f crates/teleport-signal/Dockerfile .

      - name: Push to registry
        run: |
          echo ${{ secrets.DOCKER_PASSWORD }} | docker login -u ${{ secrets.DOCKER_USERNAME }} --password-stdin
          docker tag wormhole-signal ${{ secrets.DOCKER_REGISTRY }}/wormhole-signal:${{ github.ref_name }}
          docker push ${{ secrets.DOCKER_REGISTRY }}/wormhole-signal:${{ github.ref_name }}
```

---

## 11. Platform-Specific Requirements

### Minimum Versions

| Platform | Minimum Version | FUSE Driver |
|----------|-----------------|-------------|
| macOS | 10.13 (High Sierra) | macFUSE 4.x |
| Windows | 10 (1809) | WinFsp 2.0 |
| Linux | Kernel 4.18 | libfuse3 |

### Driver Detection

```rust
// crates/teleport-daemon/src/platform.rs

pub fn check_fuse_available() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if !std::path::Path::new("/Library/Filesystems/macfuse.fs").exists() {
            return Err(
                "macFUSE not installed. Please install from https://osxfuse.github.io/".to_string()
            );
        }
    }

    #[cfg(target_os = "linux")]
    {
        if !std::path::Path::new("/dev/fuse").exists() {
            return Err(
                "FUSE not available. Please install libfuse3-dev or equivalent.".to_string()
            );
        }
    }

    #[cfg(target_os = "windows")]
    {
        // Check for WinFsp service
        let output = std::process::Command::new("sc")
            .args(["query", "WinFsp.Launcher"])
            .output();

        if output.map(|o| !o.status.success()).unwrap_or(true) {
            return Err(
                "WinFsp not installed. Please install from https://winfsp.dev/".to_string()
            );
        }
    }

    Ok(())
}
```

---

## 12. Migration & Upgrade Path

### Version Compatibility

| Component | Breaking Changes | Migration |
|-----------|-----------------|-----------|
| Cache format | Phase 3→4 adds disk | Clear cache on upgrade |
| Protocol | Phase 7 adds write messages | Version negotiation in handshake |
| Config | Each phase may add fields | Use `#[serde(default)]` |
| Signal server | Phase 6 introduces | No migration needed |

### Protocol Versioning

```rust
// crates/teleport-core/src/protocol.rs

pub const PROTOCOL_VERSION: u32 = 7; // Increment with breaking changes

#[derive(Debug, Serialize, Deserialize)]
pub struct Handshake {
    pub version: u32,
    pub client_id: String,
    pub capabilities: Vec<Capability>,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum Capability {
    Read,           // Phase 2+
    Cache,          // Phase 3+
    PersistCache,   // Phase 4+
    GlobalConnect,  // Phase 6+
    Write,          // Phase 7+
    Lock,           // Phase 7+
}

impl Handshake {
    pub fn is_compatible(&self, other: &Handshake) -> bool {
        // Major version must match
        self.version / 10 == other.version / 10
    }
}
```

---

## 13. Production Checklist

### Before Alpha Release

- [ ] All P0 issues resolved
- [ ] Unit tests pass on all platforms
- [ ] Integration tests pass
- [ ] No clippy warnings
- [ ] Security audit completed
- [ ] Documentation reviewed

### Before Beta Release

- [ ] Stress tests pass (1M files, 1TB)
- [ ] E2E tests pass (LAN + WAN)
- [ ] Code signing configured
- [ ] Auto-update working
- [ ] Telemetry opt-in working
- [ ] Error reporting integrated

### Before Production Release

- [ ] Performance benchmarks meet targets
- [ ] Security penetration test passed
- [ ] GDPR/privacy review completed
- [ ] Support channels established
- [ ] Incident response plan documented
- [ ] Rollback procedure tested

---

## Appendix: Quick Reference

### Build Commands

```bash
# Development
cargo build                           # Build all crates
cargo run -p teleport-daemon -- host ./share  # Run host
cargo run -p teleport-daemon -- mount ./mnt 127.0.0.1:5000  # Run mount

# Frontend
cd apps/desktop
pnpm install
pnpm tauri dev                        # Dev mode
pnpm tauri build                      # Production build

# Testing
cargo nextest run                     # Run tests
cargo nextest run -p teleport-daemon  # Test single crate

# Quality
cargo clippy --all-targets            # Lint
cargo fmt --all -- --check            # Format check
cargo audit                           # Security audit
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WORMHOLE_PORT` | 5000 | Default listening port |
| `WORMHOLE_SIGNAL_SERVER` | wss://signal.wormhole.app/ws | Signal server URL |
| `WORMHOLE_CACHE_DIR` | Platform-specific | Cache directory |
| `WORMHOLE_LOG_LEVEL` | info | Log verbosity |
| `RUST_LOG` | - | Detailed Rust logging |

### Useful Links

- [Tauri v2 Docs](https://v2.tauri.app/)
- [Quinn QUIC](https://docs.rs/quinn)
- [Fuser FUSE](https://docs.rs/fuser)
- [macFUSE](https://osxfuse.github.io/)
- [WinFsp](https://winfsp.dev/)
