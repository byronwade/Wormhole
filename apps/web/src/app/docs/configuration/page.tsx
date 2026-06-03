import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Link from "next/link";
import {
  Settings,
  FileCode,
  Info,
  ArrowRight,
} from "lucide-react";

export const metadata = {
  title: "Configuration - Wormhole Documentation",
  description: "Complete configuration reference for Wormhole. Config file format, all options, and example configurations.",
};

export default function ConfigurationPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <Badge className="bg-wormhole-hunter/20 text-wormhole-hunter-light border-wormhole-hunter/40">
          Configuration
        </Badge>
        <h1 className="text-4xl font-bold text-white tracking-tight">
          Configuration Reference
        </h1>
        <p className="text-xl text-zinc-400">
          Complete reference for Wormhole configuration file, environment variables, and all available options.
        </p>
      </div>

      {/* Config File Location */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Configuration File</h2>
        <p className="text-zinc-400">
          Wormhole reads its configuration from a TOML file. The location depends on your operating system:
        </p>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-2 text-zinc-400 font-medium">Platform</th>
                    <th className="text-left py-2 text-zinc-400 font-medium">Path</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 text-white">macOS</td>
                    <td className="py-2 font-mono text-xs">~/Library/Application Support/wormhole/config.toml</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 text-white">Linux</td>
                    <td className="py-2 font-mono text-xs">~/.config/wormhole/config.toml</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-white">Windows</td>
                    <td className="py-2 font-mono text-xs">%APPDATA%\wormhole\config.toml</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
              <span className="text-xs text-zinc-500 font-mono">Terminal</span>
            </div>
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# View config file path
$ wormhole config path
/Users/you/.config/wormhole/config.toml

# Show current configuration
$ wormhole config show

# Edit config in your default editor
$ wormhole config edit`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Complete Configuration Example */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Complete Configuration Example</h2>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
              <span className="text-xs text-zinc-500 font-mono">config.toml</span>
            </div>
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# Wormhole Configuration
# All values shown are defaults unless noted

# ============================================
# HOST SETTINGS
# ============================================
[host]
# Default QUIC listening port
port = 4433

# Bind address (0.0.0.0 = all interfaces)
bind = "0.0.0.0"

# Allow clients to write files (default: read-only)
writable = false

# Auto-generate TLS certificates
auto_cert = true

# Maximum concurrent client connections
max_connections = 10

# Share name shown to clients (optional)
# name = "My Share"

# ============================================
# CLIENT SETTINGS
# ============================================
[client]
# Default mount point (optional - prompts if not set)
# mount_point = "/mnt/wormhole"

# Number of chunks to prefetch for sequential reads
read_ahead_chunks = 4

# Attribute cache TTL in seconds
attr_ttl_secs = 1

# Directory listing cache TTL in seconds
dir_ttl_secs = 1

# How often to sync dirty chunks to host (for writes)
sync_interval_secs = 1

# Auto-reconnect on connection loss
auto_reconnect = true

# Maximum reconnection attempts (0 = infinite)
max_reconnect_attempts = 0

# ============================================
# CACHE SETTINGS
# ============================================
[cache]
# Maximum disk cache size in bytes (10 GB)
max_disk_bytes = 10737418240

# Maximum RAM cache size in bytes (512 MB)
max_ram_bytes = 536870912

# Custom cache directory (optional)
# cache_dir = "/path/to/cache"

# Cached chunk TTL in seconds (1 hour)
chunk_ttl_secs = 3600

# Garbage collection interval in seconds
gc_interval_secs = 60

# Enable secure deletion (overwrites data before removing)
secure_delete = false

# ============================================
# SIGNAL SERVER SETTINGS
# ============================================
[signal]
# Signal server port
port = 8080

# Signal server bind address
bind = "0.0.0.0"

# SQLite database path for persistence (in-memory if not set)
# db_path = "/var/lib/wormhole/signal.db"

# Idle room cleanup timeout in seconds
room_idle_timeout_secs = 300

# Maximum peers allowed per room
max_peers_per_room = 10

# Public URL for clients (optional, for behind load balancer)
# public_url = "wss://signal.example.com"

# Enable rate limiting
rate_limit = true

# Requests per minute per IP
rate_limit_rpm = 60

# ============================================
# NETWORK SETTINGS
# ============================================
[network]
# Connection timeout in seconds
connect_timeout_secs = 10

# Request timeout in seconds
request_timeout_secs = 30

# Keep-alive interval in seconds
keepalive_secs = 15

# Maximum concurrent QUIC streams
max_streams = 100

# Enable QUIC 0-RTT for faster reconnects
enable_0rtt = false

# Default signal server URL
signal_server = "ws://localhost:8080"

# STUN servers for NAT traversal
stun_servers = [
  "stun.l.google.com:19302",
  "stun1.l.google.com:19302"
]

# ============================================
# LOGGING SETTINGS
# ============================================
[logging]
# Log level: trace, debug, info, warn, error
level = "info"

# Log file path (optional - stdout if not set)
# file = "/var/log/wormhole.log"

# Log format: pretty, json, compact
format = "pretty"

# Include timestamps
timestamps = true

# ============================================
# UI SETTINGS (Desktop App)
# ============================================
[ui]
# Start minimized to system tray
start_minimized = false

# Show system tray icon
show_tray = true

# Start on system boot
start_on_boot = false

# Check for updates automatically
auto_update_check = true

# Theme: system, light, dark
theme = "system"`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Configuration Sections */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Configuration Sections</h2>

        <div className="grid sm:grid-cols-2 gap-4">
          <Link href="/docs/configuration/cache">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-wormhole-hunter/50 transition-colors h-full">
              <CardContent className="p-6">
                <h3 className="font-semibold text-white mb-1">[cache]</h3>
                <p className="text-sm text-zinc-400">RAM and disk cache settings, TTL, garbage collection</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/docs/configuration/network">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-wormhole-hunter/50 transition-colors h-full">
              <CardContent className="p-6">
                <h3 className="font-semibold text-white mb-1">[network]</h3>
                <p className="text-sm text-zinc-400">Timeouts, QUIC settings, signal server, STUN</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/docs/configuration/env">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-wormhole-hunter/50 transition-colors h-full">
              <CardContent className="p-6">
                <h3 className="font-semibold text-white mb-1">Environment Variables</h3>
                <p className="text-sm text-zinc-400">Override config with env vars, useful for containers</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/docs/configuration/examples">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-wormhole-hunter/50 transition-colors h-full">
              <CardContent className="p-6">
                <h3 className="font-semibold text-white mb-1">Example Configurations</h3>
                <p className="text-sm text-zinc-400">Pre-built configs for common scenarios</p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </section>

      {/* CLI Config Commands */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">CLI Config Commands</h2>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# Show current configuration
$ wormhole config show
[host]
port = 4433
bind = "0.0.0.0"
...

# Show config with secrets visible
$ wormhole config show --show-secrets

# Get a specific value
$ wormhole config get cache.max_disk_bytes
10737418240

# Set a value
$ wormhole config set cache.max_disk_bytes 21474836480
Updated cache.max_disk_bytes = 21474836480

# Reset to defaults
$ wormhole config reset
Reset configuration to defaults? [y/N]: y
Configuration reset.

# Reset a specific key
$ wormhole config reset --key cache.max_disk_bytes

# Edit in your editor ($EDITOR)
$ wormhole config edit

# Import configuration from file
$ wormhole config import ~/wormhole-config.toml

# Export configuration
$ wormhole config export ~/wormhole-backup.toml`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Environment Variables */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Environment Variables</h2>
        <p className="text-zinc-400">
          Environment variables override config file settings. Useful for Docker deployments and CI/CD.
        </p>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-2 text-zinc-400 font-medium">Variable</th>
                    <th className="text-left py-2 text-zinc-400 font-medium">Description</th>
                    <th className="text-left py-2 text-zinc-400 font-medium">Example</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-wormhole-hunter-light">WORMHOLE_CONFIG</td>
                    <td className="py-2">Config file path</td>
                    <td className="py-2 font-mono text-xs">/etc/wormhole/config.toml</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-wormhole-hunter-light">WORMHOLE_CACHE_DIR</td>
                    <td className="py-2">Cache directory</td>
                    <td className="py-2 font-mono text-xs">/var/cache/wormhole</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-wormhole-hunter-light">WORMHOLE_LOG_LEVEL</td>
                    <td className="py-2">Logging level</td>
                    <td className="py-2 font-mono text-xs">debug</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-wormhole-hunter-light">WORMHOLE_SIGNAL_SERVER</td>
                    <td className="py-2">Signal server URL</td>
                    <td className="py-2 font-mono text-xs">wss://signal.example.com</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-wormhole-hunter-light">WORMHOLE_HOST_PORT</td>
                    <td className="py-2">Default host port</td>
                    <td className="py-2 font-mono text-xs">5000</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-wormhole-hunter-light">WORMHOLE_CACHE_RAM_MB</td>
                    <td className="py-2">RAM cache size (MB)</td>
                    <td className="py-2 font-mono text-xs">1024</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-wormhole-hunter-light">WORMHOLE_CACHE_DISK_GB</td>
                    <td className="py-2">Disk cache size (GB)</td>
                    <td className="py-2 font-mono text-xs">20</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-mono text-wormhole-hunter-light">RUST_LOG</td>
                    <td className="py-2">Detailed Rust logging</td>
                    <td className="py-2 font-mono text-xs">wormhole=debug,quinn=info</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
              <span className="text-xs text-zinc-500 font-mono">Example: Docker Compose</span>
            </div>
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`services:
  wormhole:
    image: wormhole/daemon:latest
    environment:
      - WORMHOLE_LOG_LEVEL=info
      - WORMHOLE_CACHE_DISK_GB=50
      - WORMHOLE_SIGNAL_SERVER=wss://signal.mycompany.com
    volumes:
      - ./data:/data
      - ./cache:/var/cache/wormhole`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Priority Order */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Configuration Priority</h2>
        <p className="text-zinc-400">
          Configuration values are resolved in this order (highest priority first):
        </p>

        <ol className="list-decimal list-inside space-y-2 text-zinc-400">
          <li><strong className="text-white">Command-line flags</strong> (<code className="bg-zinc-800 px-1 rounded">--port 5000</code>)</li>
          <li><strong className="text-white">Environment variables</strong> (<code className="bg-zinc-800 px-1 rounded">WORMHOLE_HOST_PORT=5000</code>)</li>
          <li><strong className="text-white">Config file</strong> (<code className="bg-zinc-800 px-1 rounded">~/.config/wormhole/config.toml</code>)</li>
          <li><strong className="text-white">Built-in defaults</strong></li>
        </ol>
      </section>

      {/* Next Steps */}
      <section className="space-y-4 pt-8 border-t border-zinc-800">
        <h2 className="text-2xl font-bold text-white">See Also</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/docs/configuration/examples" className="text-wormhole-hunter-light hover:underline">Example Configurations</Link>
          <span className="text-zinc-600">•</span>
          <Link href="/docs/cli/config" className="text-wormhole-hunter-light hover:underline">CLI config command</Link>
          <span className="text-zinc-600">•</span>
          <Link href="/docs/self-hosting" className="text-wormhole-hunter-light hover:underline">Self-Hosting Guide</Link>
        </div>
      </section>
    </div>
  );
}
