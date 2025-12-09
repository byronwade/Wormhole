<![CDATA[<div align="center">

# Wormhole

**Mount Any Folder. Any Computer. No Setup.**

[![License](https://img.shields.io/badge/license-MIT%2FApache--2.0-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/rust-1.75+-orange.svg)](https://www.rust-lang.org/)
[![Platform](https://img.shields.io/badge/platform-macOS%20|%20Linux%20|%20Windows-lightgrey.svg)](#platform-support)

[Features](#features) • [Installation](#installation) • [Quick Start](#quick-start) • [Documentation](#documentation) • [Architecture](#architecture)

</div>

---

## What is Wormhole?

Wormhole is a **peer-to-peer distributed filesystem** that lets you mount remote directories as local drives. Share a folder with a simple join code - others can mount it and browse files as if they were local. No cloud uploads, no accounts, no configuration.

```
┌─────────────────┐          QUIC/TLS 1.3         ┌─────────────────┐
│   Your Mac      │◄─────────────────────────────►│  Colleague's PC │
│                 │                                │                 │
│  ~/projects/    │   Join Code: 7KJM-XBCD        │  /mnt/projects/ │
│   ├── src/      │◄─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─►│   ├── src/      │
│   ├── docs/     │     Encrypted P2P Tunnel      │   ├── docs/     │
│   └── assets/   │                                │   └── assets/   │
└─────────────────┘                                └─────────────────┘
      HOST                                              CLIENT
   (sharing)                                          (mounting)
```

### Why Wormhole?

| Problem | Cloud Solutions | Wormhole |
|---------|-----------------|----------|
| Share 50GB project | Upload 2+ hours, pay $20/mo | **Instant** mount, **$0** |
| Privacy | Files on 3rd party servers | **P2P only** - your files stay yours |
| Setup | Accounts, sync clients, configs | **One command**, join code |
| Speed | Limited by upload bandwidth | **LAN speed** (100+ MB/s) |

**Perfect for:** Video editors, game developers, VFX artists, development teams, anyone sharing large files.

---

## Features

### Core
- **FUSE Filesystem** - Remote directories mount as native local drives
- **P2P Transfer** - Direct connections via QUIC (no relay servers)
- **E2E Encryption** - TLS 1.3 on all traffic, PAKE authentication
- **Join Codes** - Simple 16-character codes replace complex setup

### Performance
- **Streaming Access** - Read files before full download completes
- **Two-Tier Cache** - RAM (256MB) + Disk (10GB) for offline access
- **Prefetching** - Intelligent read-ahead for sequential workloads
- **128KB Chunks** - Optimized for large file performance

### Operations
- **Bidirectional Sync** - Read and write through mounts
- **Distributed Locking** - Safe concurrent file editing
- **NAT Traversal** - Works across the internet with signal server

### Developer Experience
- **Rich CLI** - 20+ commands with shell completions
- **Desktop App** - Tauri-based GUI (coming soon)
- **Cross-Platform** - macOS, Linux, Windows (via FUSE)

See [FEATURES.md](FEATURES.md) for the complete feature list.

---

## Installation

### Prerequisites

#### macOS
```bash
# Install macFUSE (required for filesystem mounting)
brew install macfuse

# Note: You may need to allow the kernel extension in System Preferences
# System Preferences → Security & Privacy → Allow "Benjamin Fleischer"
```

#### Linux
```bash
# Debian/Ubuntu
sudo apt install libfuse3-dev pkg-config build-essential

# Fedora/RHEL
sudo dnf install fuse3-devel pkgconfig

# Arch
sudo pacman -S fuse3 pkgconf
```

#### Windows
Download and install [WinFsp](https://winfsp.dev/) (Windows support coming soon).

### Build from Source

```bash
# Clone the repository
git clone https://github.com/wormhole-team/wormhole.git
cd wormhole

# Build release binaries
cargo build --release

# Binaries are in ./target/release/
# - wormhole        (main CLI)
# - wormhole-mount  (FUSE mount helper)
# - wormhole-signal (signaling server)

# Optional: Install to PATH
cargo install --path crates/teleport-daemon
```

### Verify Installation

```bash
./target/release/wormhole version --detailed
```

---

## Quick Start

### 1. Share a Folder (Host)

```bash
# Share a directory
wormhole host ./my-project

# Output:
# ╔═══════════════════════════════════════════════════════════════╗
# ║              🌀 WORMHOLE - SHARING ACTIVE                     ║
# ╠═══════════════════════════════════════════════════════════════╣
# ║  Share:     my-project                                        ║
# ║  Address:   0.0.0.0:4433                                      ║
# ║                                                               ║
# ║             JOIN CODE:  7KJM-XBCD                             ║
# ║                                                               ║
# ║  Connect with:                                                ║
# ║    wormhole mount 7KJM-XBCD                                   ║
# ╚═══════════════════════════════════════════════════════════════╝
```

### 2. Mount the Share (Client)

```bash
# On another machine, mount using the join code
wormhole mount 7KJM-XBCD ~/remote-project

# Or using direct IP (same network)
wormhole mount 192.168.1.100:4433 ~/remote-project

# Now access files normally!
ls ~/remote-project
cat ~/remote-project/README.md
code ~/remote-project  # Open in VS Code
```

### 3. When Done

```bash
# Unmount
wormhole unmount ~/remote-project

# Or on the host, press Ctrl+C to stop sharing
```

---

## CLI Reference

### Global Options

```
-v, --verbose    Increase verbosity (-v info, -vv debug, -vvv trace)
-q, --quiet      Suppress all output except errors
--format <FMT>   Output format: text (default), json, yaml
--config <PATH>  Configuration file path
--no-color       Disable colored output
```

### Commands

#### `wormhole host` (aliases: `share`, `serve`)

Share a local directory over the network.

```bash
wormhole host <PATH> [OPTIONS]

Options:
  -p, --port <PORT>           Port to listen on [default: 4433]
  -b, --bind <ADDR>           Bind address [default: 0.0.0.0]
  -n, --name <NAME>           Custom share name
  --max-connections <N>       Maximum concurrent peers [default: 10]
  --signal-server <URL>       Signal server URL
  --no-signal                 Don't register with signal server
  --code <CODE>               Use specific join code
  --allow-write               Allow write access from clients
  --password <PASS>           Require password for connection
  --allow-ips <IPs>           Only allow specific IPs (comma-separated)
  --block-ips <IPs>           Block specific IPs
  --bandwidth-limit <MB/s>    Limit bandwidth (0 = unlimited)
  -d, --daemon                Run in background
  --expire-after <DURATION>   Auto-expire share (e.g., "2h", "30m")
  --copy-code                 Copy join code to clipboard
  --exclude <PATTERNS>        Exclude file patterns (glob)
  --include <PATTERNS>        Include only patterns (glob)
  --compress                  Enable compression
  --watch                     Notify clients of file changes
  --tls-cert <PATH>           Custom TLS certificate
  --tls-key <PATH>            Custom TLS key

Examples:
  wormhole host ./project
  wormhole host ./renders --name "VFX Renders" --allow-write
  wormhole host ./sensitive --password secret123
  wormhole host ./temp --expire-after 1h
```

#### `wormhole mount` (aliases: `connect`, `join`)

Mount a remote share locally.

```bash
wormhole mount <TARGET> [MOUNTPOINT] [OPTIONS]

Arguments:
  <TARGET>      Join code (7KJM-XBCD) or direct address (ip:port)
  [MOUNTPOINT]  Mount path (auto-generated if not specified)

Options:
  -s, --signal <URL>          Signal server URL
  --use-kext                  Use kernel extension (macOS)
  --read-only                 Mount in read-only mode
  --password <PASS>           Password if host requires one
  --cache-mode <MODE>         none, ram, disk, hybrid, aggressive
  --ram-cache-mb <SIZE>       RAM cache size [default: 512]
  --disk-cache-gb <SIZE>      Disk cache size [default: 10]
  --prefetch                  Enable prefetching
  --prefetch-lookahead <N>    Chunks to prefetch [default: 4]
  --auto-reconnect            Auto-reconnect on disconnect [default: true]
  --max-reconnect <N>         Max reconnection attempts (0 = infinite)
  --offline-mode              Serve from cache when disconnected
  --bandwidth-limit <MB/s>    Limit bandwidth
  --timeout <SECS>            Connection timeout [default: 30]
  -o, --options <OPTS>        FUSE mount options
  -d, --daemon                Run in background
  --uid <UID>                 User ID for files
  --gid <GID>                 Group ID for files

Examples:
  wormhole mount 7KJM-XBCD
  wormhole mount 7KJM-XBCD ~/remote --read-only
  wormhole mount 192.168.1.100:4433 ~/mnt --cache-mode aggressive
```

#### `wormhole status` (aliases: `info`, `ps`)

Show status of active connections.

```bash
wormhole status [OPTIONS]

Options:
  -d, --detailed    Show detailed status
  -w, --watch       Continuously update
  --interval <S>    Update interval for watch mode [default: 1]
  --hosts           Show only hosts
  --mounts          Show only mounts
  --network         Show network statistics
  --performance     Show performance metrics
```

#### `wormhole cache`

Manage local cache.

```bash
wormhole cache <SUBCOMMAND>

Subcommands:
  stats              Show cache statistics
  clear              Clear cache
  warm <SHARE>       Pre-fetch data for offline use
  path               Show cache directory location
  resize             Set cache size limits
  export <PATH>      Export cache to archive
  import <PATH>      Import cache from archive
  verify             Verify cache integrity
  gc                 Run garbage collection

Examples:
  wormhole cache stats --detailed
  wormhole cache clear --older-than 7d
  wormhole cache warm my-share --max-size-mb 1000
  wormhole cache gc --target-gb 5
```

#### `wormhole config` (alias: `cfg`)

Manage configuration.

```bash
wormhole config <SUBCOMMAND>

Subcommands:
  show               Show current configuration
  set <KEY> <VALUE>  Set a configuration value
  get <KEY>          Get a configuration value
  reset              Reset to defaults
  edit               Open config in editor
  path               Show config file path
  list               List all configuration keys
  import <PATH>      Import configuration
  export <PATH>      Export configuration
```

#### `wormhole peers`

Manage trusted peers.

```bash
wormhole peers <SUBCOMMAND>

Subcommands:
  list               List known peers
  add <PEER>         Add a trusted peer
  remove <PEER>      Remove a peer
  show <PEER>        Show peer details
  block <PEER>       Block a peer
  unblock <PEER>     Unblock a peer
  trust <PEER>       Trust peer's certificate
  rename <PEER>      Rename a peer
```

#### `wormhole sync`

Synchronization controls.

```bash
wormhole sync <SUBCOMMAND>

Subcommands:
  status             Show sync status
  now                Force immediate sync
  pause              Pause synchronization
  resume             Resume synchronization
  conflicts          Show sync conflicts
  resolve <ID>       Resolve a conflict (local/remote/both/merge)
  reset              Reset sync state
  log                Show sync history
```

#### `wormhole signal`

Run the signaling/rendezvous server.

```bash
wormhole signal [OPTIONS]

Options:
  -p, --port <PORT>           Port to listen on [default: 8080]
  -b, --bind <ADDR>           Bind address [default: 0.0.0.0]
  --max-connections <N>       Max concurrent connections [default: 1000]
  --code-expiry <SECS>        Join code expiration [default: 3600]
  --rate-limit                Enable rate limiting
  --rate-limit-rpm <N>        Requests per minute per IP [default: 60]
  -d, --daemon                Run in background
  --tls-cert <PATH>           TLS certificate file
  --tls-key <PATH>            TLS key file
  --enable-stun               Enable STUN server
  --enable-turn               Enable TURN relay
  --admin-port <PORT>         Admin API port
  --metrics                   Enable metrics endpoint
```

#### Other Commands

```bash
wormhole unmount <TARGET>     # Unmount a share
wormhole list                 # List active shares/mounts
wormhole ping <TARGET>        # Test connectivity
wormhole bench <TARGET>       # Benchmark performance
wormhole init                 # Initialize wormhole in directory
wormhole access               # Manage access control
wormhole watch <TARGET>       # Watch for file changes
wormhole history              # Show transfer history
wormhole completions <SHELL>  # Generate shell completions
wormhole version              # Show version info
```

---

## Configuration

Configuration file locations:
- **macOS:** `~/Library/Application Support/wormhole/config.toml`
- **Linux:** `~/.config/wormhole/config.toml`
- **Windows:** `%APPDATA%/wormhole/config.toml`

### Example Configuration

```toml
[host]
# Default QUIC port for hosting shares
port = 4433
# Bind address (0.0.0.0 for all interfaces)
bind = "0.0.0.0"
# Allow clients to write to shared folders
writable = false
# Auto-generate TLS certificates if missing
auto_cert = true

[client]
# Number of chunks to prefetch during sequential reads
read_ahead_chunks = 4
# How long file attributes are cached (seconds)
attr_ttl_secs = 1
# How long directory listings are cached (seconds)
dir_ttl_secs = 1
# How often to sync dirty chunks to host (seconds)
sync_interval_secs = 1

[cache]
# Maximum disk cache size in bytes (default 10GB)
max_disk_bytes = 10737418240
# Maximum RAM cache size in bytes (default 512MB)
max_ram_bytes = 536870912
# Custom cache directory (uses system cache dir if not set)
# cache_dir = "/path/to/cache"
# How long to keep cached chunks (seconds)
chunk_ttl_secs = 3600
# How often to run garbage collection (seconds)
gc_interval_secs = 60

[signal]
# Signal server WebSocket port
port = 8080
# Bind address
bind = "0.0.0.0"
# SQLite database for persistence (in-memory if not set)
# db_path = "/var/lib/wormhole/signal.db"
# How long before idle rooms are cleaned up (seconds)
room_idle_timeout_secs = 300
# Maximum peers per room
max_peers_per_room = 10

[network]
# Connection timeout (seconds)
connect_timeout_secs = 10
# Request timeout (seconds)
request_timeout_secs = 30
# Keep-alive interval (seconds)
keepalive_secs = 15
# Maximum concurrent streams per QUIC connection
max_streams = 100
# Enable 0-RTT (faster reconnects, slightly less secure)
enable_0rtt = false
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `WORMHOLE_CONFIG` | Path to config file |
| `WORMHOLE_PORT` | Default host port |
| `WORMHOLE_BIND` | Default bind address |
| `WORMHOLE_SIGNAL` | Default signal server URL |
| `SIGNAL_PORT` | Signal server port |
| `SIGNAL_BIND` | Signal server bind address |
| `NO_COLOR` | Disable colored output |

---

## Architecture

### Project Structure

```
wormhole/
├── crates/
│   ├── teleport-core/        # Shared types, wire protocol, crypto
│   │   ├── src/
│   │   │   ├── protocol.rs   # Network message definitions
│   │   │   ├── types.rs      # Core data types (FileAttr, ChunkId, etc.)
│   │   │   ├── crypto.rs     # Join codes, PAKE, checksums
│   │   │   ├── error.rs      # Error types
│   │   │   └── config.rs     # Configuration parsing
│   │   └── Cargo.toml
│   │
│   ├── teleport-daemon/      # Main daemon (host + client + FUSE)
│   │   ├── src/
│   │   │   ├── bin/
│   │   │   │   ├── wormhole.rs       # Main CLI
│   │   │   │   └── wormhole-mount.rs # FUSE mount helper
│   │   │   ├── fuse.rs       # FUSE filesystem implementation
│   │   │   ├── host.rs       # Host (sharing) logic
│   │   │   ├── client.rs     # Client (mounting) logic
│   │   │   ├── bridge.rs     # Async/sync bridge for FUSE
│   │   │   ├── cache.rs      # RAM cache (LRU)
│   │   │   ├── disk_cache.rs # Persistent disk cache
│   │   │   ├── net.rs        # QUIC networking
│   │   │   └── rendezvous.rs # Signal server client
│   │   └── Cargo.toml
│   │
│   └── teleport-signal/      # Signaling/rendezvous server
│       ├── src/
│       │   ├── bin/signal.rs # Signal server binary
│       │   ├── lib.rs        # WebSocket handling
│       │   └── storage.rs    # Room/code persistence
│       └── Cargo.toml
│
├── apps/
│   └── teleport-ui/          # Desktop application (Tauri + React)
│       ├── src/              # React frontend
│       └── src-tauri/        # Tauri Rust backend
│
├── deploy/
│   └── signal-server/
│       └── Dockerfile        # Signal server container
│
└── doc/
    ├── development/          # Technical documentation
    └── marketing/            # Business documentation
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENT SIDE                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────────┐  │
│  │   User App  │    │    FUSE     │    │      Cache Manager          │  │
│  │  (ls, cat)  │───►│  Filesystem │───►│  ┌─────────┬───────────┐   │  │
│  └─────────────┘    │   (sync)    │    │  │ L1 RAM  │ L2 Disk   │   │  │
│                     └──────┬──────┘    │  │  LRU    │ Persistent│   │  │
│                            │           │  └────┬────┴─────┬─────┘   │  │
│                            │           └───────┼──────────┼─────────┘  │
│                     ┌──────▼──────┐            │          │            │
│                     │   Bridge    │◄───────────┘          │            │
│                     │ (crossbeam) │            Cache Hit ─┘            │
│                     └──────┬──────┘                                    │
│                            │ Cache Miss                                │
│                     ┌──────▼──────┐                                    │
│                     │  Network    │                                    │
│                     │   Client    │                                    │
│                     └──────┬──────┘                                    │
│                            │                                           │
└────────────────────────────┼───────────────────────────────────────────┘
                             │
                    QUIC/TLS 1.3
                             │
┌────────────────────────────┼───────────────────────────────────────────┐
│                            │              HOST SIDE                     │
├────────────────────────────┼───────────────────────────────────────────┤
│                     ┌──────▼──────┐                                    │
│                     │  Network    │                                    │
│                     │   Server    │                                    │
│                     └──────┬──────┘                                    │
│                            │                                           │
│                     ┌──────▼──────┐    ┌─────────────┐                │
│                     │    Host     │───►│  Local FS   │                │
│                     │   Handler   │    │  (read/     │                │
│                     │             │◄───│   write)    │                │
│                     └─────────────┘    └─────────────┘                │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Wire Protocol

Messages are serialized with bincode and prefixed with a 4-byte length:

```
┌──────────────┬─────────────────────────────────────┐
│ Length (4B)  │           Payload (bincode)          │
│ Little-endian│                                      │
└──────────────┴─────────────────────────────────────┘
```

**Message Types:**

| Category | Messages |
|----------|----------|
| Handshake | `Hello`, `HelloAck` |
| Metadata | `ListDir`, `GetAttr`, `Lookup` |
| Data | `ReadChunk`, `WriteChunk` |
| Locking | `AcquireLock`, `ReleaseLock` |
| File Ops | `CreateFile`, `DeleteFile`, `CreateDir`, `DeleteDir`, `Rename`, `Truncate`, `SetAttr` |
| Control | `Ping`, `Pong`, `Error`, `Goodbye`, `Invalidate` |

### Key Technologies

| Component | Technology | Purpose |
|-----------|------------|---------|
| Transport | QUIC (quinn) | Multiplexed, reliable UDP |
| Encryption | TLS 1.3 (rustls) | End-to-end security |
| Filesystem | FUSE (fuser) | Userspace filesystem |
| Authentication | SPAKE2 | Password-authenticated key exchange |
| Checksums | BLAKE3 | Fast, secure hashing |
| Serialization | bincode | Efficient binary encoding |
| Async Runtime | Tokio | High-performance async I/O |
| Desktop UI | Tauri v2 | Cross-platform app framework |

---

## Deploying the Signal Server

The signal server enables NAT traversal for connections over the internet.

### Docker

```bash
# Build the image
docker build -t wormhole-signal -f deploy/signal-server/Dockerfile .

# Run the container
docker run -d \
  --name wormhole-signal \
  -p 8080:8080 \
  wormhole-signal

# With custom options
docker run -d \
  --name wormhole-signal \
  -p 8080:8080 \
  -e SIGNAL_PORT=8080 \
  wormhole-signal \
  --rate-limit \
  --enable-stun
```

### Direct

```bash
# Build
cargo build --release --bin wormhole-signal

# Run
./target/release/wormhole-signal \
  --port 8080 \
  --bind 0.0.0.0 \
  --rate-limit
```

### With TLS (Recommended for Production)

```bash
./target/release/wormhole-signal \
  --port 8443 \
  --tls-cert /path/to/cert.pem \
  --tls-key /path/to/key.pem
```

---

## Development

### Building

```bash
# Debug build
cargo build

# Release build
cargo build --release

# Build specific crate
cargo build -p teleport-daemon

# Run tests
cargo test

# Run lints
cargo clippy -D warnings

# Format code
cargo fmt
```

### Running Tests

```bash
# All tests
cargo test

# Specific test
cargo test test_roundtrip_hello

# With output
cargo test -- --nocapture

# Integration tests only
cargo test --test '*'
```

### Development Workflow

```bash
# Terminal 1: Run signal server
cargo run -p teleport-signal

# Terminal 2: Run host
cargo run -p teleport-daemon -- host ./test-folder

# Terminal 3: Run client
mkdir /tmp/mount
cargo run -p teleport-daemon -- mount 127.0.0.1:4433 /tmp/mount
```

### Adding a New Protocol Message

1. Define message types in `crates/teleport-core/src/protocol.rs`
2. Add handler in `crates/teleport-daemon/src/host.rs` or `client.rs`
3. Write tests for serialization round-trip

---

## Troubleshooting

### macFUSE Issues (macOS)

```bash
# Check if macFUSE is installed
ls /Library/Filesystems/macfuse.fs

# If not loading, check System Preferences → Security & Privacy
# Look for "System software from developer Benjamin Fleischer was blocked"

# After allowing, you may need to reboot
sudo reboot
```

### FUSE Issues (Linux)

```bash
# Check FUSE is available
ls -la /dev/fuse

# Add user to fuse group
sudo usermod -a -G fuse $USER

# Log out and back in, then verify
groups | grep fuse
```

### Connection Issues

```bash
# Test direct connectivity
wormhole ping 192.168.1.100:4433

# Check if ports are open
nc -zv 192.168.1.100 4433

# Enable verbose logging
wormhole -vvv mount 192.168.1.100:4433 /mnt/test
```

### Cache Issues

```bash
# Check cache stats
wormhole cache stats --detailed

# Clear corrupted cache
wormhole cache clear --force

# Verify cache integrity
wormhole cache verify --fix
```

### Mount Won't Unmount

```bash
# Force unmount (macOS)
diskutil unmount force /Volumes/wormhole

# Force unmount (Linux)
fusermount -uz /mnt/wormhole

# Kill stuck processes
wormhole unmount /mnt/wormhole --force
```

---

## Platform Support

| Platform | Status | FUSE Driver |
|----------|--------|-------------|
| macOS 10.13+ | Supported | macFUSE 4.x |
| Linux (kernel 4.18+) | Supported | libfuse3 |
| Windows 10+ | Planned | WinFsp |
| iOS | Future | - |
| Android | Future | - |

### Architecture Support

- x86_64 (Intel/AMD)
- ARM64 (Apple Silicon, Linux ARM)

---

## Contributing

We welcome contributions! Please see our development documentation in `doc/development/`.

### Getting Started

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`cargo test`)
5. Run lints (`cargo clippy && cargo fmt --check`)
6. Commit your changes
7. Push to the branch
8. Open a Pull Request

### Code Style

- Follow Rust standard conventions
- Use `cargo fmt` for formatting
- No `unwrap()` in library code - use `?` or explicit error handling
- Add tests for new functionality

---

## License

Dual-licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE) at your option.

---

## Acknowledgments

- [fuser](https://github.com/cberner/fuser) - Rust FUSE bindings
- [quinn](https://github.com/quinn-rs/quinn) - QUIC implementation
- [Tauri](https://tauri.app/) - Desktop app framework
- [macFUSE](https://macfuse.io/) - macOS FUSE driver

---

<div align="center">

**Mount Any Folder. Any Computer. No Setup.**

[Website](https://wormhole.dev) • [Documentation](https://wormhole.dev/docs) • [Discord](https://discord.gg/wormhole)

</div>
]]>