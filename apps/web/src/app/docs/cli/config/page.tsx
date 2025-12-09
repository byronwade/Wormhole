import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Settings, Eye, Edit, RotateCcw, FileText, Download, Upload } from "lucide-react";

export const metadata = {
  title: "wormhole config - Wormhole CLI Reference",
  description: "View and modify Wormhole configuration settings.",
};

export default function ConfigCommandPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/docs/cli" className="hover:text-white">CLI Reference</Link>
          <span>/</span>
          <span className="text-zinc-400">config</span>
        </div>
        <h1 className="text-4xl font-bold text-white tracking-tight font-mono">
          wormhole config
        </h1>
        <p className="text-xl text-zinc-400">
          View and modify Wormhole configuration settings.
        </p>
      </div>

      {/* Synopsis */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Synopsis</h2>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-sm">
              <code className="text-green-400">wormhole config</code>
              <code className="text-zinc-400"> &lt;COMMAND&gt; [OPTIONS]</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Description */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Description</h2>
        <p className="text-zinc-300">
          Wormhole stores its configuration in a TOML file. The config command provides
          tools to view, modify, and manage these settings without manually editing files.
        </p>
        <p className="text-zinc-300">
          Configuration file location:
        </p>
        <ul className="list-disc list-inside text-zinc-300 space-y-1 ml-4">
          <li><strong>macOS:</strong> <code className="text-violet-400">~/.config/wormhole/config.toml</code></li>
          <li><strong>Linux:</strong> <code className="text-violet-400">~/.config/wormhole/config.toml</code></li>
          <li><strong>Windows:</strong> <code className="text-violet-400">%APPDATA%\wormhole\config.toml</code></li>
        </ul>
      </section>

      {/* Subcommands */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Subcommands</h2>

        {/* show */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Eye className="h-5 w-5 text-violet-400" />
            config show
          </h3>
          <p className="text-zinc-300">Display the current configuration.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole config show [OPTIONS]

OPTIONS:
  --show-secrets    Show sensitive values (tokens, passwords)`}</code>
              </pre>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-xs overflow-x-auto">
                <code className="text-zinc-300">{`$ wormhole config show
[general]
default_signal_server = "wss://signal.wormhole.app"
auto_update_check = true

[network]
default_port = 4433
bind_address = "0.0.0.0"
max_connections = 10
bandwidth_limit = 0

[cache]
mode = "hybrid"
ram_size_mb = 512
disk_size_gb = 10
path = "~/.cache/wormhole"

[security]
require_password = false
allowed_ips = []
blocked_ips = []

[ui]
theme = "dark"
show_notifications = true`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* list */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <FileText className="h-5 w-5 text-violet-400" />
            config list
          </h3>
          <p className="text-zinc-300">List all available configuration keys.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-xs overflow-x-auto">
                <code className="text-zinc-300">{`$ wormhole config list
Available configuration keys:

general.default_signal_server    Signal server URL
general.auto_update_check        Check for updates on startup
general.telemetry                Anonymous usage statistics

network.default_port             Default QUIC port
network.bind_address             Network interface to bind
network.max_connections          Max concurrent connections
network.bandwidth_limit          Bandwidth limit in MB/s (0=unlimited)
network.announce_mdns            Announce via mDNS/Bonjour

cache.mode                       Cache mode: none|ram|disk|hybrid|aggressive
cache.ram_size_mb                RAM cache size in MB
cache.disk_size_gb               Disk cache size in GB
cache.path                       Disk cache directory

security.require_password        Require password for all shares
security.allowed_ips             IP whitelist (comma-separated)
security.blocked_ips             IP blacklist (comma-separated)
security.auto_accept_local       Auto-accept LAN connections

ui.theme                         UI theme: dark|light|system
ui.show_notifications            Show system notifications
ui.minimize_to_tray              Minimize to system tray`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* path */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <FileText className="h-5 w-5 text-violet-400" />
            config path
          </h3>
          <p className="text-zinc-300">Show the configuration file path.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`$ wormhole config path
/Users/alice/.config/wormhole/config.toml`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* get */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Eye className="h-5 w-5 text-violet-400" />
            config get
          </h3>
          <p className="text-zinc-300">Get a specific configuration value.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole config get <KEY>

# Examples
$ wormhole config get cache.ram_size_mb
512

$ wormhole config get network.default_port
4433

$ wormhole config get general.default_signal_server
wss://signal.wormhole.app`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* set */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Edit className="h-5 w-5 text-green-400" />
            config set
          </h3>
          <p className="text-zinc-300">Set a configuration value.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole config set <KEY> <VALUE>

# Examples
$ wormhole config set cache.ram_size_mb 1024
Set cache.ram_size_mb = 1024

$ wormhole config set network.bandwidth_limit 100
Set network.bandwidth_limit = 100

$ wormhole config set cache.mode aggressive
Set cache.mode = "aggressive"

$ wormhole config set security.require_password true
Set security.require_password = true`}</code>
              </pre>
            </CardContent>
          </Card>
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <p className="text-yellow-400 text-sm">
              <strong>Note:</strong> Some configuration changes require restarting active
              connections to take effect.
            </p>
          </div>
        </div>

        {/* reset */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-yellow-400" />
            config reset
          </h3>
          <p className="text-zinc-300">Reset configuration to defaults.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole config reset [OPTIONS]

OPTIONS:
  --key <KEY>     Reset only specific key
  --force         Skip confirmation prompt

# Examples
$ wormhole config reset
Reset all configuration to defaults? (y/N) y
Configuration reset to defaults.

$ wormhole config reset --key cache.ram_size_mb
Reset cache.ram_size_mb to default (512)

$ wormhole config reset --force
Configuration reset to defaults.`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* edit */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Edit className="h-5 w-5 text-violet-400" />
            config edit
          </h3>
          <p className="text-zinc-300">Open configuration file in your default editor.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`$ wormhole config edit
# Opens ~/.config/wormhole/config.toml in $EDITOR

# Set your preferred editor
$ export EDITOR=vim
$ wormhole config edit`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* import */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Download className="h-5 w-5 text-violet-400" />
            config import
          </h3>
          <p className="text-zinc-300">Import configuration from a file.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole config import <PATH> [OPTIONS]

OPTIONS:
  --merge         Merge with existing (don't overwrite)

# Examples
$ wormhole config import backup-config.toml
Imported configuration from backup-config.toml

$ wormhole config import team-config.toml --merge
Merged configuration from team-config.toml`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* export */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Upload className="h-5 w-5 text-violet-400" />
            config export
          </h3>
          <p className="text-zinc-300">Export configuration to a file.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole config export <PATH> [OPTIONS]

OPTIONS:
  --include-secrets    Include sensitive values

# Examples
$ wormhole config export my-config.toml
Exported configuration to my-config.toml

$ wormhole config export full-backup.toml --include-secrets
Exported configuration (including secrets) to full-backup.toml`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Configuration Reference */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Configuration Reference</h2>
        <p className="text-zinc-300">
          For a complete reference of all configuration options, see the{" "}
          <Link href="/docs/configuration" className="text-violet-400 hover:underline">
            Configuration Reference
          </Link>.
        </p>

        <h3 className="text-lg font-semibold text-white mt-6">Example config.toml</h3>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`# Wormhole Configuration
# ~/.config/wormhole/config.toml

[general]
# Signal server for peer discovery
default_signal_server = "wss://signal.wormhole.app"
# Check for updates on startup
auto_update_check = true

[network]
# Default QUIC port
default_port = 4433
# Interface to bind (0.0.0.0 = all interfaces)
bind_address = "0.0.0.0"
# Maximum concurrent client connections
max_connections = 10
# Bandwidth limit in MB/s (0 = unlimited)
bandwidth_limit = 0

[cache]
# Cache mode: none, ram, disk, hybrid, aggressive
mode = "hybrid"
# RAM cache size in megabytes
ram_size_mb = 512
# Disk cache size in gigabytes
disk_size_gb = 10

[security]
# Require password for all new shares
require_password = false
# Automatically accept connections from local network
auto_accept_local = true`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Environment Variables */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Environment Variables</h2>
        <p className="text-zinc-300">
          Configuration can also be set via environment variables, which override file settings:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-sm">
              <code className="text-zinc-300">{`# Override signal server
export WORMHOLE_SIGNAL_SERVER="wss://my-server.example.com"

# Override cache settings
export WORMHOLE_CACHE_RAM_MB=1024
export WORMHOLE_CACHE_DISK_GB=50

# Override network settings
export WORMHOLE_PORT=4433
export WORMHOLE_MAX_CONNECTIONS=20`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* See Also */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">See Also</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/docs/configuration">
            <Badge variant="outline" className="border-zinc-700 hover:border-violet-500/50 cursor-pointer">
              Configuration Reference
            </Badge>
          </Link>
          <Link href="/docs/cli/cache">
            <Badge variant="outline" className="border-zinc-700 hover:border-violet-500/50 cursor-pointer">
              wormhole cache
            </Badge>
          </Link>
          <Link href="/docs/self-hosting">
            <Badge variant="outline" className="border-zinc-700 hover:border-violet-500/50 cursor-pointer">
              Self-Hosting
            </Badge>
          </Link>
        </div>
      </section>
    </div>
  );
}
