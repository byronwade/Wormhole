# Phase 5 Open Questions - RESOLVED

## Q1: Should we keep a persistent daemon process separate from UI for restarts?

**Decision:** **Yes, separate daemon from UI**

**Architecture:**
```
┌──────────────────┐
│  Tauri App (UI)  │  ← User-facing, can restart freely
└────────┬─────────┘
         │ IPC (localhost socket)
         ▼
┌──────────────────┐
│ wormhole-daemon  │  ← Background service, persists across UI restarts
│  - FUSE mount    │
│  - QUIC client   │
│  - Cache         │
└──────────────────┘
```

**Rationale:**
- FUSE mounts survive UI crashes/restarts
- File transfers continue in background
- System tray shows daemon status
- User can quit UI without interrupting work

**Platform specifics:**
- macOS: launchd service or login item
- Windows: Windows Service or startup task
- Linux: systemd user service

---

## Q2: How to handle driver checks/installs cross-platform in-app?

**Decision:**
- **macOS:** Detect macFUSE, prompt with download link (no auto-install)
- **Windows:** Detect WinFsp, prompt with download link
- **Linux:** Check for fuse3, show apt/dnf/pacman command

**Implementation:**
```rust
fn check_fuse_installed() -> FuseStatus {
    #[cfg(target_os = "macos")]
    {
        if Path::new("/Library/Filesystems/macfuse.fs").exists() {
            FuseStatus::Installed
        } else {
            FuseStatus::NotInstalled {
                install_url: "https://osxfuse.github.io/",
                instructions: "Download and install macFUSE, then restart.",
            }
        }
    }
    // Similar for Windows/Linux
}
```

**Rationale:**
- Silent driver installation is risky and often blocked by security policies
- Users prefer to understand what's being installed
- Download links ensure they get latest version
- First-run wizard guides users through setup

---

## Q3: What telemetry (if any) should surface in UI vs hidden debug pane?

**Decision:**

**Always visible:**
- Connection status (connected/disconnected)
- Transfer speed (current, averaged)
- Peer count
- Cached data size

**On-demand (click to expand):**
- Ping/latency
- Cache hit rate
- Bytes transferred (session)
- Error count

**Debug pane only:**
- Full connection logs
- Individual chunk timings
- Protocol messages
- Memory/CPU usage

**Config:**
```toml
[telemetry]
enabled = true           # Send anonymous usage stats (opt-in)
debug_panel = false      # Show debug panel in UI
```

**Privacy:**
- No telemetry by default
- Opt-in during setup
- Only aggregate stats (no file names, no IPs)

---

## Q4: Default ports/configurable settings for hosting/mounting?

**Decision:**

| Setting | Default | Configurable | Notes |
|---------|---------|--------------|-------|
| QUIC port (host) | 4433 | Yes | Ephemeral if busy |
| Signal server | wss://signal.wormhole.run | Yes | Self-host option |
| Mount point | OS temp + random | Yes | Per-connection |
| Config dir | ~/.wormhole | Yes | Via env var |

**Config example:**
```toml
[network]
quic_port = 4433
signal_server = "wss://signal.wormhole.run"
bind_address = "0.0.0.0"

[mount]
default_path = "/Volumes/Wormhole"  # macOS
# default_path = "W:\"              # Windows
# default_path = "~/wormhole"       # Linux
```

**Port selection logic:**
1. Try configured port
2. If busy, try configured port + 1, +2, ... up to +10
3. If all busy, use ephemeral port
4. Report actual port to signal server
