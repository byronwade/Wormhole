# Configuration Schema Specification

This document defines the complete configuration schema for Wormhole, including all options, defaults, validation rules, and environment variable overrides.

---

## Table of Contents

1. [Configuration Files](#1-configuration-files)
2. [Complete Schema](#2-complete-schema)
3. [Environment Variables](#3-environment-variables)
4. [Validation Rules](#4-validation-rules)
5. [Default Values](#5-default-values)
6. [Platform-Specific Defaults](#6-platform-specific-defaults)
7. [Migration Guide](#7-migration-guide)

---

## 1. Configuration Files

### File Locations

| Platform | User Config | System Config |
|----------|-------------|---------------|
| **Linux** | `~/.config/wormhole/config.toml` | `/etc/wormhole/config.toml` |
| **macOS** | `~/Library/Application Support/Wormhole/config.toml` | `/Library/Application Support/Wormhole/config.toml` |
| **Windows** | `%APPDATA%\Wormhole\config.toml` | `%PROGRAMDATA%\Wormhole\config.toml` |

### Load Order (Highest Priority First)

1. Command-line arguments
2. Environment variables (`WORMHOLE_*`)
3. User config file
4. System config file
5. Built-in defaults

### File Format

```toml
# Wormhole Configuration
# All values shown are defaults unless otherwise noted

[network]
signal_url = "wss://wormhole-signal.fly.dev"
timeout_ms = 30000
keepalive_ms = 10000

[cache]
l1_size = 268435456  # 256 MB
l2_path = ""  # Platform default
l2_max_size = 10737418240  # 10 GB

[log]
level = "info"
format = "pretty"

[security]
verify_checksums = true

[ui]
start_on_login = false
minimize_to_tray = true
```

---

## 2. Complete Schema

### Network Configuration

```toml
[network]
# Signal server URL for NAT traversal
# Type: String (URL)
# Required: No
# Default: "wss://wormhole-signal.fly.dev"
signal_url = "wss://wormhole-signal.fly.dev"

# Connection timeout in milliseconds
# Type: Integer (1000-300000)
# Required: No
# Default: 30000 (30 seconds)
timeout_ms = 30000

# Keep-alive interval in milliseconds
# Type: Integer (1000-60000)
# Required: No
# Default: 10000 (10 seconds)
keepalive_ms = 10000

# Idle timeout before disconnecting (milliseconds)
# Type: Integer (10000-3600000)
# Required: No
# Default: 60000 (1 minute)
idle_timeout_ms = 60000

# Maximum concurrent QUIC streams per connection
# Type: Integer (1-1000)
# Required: No
# Default: 100
max_streams = 100

# Enable IPv6
# Type: Boolean
# Required: No
# Default: true
ipv6_enabled = true

# Prefer IPv6 over IPv4 when both available
# Type: Boolean
# Required: No
# Default: false
prefer_ipv6 = false

# STUN servers for NAT detection
# Type: Array of Strings (URLs)
# Required: No
# Default: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"]
stun_servers = [
    "stun:stun.l.google.com:19302",
    "stun:stun.cloudflare.com:3478"
]

# Bind to specific address (empty = all interfaces)
# Type: String (IP address)
# Required: No
# Default: "" (0.0.0.0)
bind_address = ""

# Bind to specific port (0 = random)
# Type: Integer (0-65535)
# Required: No
# Default: 0
bind_port = 0
```

### Cache Configuration

```toml
[cache]
# L1 (RAM) cache size in bytes
# Type: Integer (0-17179869184, max 16GB)
# Required: No
# Default: 268435456 (256 MB)
# Note: 0 disables L1 cache
l1_size = 268435456

# L2 (disk) cache directory
# Type: String (path)
# Required: No
# Default: Platform-specific (see Platform Defaults)
# Supports: ~ for home directory
l2_path = ""

# L2 (disk) cache maximum size in bytes
# Type: Integer (0-1099511627776, max 1TB)
# Required: No
# Default: 10737418240 (10 GB)
# Note: 0 disables L2 cache
l2_max_size = 10737418240

# Enable automatic prefetching
# Type: Boolean
# Required: No
# Default: true
prefetch_enabled = true

# Number of chunks to prefetch ahead
# Type: Integer (0-16)
# Required: No
# Default: 4
prefetch_lookahead = 4

# Cache entry TTL in seconds (0 = infinite)
# Type: Integer (0-86400)
# Required: No
# Default: 300 (5 minutes)
ttl_seconds = 300

# Attribute cache TTL in seconds
# Type: Integer (0-3600)
# Required: No
# Default: 1
attr_ttl_seconds = 1

# Directory listing cache TTL in seconds
# Type: Integer (0-3600)
# Required: No
# Default: 1
dir_ttl_seconds = 1

# Garbage collection interval in seconds
# Type: Integer (60-86400)
# Required: No
# Default: 300 (5 minutes)
gc_interval_seconds = 300
```

### Logging Configuration

```toml
[log]
# Log level
# Type: String (trace, debug, info, warn, error)
# Required: No
# Default: "info"
level = "info"

# Log format
# Type: String (pretty, json, compact)
# Required: No
# Default: "pretty"
format = "pretty"

# Log to file (empty = stderr only)
# Type: String (path)
# Required: No
# Default: "" (no file logging)
file = ""

# Maximum log file size in bytes before rotation
# Type: Integer (1048576-1073741824)
# Required: No
# Default: 10485760 (10 MB)
max_file_size = 10485760

# Number of rotated log files to keep
# Type: Integer (0-100)
# Required: No
# Default: 5
max_files = 5

# Include timestamps
# Type: Boolean
# Required: No
# Default: true
timestamps = true

# Include source location (file:line)
# Type: Boolean
# Required: No
# Default: false (true in debug builds)
source_location = false
```

### Security Configuration

```toml
[security]
# Verify chunk checksums
# Type: Boolean
# Required: No
# Default: true
# Warning: Disabling reduces security
verify_checksums = true

# Allowed paths for hosting (glob patterns)
# Type: Array of Strings
# Required: No
# Default: [] (all paths allowed)
# Example: ["/home/*/shared", "/mnt/data"]
allowed_host_paths = []

# Blocked paths for hosting (glob patterns)
# Type: Array of Strings
# Required: No
# Default: ["**/.git", "**/node_modules", "**/.env*"]
blocked_host_paths = ["**/.git", "**/node_modules", "**/.env*"]

# Maximum file size to serve (0 = unlimited)
# Type: Integer (bytes)
# Required: No
# Default: 0
max_file_size = 0

# Read-only mode (no writes allowed)
# Type: Boolean
# Required: No
# Default: false
read_only = false

# Require join code confirmation for new connections
# Type: Boolean
# Required: No
# Default: true
confirm_new_peers = true
```

### Host Configuration

```toml
[host]
# Maximum concurrent clients
# Type: Integer (1-1000)
# Required: No
# Default: 100
max_clients = 100

# Scanner: follow symlinks
# Type: Boolean
# Required: No
# Default: false
follow_symlinks = false

# Scanner: include hidden files (dot files)
# Type: Boolean
# Required: No
# Default: true
include_hidden = true

# Scanner: maximum directory depth (0 = unlimited)
# Type: Integer (0-100)
# Required: No
# Default: 0
max_depth = 0

# Scanner: exclude patterns (glob)
# Type: Array of Strings
# Required: No
# Default: []
exclude_patterns = []

# Rescan interval in seconds (0 = manual only)
# Type: Integer (0-3600)
# Required: No
# Default: 0
rescan_interval = 0
```

### Client Configuration

```toml
[client]
# Default mount point (empty = ask user)
# Type: String (path)
# Required: No
# Default: ""
default_mount_point = ""

# Automatically reconnect on disconnect
# Type: Boolean
# Required: No
# Default: true
auto_reconnect = true

# Maximum reconnection attempts
# Type: Integer (0-100)
# Required: No
# Default: 5
max_reconnect_attempts = 5

# Open mounted folder after connect
# Type: Boolean
# Required: No
# Default: true
open_on_mount = true
```

### UI Configuration

```toml
[ui]
# Start on system login
# Type: Boolean
# Required: No
# Default: false
start_on_login = false

# Minimize to system tray when closed
# Type: Boolean
# Required: No
# Default: true
minimize_to_tray = true

# Show notifications
# Type: Boolean
# Required: No
# Default: true
notifications = true

# Show in menu bar (macOS) / system tray
# Type: Boolean
# Required: No
# Default: true
show_in_tray = true

# Theme (system, light, dark)
# Type: String
# Required: No
# Default: "system"
theme = "system"

# Language (auto = system language)
# Type: String (ISO 639-1 code)
# Required: No
# Default: "auto"
language = "auto"

# Show transfer speed in tray icon
# Type: Boolean
# Required: No
# Default: false
tray_show_speed = false
```

---

## 3. Environment Variables

All configuration options can be overridden via environment variables.

### Naming Convention

```
WORMHOLE_<SECTION>_<KEY>=<VALUE>

Examples:
WORMHOLE_NETWORK_SIGNAL_URL=wss://custom.server.com
WORMHOLE_CACHE_L1_SIZE=536870912
WORMHOLE_LOG_LEVEL=debug
WORMHOLE_SECURITY_READ_ONLY=true
```

### Type Conversion

| TOML Type | Environment Value |
|-----------|-------------------|
| String | As-is |
| Integer | Decimal number |
| Boolean | `true`, `false`, `1`, `0` |
| Array | Comma-separated values |

### Special Variables

```bash
# Override config file location
WORMHOLE_CONFIG=/path/to/config.toml

# Enable debug mode (sets log level to debug)
WORMHOLE_DEBUG=1

# Disable all network (offline mode)
WORMHOLE_OFFLINE=1
```

---

## 4. Validation Rules

### Schema Validation

```rust
use serde::{Deserialize, Serialize};
use validator::{Validate, ValidationError};

#[derive(Deserialize, Serialize, Validate)]
pub struct NetworkConfig {
    #[validate(url)]
    pub signal_url: String,

    #[validate(range(min = 1000, max = 300000))]
    pub timeout_ms: u64,

    #[validate(range(min = 1000, max = 60000))]
    pub keepalive_ms: u64,

    #[validate(range(min = 1, max = 1000))]
    pub max_streams: u32,

    #[validate(custom = "validate_stun_servers")]
    pub stun_servers: Vec<String>,
}

#[derive(Deserialize, Serialize, Validate)]
pub struct CacheConfig {
    #[validate(range(max = 17179869184))]  // 16 GB
    pub l1_size: u64,

    #[validate(custom = "validate_path")]
    pub l2_path: String,

    #[validate(range(max = 1099511627776))]  // 1 TB
    pub l2_max_size: u64,

    #[validate(range(max = 16))]
    pub prefetch_lookahead: u32,
}

fn validate_path(path: &str) -> Result<(), ValidationError> {
    if path.is_empty() {
        return Ok(());  // Empty = use default
    }
    let expanded = shellexpand::tilde(path);
    let path = Path::new(expanded.as_ref());
    if path.is_absolute() || path.starts_with("~") {
        Ok(())
    } else {
        Err(ValidationError::new("path must be absolute or start with ~"))
    }
}

fn validate_stun_servers(servers: &[String]) -> Result<(), ValidationError> {
    for server in servers {
        if !server.starts_with("stun:") {
            return Err(ValidationError::new("STUN server must start with stun:"));
        }
    }
    Ok(())
}
```

### Value Constraints

| Field | Min | Max | Special |
|-------|-----|-----|---------|
| `timeout_ms` | 1000 | 300000 | - |
| `keepalive_ms` | 1000 | 60000 | Must be < timeout_ms |
| `l1_size` | 0 | 16 GB | 0 disables |
| `l2_max_size` | 0 | 1 TB | 0 disables |
| `prefetch_lookahead` | 0 | 16 | 0 disables |
| `max_clients` | 1 | 1000 | - |
| `max_streams` | 1 | 1000 | - |

---

## 5. Default Values

### Complete Defaults

```toml
[network]
signal_url = "wss://wormhole-signal.fly.dev"
timeout_ms = 30000
keepalive_ms = 10000
idle_timeout_ms = 60000
max_streams = 100
ipv6_enabled = true
prefer_ipv6 = false
stun_servers = ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"]
bind_address = ""
bind_port = 0

[cache]
l1_size = 268435456  # 256 MB
l2_path = ""  # Platform default
l2_max_size = 10737418240  # 10 GB
prefetch_enabled = true
prefetch_lookahead = 4
ttl_seconds = 300
attr_ttl_seconds = 1
dir_ttl_seconds = 1
gc_interval_seconds = 300

[log]
level = "info"
format = "pretty"
file = ""
max_file_size = 10485760
max_files = 5
timestamps = true
source_location = false

[security]
verify_checksums = true
allowed_host_paths = []
blocked_host_paths = ["**/.git", "**/node_modules", "**/.env*"]
max_file_size = 0
read_only = false
confirm_new_peers = true

[host]
max_clients = 100
follow_symlinks = false
include_hidden = true
max_depth = 0
exclude_patterns = []
rescan_interval = 0

[client]
default_mount_point = ""
auto_reconnect = true
max_reconnect_attempts = 5
open_on_mount = true

[ui]
start_on_login = false
minimize_to_tray = true
notifications = true
show_in_tray = true
theme = "system"
language = "auto"
tray_show_speed = false
```

---

## 6. Platform-Specific Defaults

### L2 Cache Path

| Platform | Default Path |
|----------|--------------|
| Linux | `~/.cache/wormhole` |
| macOS | `~/Library/Caches/Wormhole` |
| Windows | `%LOCALAPPDATA%\Wormhole\Cache` |

### Log File Path

| Platform | Default Path (when enabled) |
|----------|------------------------------|
| Linux | `~/.local/share/wormhole/logs/wormhole.log` |
| macOS | `~/Library/Logs/Wormhole/wormhole.log` |
| Windows | `%LOCALAPPDATA%\Wormhole\Logs\wormhole.log` |

### Implementation

```rust
pub fn default_l2_path() -> PathBuf {
    #[cfg(target_os = "linux")]
    {
        dirs::cache_dir()
            .unwrap_or_else(|| PathBuf::from("~/.cache"))
            .join("wormhole")
    }

    #[cfg(target_os = "macos")]
    {
        dirs::cache_dir()
            .unwrap_or_else(|| PathBuf::from("~/Library/Caches"))
            .join("Wormhole")
    }

    #[cfg(target_os = "windows")]
    {
        dirs::cache_dir()
            .unwrap_or_else(|| PathBuf::from(r"%LOCALAPPDATA%"))
            .join("Wormhole")
            .join("Cache")
    }
}

pub fn default_log_path() -> PathBuf {
    #[cfg(target_os = "linux")]
    {
        dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("~/.local/share"))
            .join("wormhole/logs/wormhole.log")
    }

    #[cfg(target_os = "macos")]
    {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("~"))
            .join("Library/Logs/Wormhole/wormhole.log")
    }

    #[cfg(target_os = "windows")]
    {
        dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from(r"%LOCALAPPDATA%"))
            .join(r"Wormhole\Logs\wormhole.log")
    }
}
```

---

## 7. Migration Guide

### Version Compatibility

```rust
/// Config file version
pub const CONFIG_VERSION: u32 = 1;

#[derive(Deserialize)]
pub struct ConfigFile {
    /// Config version for migrations
    #[serde(default)]
    pub version: u32,

    #[serde(flatten)]
    pub config: Config,
}

impl ConfigFile {
    pub fn migrate(self) -> Result<Config, ConfigError> {
        let mut config = self.config;

        // Apply migrations based on version
        if self.version < 1 {
            // v0 -> v1: Rename old fields
            // (example migration)
        }

        Ok(config)
    }
}
```

### Breaking Changes Log

| Version | Change | Migration |
|---------|--------|-----------|
| v1 | Initial release | N/A |

### Config Validation on Load

```rust
pub fn load_config() -> Result<Config, ConfigError> {
    // Find config file
    let path = find_config_file()?;

    // Parse TOML
    let content = std::fs::read_to_string(&path)
        .map_err(|e| ConfigError::ReadError(path.clone(), e))?;

    let file: ConfigFile = toml::from_str(&content)
        .map_err(|e| ConfigError::ParseError(path.clone(), e))?;

    // Migrate if needed
    let config = file.migrate()?;

    // Validate
    config.validate()
        .map_err(|e| ConfigError::ValidationError(e))?;

    // Apply environment overrides
    let config = apply_env_overrides(config)?;

    Ok(config)
}
```
