# Platform Compatibility Matrix

## Overview

Project Wormhole targets three primary platforms: macOS, Windows, and Linux. This document details the compatibility requirements, known issues, and platform-specific implementations.

## Platform Support Summary

| Feature | macOS | Windows | Linux |
|---------|-------|---------|-------|
| **Core** | | | |
| FUSE filesystem | ✅ macFUSE | ✅ WinFsp | ✅ fuse3 |
| QUIC networking | ✅ | ✅ | ✅ |
| Signal client | ✅ | ✅ | ✅ |
| **UI** | | | |
| Tauri v2 | ✅ | ✅ | ✅ |
| System tray | ✅ | ✅ | ✅ (varies) |
| Native notifications | ✅ | ✅ | ✅ (varies) |
| **Build** | | | |
| Rust toolchain | ✅ | ✅ | ✅ |
| Cross-compilation | ⚠️ Limited | ⚠️ Limited | ✅ |

## FUSE Implementation Details

### macOS: macFUSE

**Version:** 4.x recommended

**Installation:**
```bash
# Homebrew
brew install --cask macfuse

# Or download from https://osxfuse.github.io/
```

**Detection code:**
```rust
#[cfg(target_os = "macos")]
fn check_fuse() -> bool {
    Path::new("/Library/Filesystems/macfuse.fs").exists()
}
```

**Known issues:**
- Requires kernel extension approval in System Preferences → Security
- May need reboot after installation
- Not available on Apple Silicon without disabling SIP (macOS < 12.3)
- macOS 12.3+ uses user-space driver (no SIP changes needed)

**Mount path:**
- Default: `/Volumes/Wormhole-<session_id>`
- Custom: User-specified

---

### Windows: WinFsp

**Version:** 2.0+ recommended

**Installation:**
```powershell
# Winget
winget install WinFsp.WinFsp

# Or download from https://winfsp.dev/
```

**Detection code:**
```rust
#[cfg(target_os = "windows")]
fn check_fuse() -> bool {
    // Check registry or DLL presence
    Path::new(r"C:\Program Files (x86)\WinFsp\bin\winfsp-x64.dll").exists()
}
```

**Known issues:**
- Requires Administrator for installation
- Some antivirus software flags WinFsp as suspicious
- Network drives may conflict with FUSE drives

**Mount path:**
- Default: `W:` (first available drive letter)
- Custom: User-specified drive letter

---

### Linux: fuse3

**Installation:**
```bash
# Debian/Ubuntu
sudo apt install fuse3 libfuse3-dev

# Fedora
sudo dnf install fuse3 fuse3-devel

# Arch
sudo pacman -S fuse3
```

**Detection code:**
```rust
#[cfg(target_os = "linux")]
fn check_fuse() -> bool {
    // Check for fusermount3
    Command::new("which")
        .arg("fusermount3")
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}
```

**Known issues:**
- User must be in `fuse` group (or use `allow_other`)
- SELinux may block FUSE mounts (need context)
- Some distros ship fuse2, need fuse3

**Mount path:**
- Default: `~/wormhole/<session_id>`
- Custom: User-specified

## QUIC/Network Compatibility

### Firewall Considerations

| Platform | Default Behavior | Solution |
|----------|-----------------|----------|
| macOS | Blocks inbound UDP | Prompt for firewall exception |
| Windows | Blocks inbound UDP | Windows Firewall rule |
| Linux | Usually open | iptables/nftables rule if needed |

**Port requirements:**
- QUIC: UDP 4433 (configurable)
- Signal: WSS 443 (HTTPS)

### NAT Traversal

| NAT Type | Success Rate | Solution |
|----------|--------------|----------|
| Full Cone | 95%+ | Direct connection |
| Restricted Cone | 90%+ | STUN |
| Port Restricted | 80%+ | STUN + hole punching |
| Symmetric | 30%* | TURN relay |

*Symmetric NAT requires TURN relay for reliable connectivity.

### IPv6 Support

| Platform | IPv6 | Notes |
|----------|------|-------|
| macOS | ✅ | Full support |
| Windows | ✅ | Full support |
| Linux | ✅ | Full support |

Both IPv4 and IPv6 are supported. Dual-stack by default.

## UI/Desktop Integration

### Tauri v2 Compatibility

| Feature | macOS | Windows | Linux |
|---------|-------|---------|-------|
| Window management | ✅ | ✅ | ✅ |
| Menu bar | ✅ | ✅ | ✅ |
| System tray | ✅ | ✅ | ⚠️ |
| Notifications | ✅ | ✅ | ⚠️ |
| Auto-start | ✅ | ✅ | ⚠️ |
| Deep links | ✅ | ✅ | ✅ |

**Linux notes:**
- System tray depends on desktop environment
- GNOME removed system tray support (use AppIndicator extension)
- KDE Plasma has full support
- Notifications depend on libnotify

### File Manager Integration

| Platform | Integration | Method |
|----------|-------------|--------|
| macOS | Finder sidebar | Programmatic (NSWorkspace) |
| Windows | Explorer integration | Shell extension |
| Linux | Nautilus/Dolphin | XDG bookmark |

## Build Matrix

### Rust Toolchain

| Platform | Architecture | Tier | Notes |
|----------|--------------|------|-------|
| macOS | x86_64 | 1 | Full support |
| macOS | aarch64 (M1/M2) | 1 | Full support |
| Windows | x86_64 | 1 | Full support |
| Windows | aarch64 | 2 | Works but less tested |
| Linux | x86_64 | 1 | Full support |
| Linux | aarch64 | 1 | Full support |

### CI/CD Matrix

```yaml
# GitHub Actions matrix
strategy:
  matrix:
    include:
      - os: macos-latest
        target: x86_64-apple-darwin
      - os: macos-latest
        target: aarch64-apple-darwin
      - os: windows-latest
        target: x86_64-pc-windows-msvc
      - os: ubuntu-latest
        target: x86_64-unknown-linux-gnu
```

### Dependencies by Platform

| Dependency | macOS | Windows | Linux |
|------------|-------|---------|-------|
| pkg-config | brew install | vcpkg | apt install |
| OpenSSL | system/brew | vcpkg | apt install |
| macFUSE/WinFsp/fuse3 | Required | Required | Required |

## Platform-Specific Code

### Conditional Compilation

```rust
#[cfg(target_os = "macos")]
mod macos {
    pub fn mount_path() -> PathBuf {
        PathBuf::from("/Volumes/Wormhole")
    }
}

#[cfg(target_os = "windows")]
mod windows {
    pub fn mount_path() -> PathBuf {
        PathBuf::from(r"W:\")
    }
}

#[cfg(target_os = "linux")]
mod linux {
    pub fn mount_path() -> PathBuf {
        dirs::home_dir()
            .unwrap_or_default()
            .join("wormhole")
    }
}

pub fn default_mount_path() -> PathBuf {
    #[cfg(target_os = "macos")]
    return macos::mount_path();

    #[cfg(target_os = "windows")]
    return windows::mount_path();

    #[cfg(target_os = "linux")]
    return linux::mount_path();
}
```

### File Metadata Differences

| Attribute | macOS | Windows | Linux |
|-----------|-------|---------|-------|
| Mode/permissions | ✅ Full | ⚠️ Limited | ✅ Full |
| Owner (uid/gid) | ✅ | ❌ | ✅ |
| Extended attrs | ✅ | ✅ (ADS) | ✅ |
| Symlinks | ✅ | ⚠️ Admin | ✅ |
| Hard links | ✅ | ✅ | ✅ |

### Path Handling

```rust
// Windows uses backslashes and drive letters
#[cfg(target_os = "windows")]
fn normalize_path(path: &str) -> String {
    path.replace('/', r"\")
}

#[cfg(not(target_os = "windows"))]
fn normalize_path(path: &str) -> String {
    path.to_string()
}
```

## Testing Matrix

### Automated Tests

| Test Type | macOS | Windows | Linux |
|-----------|-------|---------|-------|
| Unit tests | ✅ CI | ✅ CI | ✅ CI |
| Integration tests | ✅ CI | ✅ CI | ✅ CI |
| FUSE tests | ⚠️ Manual* | ⚠️ Manual* | ✅ CI |

*FUSE tests require installed driver, not available in standard CI VMs.

### Manual Test Checklist

**Per Platform:**
- [ ] Install FUSE driver
- [ ] Mount remote share
- [ ] List directories
- [ ] Read files
- [ ] Write files (Phase 7)
- [ ] Unmount cleanly
- [ ] Handle disconnect
- [ ] Resume after reconnect

## Known Issues & Workarounds

### macOS

| Issue | Workaround |
|-------|------------|
| "System Extension Blocked" | Allow in Security & Privacy |
| Slow first mount | Wait for driver initialization |
| Spotlight indexing | Add mount to Privacy exclusions |

### Windows

| Issue | Workaround |
|-------|------------|
| Drive letter conflicts | Use `wormhole --mount-point X:` |
| Antivirus interference | Add exception for wormhole.exe |
| WSL2 path issues | Use Windows paths, not /mnt/c |

### Linux

| Issue | Workaround |
|-------|------------|
| "Permission denied" | Add user to fuse group |
| SELinux denials | Set appropriate context |
| AppArmor blocks | Add profile exception |

## Minimum Requirements

### Hardware

| Platform | CPU | RAM | Disk |
|----------|-----|-----|------|
| All | 64-bit | 4 GB | 1 GB |

### OS Versions

| Platform | Minimum | Recommended |
|----------|---------|-------------|
| macOS | 10.15 (Catalina) | 12.0+ (Monterey) |
| Windows | 10 (1903) | 11 |
| Linux | Kernel 5.4+ | Kernel 5.15+ |

### FUSE Versions

| Platform | Minimum | Recommended |
|----------|---------|-------------|
| macFUSE | 4.0 | 4.5+ |
| WinFsp | 1.10 | 2.0+ |
| fuse3 | 3.9 | 3.14+ |

## Future Platform Considerations

### Potential Additions

| Platform | Feasibility | Notes |
|----------|-------------|-------|
| iOS | ❌ | No FUSE support |
| Android | ⚠️ | Limited FUSE (root only) |
| ChromeOS | ⚠️ | Linux container only |
| FreeBSD | ✅ | fusefs available |
