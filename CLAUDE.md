# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## ⚠️ MANDATORY: Read Documentation First

**BEFORE writing ANY code or making decisions**, consult the project documentation:

### Start Here
```
doc/development/00-master-implementation-plan.md  ← SOURCE OF TRUTH
```

### Documentation Map

| Need | Read This |
|------|-----------|
| **Any coding task** | `doc/development/00-master-implementation-plan.md` |
| **Phase X work** | `doc/development/phase-X/*.md` (all 10 files) |
| **Writing tests** | `doc/development/01-testing-strategy.md` |
| **Security work** | `doc/development/02-security-guide.md` |
| **UI/UX design** | `doc/marketing/02-brand-identity.md` |
| **Copy/messaging** | `doc/marketing/01-target-audience-strategy.md` |
| **Pricing questions** | `doc/marketing/08-monetization-strategy.md` |

### Phase Documentation Structure
Each `doc/development/phase-X/` contains:
- `1-overview.md` → What & why
- `2-goals.md` → Success criteria
- `3-architecture.md` → Technical design
- `4-scope.md` → **What's in/out (CHECK THIS!)**
- `5-implementation-plan.md` → Step-by-step
- `6-testing-and-metrics.md` → Verification
- `7-risks-and-mitigations.md` → What could fail
- `8-deliverables.md` → What ships

---

## Project Overview

**Wormhole** is a peer-to-peer distributed filesystem that mounts remote directories locally via QUIC. Think "AirDrop meets network drive" - share a folder with a code, others mount it as a local drive.

**Target Audience:** Creative professionals (video editors, game developers, VFX artists) who need fast, free, private file sharing without cloud uploads.

**Key Differentiator:** The only tool combining mount-as-drive + join codes + free + cross-platform + E2E encrypted.

### Value Proposition
- **Speed:** 50GB folder accessible in <10 seconds (no upload)
- **Cost:** $0/month vs $50+/month for cloud tools
- **Privacy:** Files never touch third-party servers
- **Simplicity:** Share a code, connect, done

## Architecture

### Rust Cargo Workspace (Monorepo)

```
wormhole/
├── crates/
│   ├── teleport-core/     # Shared types, wire protocol, crypto
│   ├── teleport-daemon/   # FUSE driver + QUIC Host/Client
│   └── teleport-signal/   # WebSocket rendezvous server
├── apps/
│   └── teleport-ui/       # Tauri + React + Tailwind frontend
└── doc/
    ├── development/       # Technical implementation docs
    └── marketing/         # Business strategy docs
```

### Three Planes
1. **Control Plane:** Signaling, authentication, join codes
2. **Metadata Plane:** Directory trees, file attributes, inodes
3. **Data Plane:** Byte transfer, chunking, caching

### Key Technologies
- **Rust:** Core daemon and signal server
- **FUSE (fuser):** Filesystem in userspace
- **QUIC (quinn + rustls):** Secure, multiplexed transport
- **PAKE (spake2):** Password-authenticated key exchange for join codes
- **Tauri v2:** Desktop app wrapper
- **React + Vite + Tailwind:** Frontend

## Build Commands

```bash
# Build entire workspace
cargo build --release

# Build specific crate
cargo build -p teleport-daemon

# Run tests
cargo test

# Run single test
cargo test test_name

# Run daemon CLI
cargo run -p teleport-daemon -- host <folder>
cargo run -p teleport-daemon -- mount <mountpoint> <host_ip>

# Frontend development
cd apps/teleport-ui && pnpm install && pnpm tauri dev

# Lint and format
cargo fmt && cargo clippy -D warnings
```

## Development Phases

| Phase | Name | Goal | Key Components |
|-------|------|------|----------------|
| 1 | Hello World FS | `ls -R` lists remote files | FUSE skeleton, QUIC connection, metadata sync |
| 2 | P2P Tunnel | Open/read remote files | Data plane, byte range requests |
| 3 | Integration | Streaming + RAM cache | Governor prefetch, 128KB chunks |
| 4 | Performance | Disk cache + offline | `~/.cache/wormhole`, LRU eviction |
| 5 | Product Wrapper | Desktop app | Tauri GUI, system tray, installers |
| 6 | Security | NAT traversal + encryption | Signal server, PAKE, hole punching |
| 7 | Release | Bidirectional writes | Distributed locks, conflict resolution |

**Before generating code:** Identify the active phase to avoid introducing future dependencies.

## Critical Patterns

### Async/Sync Bridging (ClientActor Pattern)
FUSE methods are synchronous; networking uses tokio. Never call `.await` in FUSE methods.

```rust
// In FUSE method:
let (tx, rx) = tokio::sync::oneshot::channel();
actor_tx.blocking_send(Request { reply: tx, ... })?;
let response = rx.blocking_recv()?;
```

### Wire Protocol
- Define all messages in `crates/teleport-core/src/protocol.rs`
- Use `serde` + `bincode` (not JSON for file data)
- Protocol updates must be additive; use `Option<T>` for new fields

### Path Sanitization (Security Critical)
```rust
pub fn safe_path(root: &Path, relative: &str) -> Option<PathBuf> {
    if relative.contains("..") || relative.starts_with('/') {
        return None;
    }
    let full = root.join(relative);
    let canonical = full.canonicalize().ok()?;
    if canonical.starts_with(root.canonicalize().ok()?) {
        Some(canonical)
    } else {
        None
    }
}
```

## Code Rules

### Error Handling
- Never use `.unwrap()` in `src/` - use `?` or explicit `match`
- FUSE errors: return `libc::EIO` or `reply.error(ENOENT)`, never panic
- Use `anyhow` for app errors, `thiserror` for library errors

### Memory & Performance
- Avoid `clone()` on `Vec<u8>` buffers; use `&[u8]` or `Arc<Vec<u8>>`
- Chunk size: 128KB constant in `storage_defs.rs`
- Use `std::sync::RwLock` for read-heavy state (InodeMap)
- Use `tokio::sync::Mutex` for async actors
- Never hold locks across `.await`

### FUSE Specifics
- Always implement `getattr` (called constantly)
- Set high `ttl` (1s) for static files, 0 for dynamic
- Ensure `st_uid`/`st_gid` match current user
- Integration tests (real mounts) go in `tests/`, run via script

### Frontend Rules
- React components: functional + TypeScript
- Use `cn()` utility (tailwind-merge) for classes
- All backend calls via `invoke()`
- No business logic in React; only display status

## Dependencies

### System Requirements
- **Linux:** `libfuse3-dev`, `pkg-config`
- **macOS:** macFUSE (`brew install macfuse`)
- **Windows:** WinFSP

### Key Crates
```toml
[workspace.dependencies]
tokio = { version = "1.35", features = ["full"] }
quinn = "0.11"
rustls = { version = "0.23", features = ["ring"] }
fuser = "0.15"
serde = { version = "1.0", features = ["derive"] }
bincode = "1.3"
anyhow = "1.0"
thiserror = "1.0"
tracing = "0.1"
spake2 = "0.4"
blake3 = "1.5"
```

## Documentation Reference

### Development Docs (`doc/development/`)
- `00-master-implementation-plan.md` - Complete build guide, all dependencies
- `01-testing-strategy.md` - Test pyramid, examples
- `02-security-guide.md` - Threat model, mitigations
- `phase-1/` through `phase-7/` - Phase-specific architecture

### Marketing Docs (`doc/marketing/`)
- `00-marketing-overview.md` - Summary and quick reference
- `01-target-audience-strategy.md` - Personas, positioning
- `02-brand-identity.md` - Colors (#7C3AED purple), typography, messaging
- `03-customer-acquisition.md` - Channels, tactics
- `04-investor-pitch.md` - Pitch deck, investor targets
- `08-monetization-strategy.md` - Pricing ($0/Free, $8/Pro, $15/Team)

## Pricing (For Context)

| Tier | Price | Target |
|------|-------|--------|
| Free | $0/forever | Individuals, viral growth |
| Pro | $8/user/mo | Freelancers, power users |
| Team | $15/user/mo | Studios (3-25 people) |
| Enterprise | Custom | Organizations (50+) |

## Brand Quick Reference

- **Primary Color:** #7C3AED (Wormhole Purple)
- **Tagline:** "Mount Any Folder. Any Computer. No Setup."
- **Voice:** Technical but accessible, direct, slightly irreverent
- **Target:** Creative professionals (video editors, game devs, VFX)

## Common Tasks

### Adding a New Protocol Message
1. Define in `crates/teleport-core/src/protocol.rs`
2. Add handler in `teleport-daemon`
3. Update tests for round-trip encoding

### Adding a Tauri Command
1. Define in `apps/teleport-ui/src-tauri/src/commands.rs`
2. Register in `main.rs` with `.invoke_handler()`
3. Call from React via `invoke("command_name", { args })`

### Adding a New Phase Feature
1. Check phase dependencies in `doc/development/`
2. Implement in appropriate crate
3. Add tests
4. Update this file if architecture changes
