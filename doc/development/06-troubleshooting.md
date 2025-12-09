# Wormhole Troubleshooting Guide

This guide helps diagnose and resolve common issues with Wormhole.

---

## Table of Contents

1. [Quick Diagnostics](#1-quick-diagnostics)
2. [Installation Issues](#2-installation-issues)
3. [Connection Issues](#3-connection-issues)
4. [Mount Issues](#4-mount-issues)
5. [Performance Issues](#5-performance-issues)
6. [Platform-Specific Issues](#6-platform-specific-issues)
7. [Error Code Reference](#7-error-code-reference)
8. [Debug Mode](#8-debug-mode)
9. [Getting Help](#9-getting-help)

---

## 1. Quick Diagnostics

### Health Check Command

```bash
wormhole doctor
```

This runs diagnostics and reports:
- FUSE availability
- Network connectivity
- Signal server reachability
- Cache status
- System resources

### Log Locations

| Platform | Log Path |
|----------|----------|
| Linux | `~/.local/share/wormhole/logs/` |
| macOS | `~/Library/Logs/Wormhole/` |
| Windows | `%APPDATA%\Wormhole\logs\` |

### Enable Verbose Logging

```bash
# CLI
RUST_LOG=debug wormhole host ./folder

# Or in config file
[log]
level = "debug"
```

---

## 2. Installation Issues

### FUSE Not Found

**Symptoms:**
```
Error: FUSE library not found
Error: libfuse3.so: cannot open shared object file
```

**Solution (Linux):**
```bash
# Debian/Ubuntu
sudo apt install libfuse3-dev fuse3

# Fedora
sudo dnf install fuse3-devel fuse3

# Arch
sudo pacman -S fuse3

# Verify
fusermount3 --version
```

**Solution (macOS):**
```bash
# Install macFUSE
brew install macfuse

# Then: System Preferences → Security & Privacy → Allow "osxfuse"
# Reboot required after first install
```

**Solution (Windows):**
```
1. Download WinFSP from https://winfsp.dev/
2. Run installer as Administrator
3. Reboot
```

### Permission Denied for FUSE

**Symptoms:**
```
Error: Permission denied (os error 13)
fusermount: user has no write access to mountpoint
```

**Solution (Linux):**
```bash
# Add user to fuse group
sudo usermod -aG fuse $USER

# Log out and back in, then verify
groups | grep fuse

# Or set permissions on mount point
sudo chown $USER:$USER /mnt/wormhole
```

### Rust Compilation Errors

**Symptoms:**
```
error[E0433]: failed to resolve: use of undeclared crate or module
```

**Solution:**
```bash
# Update Rust
rustup update stable

# Clear build cache
cargo clean

# Rebuild
cargo build --release
```

---

## 3. Connection Issues

### Cannot Connect to Host

**Symptoms:**
```
Error: Connection refused
Error: Connection timed out
```

**Diagnostic Steps:**

1. **Verify host is running:**
   ```bash
   # On host machine
   wormhole status
   ```

2. **Check network connectivity:**
   ```bash
   # From client, ping host
   ping <host-ip>

   # Check if port is open (default: random)
   nc -zv <host-ip> <port>
   ```

3. **Check firewall:**
   ```bash
   # Linux
   sudo ufw status
   sudo ufw allow <port>/udp

   # macOS
   sudo /usr/libexec/ApplicationFirewall/socketfilterfw --listapps
   ```

4. **Check join code:**
   - Ensure exact match (case-sensitive)
   - No extra spaces
   - Code hasn't expired

### NAT Traversal Failure

**Symptoms:**
```
Error: NAT traversal failed
Error: STUN request timed out
```

**Solutions:**

1. **Use signal server:**
   ```bash
   wormhole mount <code> --signal-server wss://signal.wormhole.dev
   ```

2. **Manual port forwarding:**
   ```
   Router → Port Forwarding → Add Rule
   - External Port: 51820 (or your chosen port)
   - Internal Port: Same
   - Protocol: UDP
   - Internal IP: Your machine's local IP
   ```

3. **Use IPv6 (if available):**
   ```bash
   wormhole host ./folder --ipv6
   ```

### Signal Server Unreachable

**Symptoms:**
```
Error: WebSocket connection failed
Error: Signal server timeout
```

**Solutions:**

1. **Check signal server status:**
   ```bash
   curl -I https://signal.wormhole.dev/health
   ```

2. **Use alternate signal server:**
   ```bash
   wormhole mount <code> --signal-server wss://signal2.wormhole.dev
   ```

3. **Self-host signal server:**
   ```bash
   cargo run -p teleport-signal -- --bind 0.0.0.0:8080
   ```

### Connection Drops Frequently

**Symptoms:**
```
Warning: Connection lost, reconnecting...
Error: Too many reconnection attempts
```

**Solutions:**

1. **Check network stability:**
   ```bash
   # Monitor packet loss
   ping -c 100 <host-ip> | grep -E "loss|avg"
   ```

2. **Increase timeout:**
   ```toml
   # wormhole.toml
   [network]
   timeout_ms = 60000  # 60 seconds
   keepalive_interval_ms = 5000  # 5 seconds
   ```

3. **Check for VPN interference:**
   - Some VPNs block UDP
   - Try disabling VPN temporarily

---

## 4. Mount Issues

### Mount Point Busy

**Symptoms:**
```
Error: Mount point is busy
Error: Device or resource busy
```

**Solutions:**

1. **Force unmount:**
   ```bash
   # Linux
   fusermount -uz /mnt/wormhole

   # macOS
   diskutil unmount force /Volumes/Wormhole

   # Or
   sudo umount -l /mnt/wormhole
   ```

2. **Check what's using it:**
   ```bash
   lsof +D /mnt/wormhole
   fuser -vm /mnt/wormhole
   ```

3. **Kill processes using mount:**
   ```bash
   fuser -km /mnt/wormhole
   ```

### Mount Point Not Empty

**Symptoms:**
```
Error: Mount point is not empty
```

**Solution:**
```bash
# Either empty the directory
rm -rf /mnt/wormhole/*

# Or use a different mount point
wormhole mount <code> /mnt/wormhole2
```

### Files Not Appearing

**Symptoms:**
- Mount succeeds but directory is empty
- Some files missing

**Diagnostic Steps:**

1. **Check connection status:**
   ```bash
   wormhole status
   ```

2. **Force refresh:**
   ```bash
   # Invalidate cache
   wormhole cache clear

   # Or touch the directory
   ls -la /mnt/wormhole
   ```

3. **Check host-side permissions:**
   ```bash
   # On host
   ls -la ./shared-folder
   ```

### Stale File Handle

**Symptoms:**
```
Error: Stale file handle
ls: cannot access 'file': Stale file handle
```

**Solutions:**

1. **Refresh mount:**
   ```bash
   wormhole remount
   ```

2. **Clear cache:**
   ```bash
   wormhole cache clear
   ```

3. **Full remount:**
   ```bash
   wormhole unmount
   wormhole mount <code> /mnt/wormhole
   ```

---

## 5. Performance Issues

### Slow File Access

**Symptoms:**
- Long delays when opening files
- Slow directory listings
- High latency

**Diagnostic:**
```bash
# Check latency
wormhole ping <code>

# Check cache status
wormhole cache stats
```

**Solutions:**

1. **Enable prefetching:**
   ```toml
   [cache]
   prefetch_enabled = true
   prefetch_lookahead = 4
   ```

2. **Increase cache size:**
   ```toml
   [cache]
   l1_size = 536870912  # 512MB RAM
   l2_max_size = 21474836480  # 20GB disk
   ```

3. **Use SSD for cache:**
   ```toml
   [cache]
   l2_path = "/ssd/wormhole-cache"
   ```

### High CPU Usage

**Symptoms:**
- `teleport-daemon` using >50% CPU
- System slowdown

**Solutions:**

1. **Reduce concurrent operations:**
   ```toml
   [network]
   max_concurrent_streams = 50  # Default: 100
   ```

2. **Increase chunk size (if network is fast):**
   - Requires code change, file issue

3. **Check for scan loops:**
   ```bash
   # If host CPU is high, check for frequent file changes
   inotifywait -m ./shared-folder
   ```

### High Memory Usage

**Symptoms:**
- `teleport-daemon` using >500MB RAM
- System running out of memory

**Solutions:**

1. **Reduce L1 cache:**
   ```toml
   [cache]
   l1_size = 134217728  # 128MB instead of 256MB
   ```

2. **Enable aggressive GC:**
   ```toml
   [cache]
   gc_interval_secs = 60  # More frequent cleanup
   ```

3. **Check for memory leaks:**
   ```bash
   # Monitor memory over time
   watch -n 5 'ps -o rss,vsz,comm -p $(pgrep teleport)'
   ```

### Network Bandwidth Issues

**Symptoms:**
- Transfers slower than network capacity
- Inconsistent speeds

**Diagnostic:**
```bash
# Test raw network speed
iperf3 -c <host-ip>

# Compare with Wormhole speed
wormhole benchmark <code>
```

**Solutions:**

1. **Increase buffer sizes:**
   ```toml
   [network]
   send_buffer_size = 2097152  # 2MB
   recv_buffer_size = 2097152
   ```

2. **Enable compression (future feature):**
   ```toml
   [network]
   compression = "lz4"
   ```

---

## 6. Platform-Specific Issues

### macOS Issues

#### "Operation not permitted" on mount

```bash
# Grant Full Disk Access
System Preferences → Security & Privacy → Privacy → Full Disk Access
# Add: Terminal (or your terminal app)
```

#### macFUSE extension blocked

```bash
# After installing macFUSE:
System Preferences → Security & Privacy → General
# Click "Allow" for "Benjamin Fleischer" (macFUSE developer)
# Reboot
```

#### Finder not showing mounted folder

```bash
# Refresh Finder
killall Finder

# Or mount with Finder-visible option
wormhole mount <code> /Volumes/Wormhole --volname "Wormhole"
```

### Linux Issues

#### SELinux blocking FUSE

```bash
# Check SELinux status
getenforce

# Temporarily disable (for testing)
sudo setenforce 0

# Create permanent policy
sudo ausearch -m avc -ts recent | audit2allow -M wormhole
sudo semodule -i wormhole.pp
```

#### AppArmor blocking FUSE

```bash
# Check AppArmor status
sudo aa-status

# Add exception
sudo aa-complain /usr/bin/fusermount3
```

#### Systemd service not starting

```bash
# Check status
systemctl --user status wormhole

# Check logs
journalctl --user -u wormhole -f

# Enable lingering (for auto-start)
loginctl enable-linger $USER
```

### Windows Issues

#### WinFSP service not running

```powershell
# Check service
Get-Service -Name "WinFsp.Launcher"

# Start service
Start-Service -Name "WinFsp.Launcher"

# Set to automatic
Set-Service -Name "WinFsp.Launcher" -StartupType Automatic
```

#### Drive letter conflict

```powershell
# List used drive letters
Get-PSDrive -PSProvider FileSystem

# Use specific letter
wormhole mount <code> W:
```

#### Windows Defender blocking

```powershell
# Add exclusion
Add-MpPreference -ExclusionProcess "teleport-daemon.exe"
Add-MpPreference -ExclusionPath "C:\Users\$env:USERNAME\.cache\wormhole"
```

---

## 7. Error Code Reference

### Connection Errors (400-499)

| Code | Name | Meaning | Solution |
|------|------|---------|----------|
| 400 | SessionExpired | Session timed out | Reconnect |
| 401 | RateLimited | Too many requests | Wait and retry |
| 402 | HostShuttingDown | Host is stopping | Wait for host |
| 403 | AuthFailed | Wrong join code | Check code |
| 404 | RoomNotFound | Host not registered | Host needs to start |

### File Errors (100-199)

| Code | Name | Meaning | Solution |
|------|------|---------|----------|
| 100 | FileNotFound | File doesn't exist | Check path |
| 101 | NotADirectory | Expected directory | Check file type |
| 102 | NotAFile | Expected file | Check file type |
| 103 | PermissionDenied | No access | Check permissions |
| 104 | PathTraversal | Security violation | Don't use `..` |

### I/O Errors (200-299)

| Code | Name | Meaning | Solution |
|------|------|---------|----------|
| 200 | IoError | General I/O failure | Check logs |
| 201 | ChecksumMismatch | Data corruption | Retry transfer |
| 202 | ChunkOutOfRange | Invalid offset | Bug - file issue |

### Lock Errors (300-399)

| Code | Name | Meaning | Solution |
|------|------|---------|----------|
| 300 | LockNotHeld | No lock owned | Acquire lock first |
| 301 | LockExpired | Lock timed out | Reacquire lock |
| 302 | LockConflict | Another user has lock | Wait or force |

---

## 8. Debug Mode

### Enable Full Debug Logging

```bash
# Environment variable
RUST_LOG=teleport_daemon=trace,teleport_core=debug wormhole host ./folder

# Or in config
[log]
level = "trace"
format = "pretty"
file = "/tmp/wormhole-debug.log"
```

### Network Packet Capture

```bash
# Capture QUIC traffic
sudo tcpdump -i any -w wormhole.pcap udp port <port>

# Analyze with Wireshark
wireshark wormhole.pcap
```

### FUSE Debug Mode

```bash
# Linux - FUSE debug output
wormhole mount <code> /mnt/wormhole -- -d -f

# macOS - similar
wormhole mount <code> /Volumes/Wormhole -- -d -f
```

### Generate Debug Report

```bash
wormhole debug-report > debug-report.txt
```

This includes:
- System information
- Configuration (secrets redacted)
- Recent logs
- Network diagnostics
- Cache statistics

---

## 9. Getting Help

### Before Asking for Help

1. **Check this guide** - Search for your error
2. **Check GitHub Issues** - Someone may have the same problem
3. **Run diagnostics** - `wormhole doctor`
4. **Gather logs** - `wormhole debug-report`

### Filing a Bug Report

Include:
- Operating system and version
- Wormhole version (`wormhole --version`)
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs (redact sensitive info)
- Output of `wormhole doctor`

### Community Support

| Channel | Best For |
|---------|----------|
| GitHub Issues | Bug reports, feature requests |
| GitHub Discussions | Questions, help |
| Discord | Real-time chat |

### Emergency Recovery

If Wormhole is stuck and nothing works:

```bash
# Kill all Wormhole processes
pkill -9 teleport

# Force unmount
fusermount -uz /mnt/wormhole 2>/dev/null
sudo umount -l /mnt/wormhole 2>/dev/null

# Clear all caches
rm -rf ~/.cache/wormhole
rm -rf ~/.local/share/wormhole

# Restart fresh
wormhole host ./folder
```
