# Wormhole User Guide

Welcome to Wormhole! This guide will help you share folders between computers instantly.

---

## Table of Contents

1. [What is Wormhole?](#1-what-is-wormhole)
2. [Installation](#2-installation)
3. [Quick Start](#3-quick-start)
4. [Sharing a Folder (Hosting)](#4-sharing-a-folder-hosting)
5. [Accessing a Shared Folder (Mounting)](#5-accessing-a-shared-folder-mounting)
6. [Desktop App](#6-desktop-app)
7. [Advanced Features](#7-advanced-features)
8. [FAQ](#8-faq)
9. [Getting Help](#9-getting-help)

---

## 1. What is Wormhole?

Wormhole lets you **share any folder** from your computer and **access it from another computer** as if it were a local drive.

### Key Benefits

| Feature | What It Means |
|---------|---------------|
| **Instant Access** | No uploading, no waiting |
| **No Cloud** | Files stay on your computer |
| **Free** | No subscriptions, no limits |
| **Secure** | End-to-end encrypted |
| **Simple** | Share a code, that's it |

### How It Works

```
Your Computer                    Other Computer
┌─────────────┐                  ┌─────────────┐
│  /renders   │ ───── Code ────► │  /mnt/remote│
│  └─video.mp4│     7KJM-XBCD    │  └─video.mp4│
└─────────────┘                  └─────────────┘
     Host                             Client
```

1. You choose a folder to share
2. Wormhole generates a **join code**
3. You share the code with someone
4. They enter the code and access your folder

---

## 2. Installation

### macOS

**Option A: Homebrew (Recommended)**
```bash
brew install wormhole
```

**Option B: Download**
1. Go to [wormhole.dev/download](https://wormhole.dev/download)
2. Download the `.dmg` file
3. Drag Wormhole to Applications
4. First launch: Right-click → Open (to bypass Gatekeeper)

**Required: macFUSE**
```bash
brew install macfuse
# Then: System Preferences → Security & Privacy → Allow
# Restart your Mac
```

### Windows

**Option A: Winget**
```powershell
winget install wormhole
```

**Option B: Download**
1. Go to [wormhole.dev/download](https://wormhole.dev/download)
2. Download the `.msi` installer
3. Run the installer
4. Follow the prompts

**Required: WinFSP**
- Download from [winfsp.dev](https://winfsp.dev/)
- Run installer as Administrator

### Linux

**Debian/Ubuntu:**
```bash
sudo apt install wormhole
```

**Fedora:**
```bash
sudo dnf install wormhole
```

**Arch:**
```bash
yay -S wormhole
```

**Required: FUSE**
```bash
sudo apt install fuse3 libfuse3-dev  # Debian/Ubuntu
sudo dnf install fuse3 fuse3-devel    # Fedora
```

---

## 3. Quick Start

### Share a Folder (30 seconds)

```bash
# Terminal
wormhole host ~/Downloads/project-files
```

Output:
```
Sharing: /Users/you/Downloads/project-files
Join code: 7KJM-XBCD-QRST-VWYZ

Share this code with others to let them access your folder.
Press Ctrl+C to stop sharing.
```

### Access a Shared Folder (30 seconds)

```bash
# On another computer
wormhole mount 7KJM-XBCD-QRST-VWYZ ~/remote-files
```

Output:
```
Connecting to host...
Connected! Mounted at: /Users/you/remote-files

The shared folder is now available at ~/remote-files
```

**That's it!** The shared folder now appears as a local folder.

---

## 4. Sharing a Folder (Hosting)

### Using the Desktop App

1. **Open Wormhole**
2. **Click "Share a Folder"**
3. **Select the folder** you want to share
4. **Copy the code** that appears
5. **Send the code** to whoever needs access

### Using the Command Line

```bash
# Basic sharing
wormhole host /path/to/folder

# Share with a specific port (for firewall rules)
wormhole host /path/to/folder --port 51820

# Read-only sharing (no one can modify files)
wormhole host /path/to/folder --read-only

# Share with custom name
wormhole host /path/to/folder --name "Project Assets"
```

### What Gets Shared

| Included | Not Included |
|----------|--------------|
| All files in the folder | Files outside the folder |
| Subfolders | Hidden system files (optional) |
| File metadata (size, dates) | Your other folders |

### Security Notes

- Only files in the selected folder are accessible
- The join code is like a password - only share with trusted people
- Stop sharing anytime by closing Wormhole or pressing Ctrl+C

---

## 5. Accessing a Shared Folder (Mounting)

### Using the Desktop App

1. **Open Wormhole**
2. **Click "Connect to Share"**
3. **Enter the join code** you received
4. **Choose where to mount** (where to access the files)
5. **Click Connect**

### Using the Command Line

```bash
# Basic mount
wormhole mount XXXX-XXXX-XXXX-XXXX /path/to/mountpoint

# Mount to a specific location
wormhole mount XXXX-XXXX-XXXX-XXXX ~/Desktop/shared-project

# Mount with caching disabled (always fetch fresh)
wormhole mount XXXX-XXXX-XXXX-XXXX ~/remote --no-cache
```

### Accessing Files

Once mounted, use the folder normally:

```bash
# List files
ls ~/remote-files

# Open in Finder/Explorer
open ~/remote-files          # macOS
explorer ~/remote-files      # Windows
nautilus ~/remote-files      # Linux

# Copy files locally
cp ~/remote-files/video.mp4 ~/Downloads/

# Open files directly
vlc ~/remote-files/video.mp4
code ~/remote-files/project/
```

### Unmounting

```bash
# Command line
wormhole unmount ~/remote-files

# Or just close the Wormhole app
# Or press Ctrl+C in the terminal
```

---

## 6. Desktop App

### Main Screen

```
┌─────────────────────────────────────────┐
│  WORMHOLE                          ─ □ X│
├─────────────────────────────────────────┤
│                                         │
│   ┌─────────────┐  ┌─────────────┐     │
│   │   Share a   │  │  Connect    │     │
│   │   Folder    │  │  to Share   │     │
│   └─────────────┘  └─────────────┘     │
│                                         │
│   ─────────────────────────────────     │
│   Active Shares                         │
│   └ /renders (3 connected)              │
│                                         │
│   Connected Shares                      │
│   └ Sarah's MacBook → /mnt/remote       │
│                                         │
└─────────────────────────────────────────┘
```

### System Tray

Wormhole runs in your system tray for quick access:

- **Green dot**: Active connection
- **Right-click**: Quick actions
  - Share a folder
  - Connect to share
  - View active shares
  - Settings
  - Quit

### Settings

| Setting | Description |
|---------|-------------|
| **Start on login** | Launch Wormhole when you log in |
| **Minimize to tray** | Keep running when window is closed |
| **Cache size** | How much disk space for cached files |
| **Default mount location** | Where to mount shares |
| **Notifications** | Alert when peers connect/disconnect |

---

## 7. Advanced Features

### Offline Access (Cached Files)

Wormhole caches files you access. If you lose connection:
- Recently accessed files still work
- Changes sync when reconnected

Configure cache size:
```bash
# Set cache to 20GB
wormhole config set cache.l2_max_size 21474836480
```

### Multiple Shares

You can share multiple folders:

```bash
# Share folder 1
wormhole host ~/renders &

# Share folder 2
wormhole host ~/assets &
```

### Reconnection

If the connection drops:
- Wormhole automatically reconnects
- Cached files remain available
- No data loss

### Performance Tips

| Scenario | Tip |
|----------|-----|
| **Large files** | Works great - streaming, no wait |
| **Many small files** | Enable prefetching in settings |
| **Slow network** | Increase cache size |
| **Video editing** | SSD cache recommended |

### Network Requirements

| Scenario | Requirements |
|----------|--------------|
| **Same network** | Just works |
| **Different networks** | Requires signal server (automatic) |
| **Behind corporate firewall** | May need IT assistance |

---

## 8. FAQ

### General Questions

**Q: Is Wormhole free?**
A: Yes! The core features are free forever. We offer paid plans for teams who need extra features like analytics and admin controls.

**Q: Where are my files stored?**
A: Your files stay on your computer. Wormhole doesn't upload anything to the cloud.

**Q: Is it secure?**
A: Yes. All data is encrypted end-to-end. Only people with the join code can access your files.

**Q: Can I use Wormhole offline?**
A: You need a connection to access remote files, but cached files work offline.

### Sharing Questions

**Q: Who can see my shared folder?**
A: Only people who have the join code. The code is like a password.

**Q: Can I stop someone from accessing my share?**
A: Yes. Stop sharing (Ctrl+C or close the app) and start again to get a new code.

**Q: Can multiple people connect at once?**
A: Yes! Multiple people can access the same shared folder.

**Q: Can they modify my files?**
A: By default, yes. Use `--read-only` to prevent modifications.

### Connection Questions

**Q: Why can't I connect?**
A: Check that:
1. The host is still sharing (code is visible)
2. You entered the code correctly (case-sensitive)
3. Both computers have internet access

**Q: Is there a file size limit?**
A: No! Wormhole handles files of any size.

**Q: Why is it slow?**
A: Speed depends on:
1. Your internet connection
2. The host's internet connection
3. Distance between computers

### Technical Questions

**Q: What ports does Wormhole use?**
A: Wormhole uses QUIC over UDP. Ports are assigned automatically.

**Q: Does it work behind NAT?**
A: Yes! Wormhole includes NAT traversal to work across most networks.

**Q: Can I use it on my phone?**
A: Not yet. Desktop only for now (macOS, Windows, Linux).

---

## 9. Getting Help

### In-App Help

- Click the **?** icon in the app
- Or run `wormhole help` in terminal

### Troubleshooting

Common issues and solutions:

| Issue | Solution |
|-------|----------|
| "FUSE not found" | Install macFUSE/WinFSP/fuse3 |
| "Connection refused" | Check if host is still sharing |
| "Permission denied" | Check mount point permissions |
| "Mount point busy" | Unmount first: `wormhole unmount` |

For more, see the [Troubleshooting Guide](development/06-troubleshooting.md).

### Community Support

- **GitHub Issues**: Report bugs, request features
- **GitHub Discussions**: Ask questions, share tips
- **Discord**: Real-time chat with the community

### Contact

- **Email**: support@wormhole.dev
- **Twitter**: @wormholedev

---

## Quick Reference Card

```
SHARING (HOST)
──────────────────────────────────
wormhole host <folder>           # Share a folder
wormhole host <folder> --read-only  # Read-only share
Ctrl+C                           # Stop sharing

CONNECTING (CLIENT)
──────────────────────────────────
wormhole mount <code> <path>     # Mount a share
wormhole unmount <path>          # Unmount
wormhole status                  # Show connections

COMMON OPTIONS
──────────────────────────────────
--help                           # Show help
--version                        # Show version
--verbose                        # More output

EXAMPLE SESSION
──────────────────────────────────
# On your computer:
$ wormhole host ~/renders
Join code: 7KJM-XBCD-QRST-VWYZ

# On their computer:
$ wormhole mount 7KJM-XBCD-QRST-VWYZ ~/remote
Connected! Files available at ~/remote
```

---

**Happy sharing!** 🌀
