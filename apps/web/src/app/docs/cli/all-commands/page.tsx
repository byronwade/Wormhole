import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Terminal } from "lucide-react";

export const metadata = {
  title: "All Commands - Wormhole CLI Reference",
  description: "Complete reference of every Wormhole CLI command and option.",
};

export default function AllCommandsPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/docs/cli" className="hover:text-white">CLI Reference</Link>
          <span>/</span>
          <span className="text-zinc-400">All Commands</span>
        </div>
        <h1 className="text-4xl font-bold text-white tracking-tight">
          Complete CLI Reference
        </h1>
        <p className="text-xl text-zinc-400">
          Every command, subcommand, and option available in the Wormhole CLI.
        </p>
      </div>

      {/* wormhole host */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white font-mono">wormhole host</h2>
        <p className="text-zinc-400">Share a local folder with others.</p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-xs overflow-x-auto">
              <code className="text-zinc-300">
{`wormhole host <PATH> [OPTIONS]

ARGUMENTS:
  <PATH>                    Path to folder to share

NETWORK OPTIONS:
  --port <PORT>             QUIC port [default: 4433]
  --bind <ADDR>             Bind address [default: 0.0.0.0]
  --signal-server <URL>     Signal server URL [default: ws://localhost:8080]
  --no-signal               Direct IP only, skip signal server
  --max-connections <N>     Max concurrent clients [default: 10]
  --bandwidth-limit <MB/s>  Rate limit (0=unlimited) [default: 0]
  --announce-local          Announce via mDNS/Bonjour

SECURITY OPTIONS:
  --code <CODE>             Use specific join code
  --password <PASS>         Require additional password
  --allow-ips <IPs>         IP whitelist (comma-separated)
  --block-ips <IPs>         IP blacklist (comma-separated)
  --expire-after <DUR>      Auto-expire (e.g., "2h", "30m")
  --tls-cert <PATH>         Custom TLS certificate
  --tls-key <PATH>          Custom TLS key

ACCESS CONTROL:
  --allow-write             Allow clients to modify files
  --exclude <PATTERNS>      Glob patterns to exclude
  --include <PATTERNS>      Only include matching files

OTHER OPTIONS:
  --name <NAME>             Share name (shown to clients)
  --daemon                  Run in background
  --copy-code               Copy join code to clipboard
  --qr-code                 Display QR code
  --compress                Enable compression
  --watch                   Notify clients of file changes`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* wormhole mount */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white font-mono">wormhole mount</h2>
        <p className="text-zinc-400">Mount a remote folder locally.</p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-xs overflow-x-auto">
              <code className="text-zinc-300">
{`wormhole mount <TARGET> [MOUNTPOINT] [OPTIONS]

ARGUMENTS:
  <TARGET>                  Join code or IP:PORT
  [MOUNTPOINT]              Mount path [default: ~/wormhole/<name>]

CONNECTION OPTIONS:
  --signal <URL>            Signal server URL
  --password <PASS>         Password if required
  --timeout <SECS>          Connection timeout [default: 30]
  --auto-reconnect          Auto-reconnect on disconnect [default: true]
  --max-reconnect <N>       Max reconnect attempts (0=infinite)
  --reconnect-delay <SECS>  Initial reconnect delay [default: 1]
  --fallback-direct         Fallback to direct IP if signal fails

CACHE OPTIONS:
  --cache-mode <MODE>       none|ram|disk|hybrid|aggressive [default: hybrid]
  --ram-cache-mb <MB>       RAM cache size [default: 512]
  --disk-cache-gb <GB>      Disk cache size [default: 10]
  --offline-mode            Serve from cache when disconnected

PERFORMANCE OPTIONS:
  --prefetch                Enable read-ahead prefetching
  --prefetch-lookahead <N>  Chunks to prefetch [default: 4]
  --bandwidth-limit <MB/s>  Rate limit [default: 0]
  --write-through           Sync writes immediately

FUSE OPTIONS:
  --read-only               Mount read-only
  --use-kext                Use kernel extension (macOS)
  --fsname <NAME>           Filesystem name [default: wormhole]
  --attr-timeout <SECS>     Attribute cache TTL [default: 1]
  --entry-timeout <SECS>    Entry cache TTL [default: 1]
  --uid <UID>               File owner UID
  --gid <GID>               File owner GID
  --umask <MASK>            Permission mask
  --enable-xattr            Enable extended attributes
  -o <OPTIONS>              Additional FUSE options
  --daemon                  Run in background`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* wormhole status */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white font-mono">wormhole status</h2>
        <p className="text-zinc-400">Show connection status and statistics.</p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-xs overflow-x-auto">
              <code className="text-zinc-300">
{`wormhole status [ID] [OPTIONS]

ARGUMENTS:
  [ID]                      Specific share/mount ID

OPTIONS:
  --detailed                Show detailed information
  --watch                   Continuously update (like top)
  --interval <SECS>         Update interval [default: 1]
  --hosts                   Show only hosts
  --mounts                  Show only mounts
  --network                 Show network statistics
  --performance             Show performance metrics`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* wormhole unmount */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white font-mono">wormhole unmount</h2>
        <p className="text-zinc-400">Unmount a mounted share.</p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-xs overflow-x-auto">
              <code className="text-zinc-300">
{`wormhole unmount <TARGET> [OPTIONS]

ARGUMENTS:
  <TARGET>                  Mount point or share ID

OPTIONS:
  --force                   Force unmount even if busy
  --all                     Unmount all mounts`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* wormhole cache */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white font-mono">wormhole cache</h2>
        <p className="text-zinc-400">Manage local file cache.</p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-xs overflow-x-auto">
              <code className="text-zinc-300">
{`wormhole cache <COMMAND>

COMMANDS:
  stats                     Show cache statistics
    --detailed              Breakdown by share
    --per-file              Per-file statistics

  clear                     Clear cache
    --ram-only              Clear only RAM cache
    --disk-only             Clear only disk cache
    --share <SHARE>         Clear for specific share
    --older-than <DUR>      Clear older than duration
    --force                 Skip confirmation

  path                      Show cache directory location

  resize                    Set cache size limits
    --ram-mb <MB>           RAM cache size
    --disk-gb <GB>          Disk cache size

  warm <SHARE>              Pre-fetch for offline use
    --path <PATTERN>        Path pattern to warm
    --max-size-mb <MB>      Maximum size to cache
    --include <PATTERNS>    Include patterns
    --exclude <PATTERNS>    Exclude patterns

  verify                    Verify cache integrity
    --fix                   Fix corrupted entries
    --verbose               Show each file

  gc                        Garbage collection
    --target-gb <GB>        Target size
    --dry-run               Show what would be deleted

  export <OUTPUT>           Export cache to archive
    --share <SHARE>         Export specific share
    --compress              Compress archive

  import <INPUT>            Import cache from archive
    --verify                Verify checksums`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* wormhole config */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white font-mono">wormhole config</h2>
        <p className="text-zinc-400">Manage configuration.</p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-xs overflow-x-auto">
              <code className="text-zinc-300">
{`wormhole config <COMMAND>

COMMANDS:
  show                      Show current configuration
    --show-secrets          Show tokens and secrets

  list                      List all configuration keys

  path                      Show config file path

  get <KEY>                 Get configuration value

  set <KEY> <VALUE>         Set configuration value

  reset                     Reset to defaults
    --key <KEY>             Reset specific key only
    --force                 Skip confirmation

  edit                      Edit in text editor

  import <PATH>             Import configuration
    --merge                 Merge with existing

  export <PATH>             Export configuration
    --include-secrets       Include secrets`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* wormhole peers */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white font-mono">wormhole peers</h2>
        <p className="text-zinc-400">Manage known peers and trust.</p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-xs overflow-x-auto">
              <code className="text-zinc-300">
{`wormhole peers <COMMAND>

COMMANDS:
  list                      List known peers
    --all                   Show blocked peers too
    --online                Show online peers only

  add <PEER>                Add trusted peer
    --name <NAME>           Friendly name

  remove <PEER>             Remove peer
    --force                 Skip confirmation

  show <PEER>               Show peer details

  block <PEER>              Block a peer

  unblock <PEER>            Unblock a peer

  trust <PEER>              Trust peer's certificate
    --level <LEVEL>         limited|standard|full

  rename <PEER> <NAME>      Rename a peer`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* wormhole sync */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white font-mono flex items-center gap-2">
          wormhole sync
          <Badge variant="outline" className="border-wormhole-hunter/50 text-wormhole-hunter-light text-xs">Phase 7</Badge>
        </h2>
        <p className="text-zinc-400">Bidirectional synchronization.</p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-xs overflow-x-auto">
              <code className="text-zinc-300">
{`wormhole sync <COMMAND>

COMMANDS:
  status [SHARE]            Show sync status
    --pending               Show pending changes

  now [SHARE]               Force synchronization
    --wait                  Wait for completion

  pause [SHARE]             Pause sync

  resume [SHARE]            Resume sync

  conflicts [SHARE]         Show sync conflicts

  resolve <CONFLICT> <STRATEGY>
                            Resolve conflict
    Strategy: local|remote|both|merge

  reset [SHARE]             Reset sync state
    --force                 Skip confirmation

  log [SHARE]               Show sync history
    --limit <N>             Number of entries [default: 50]`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* wormhole signal */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white font-mono">wormhole signal</h2>
        <p className="text-zinc-400">Run the signal/rendezvous server.</p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-xs overflow-x-auto">
              <code className="text-zinc-300">
{`wormhole signal [OPTIONS]

OPTIONS:
  --port <PORT>             Listen port [default: 8080]
  --bind <ADDR>             Bind address [default: 0.0.0.0]
  --max-connections <N>     Max concurrent connections [default: 1000]
  --code-expiry <SECS>      Code expiration time [default: 3600]
  --rate-limit              Enable rate limiting
  --rate-limit-rpm <N>      Requests per minute per IP [default: 60]
  --daemon                  Run in background
  --tls-cert <PATH>         TLS certificate file
  --tls-key <PATH>          TLS key file
  --enable-stun             Enable STUN server
  --enable-turn             Enable TURN relay
  --admin-port <PORT>       Admin API port
  --metrics                 Enable metrics endpoint
  --metrics-port <PORT>     Metrics port`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Utilities */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Utility Commands</h2>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-xs overflow-x-auto">
              <code className="text-zinc-300">
{`wormhole ping <TARGET>              Ping a remote host
  --count <N>                       Number of pings [default: 4]
  --interval <SECS>                 Interval [default: 1]
  --timeout <SECS>                  Timeout per ping [default: 5]
  --signal <URL>                    Signal server

wormhole bench <TARGET>             Benchmark network performance
  --test <TYPE>                     all|read|write|latency|metadata
  --duration <SECS>                 Duration [default: 10]
  --parallel <N>                    Parallel streams [default: 4]
  --signal <URL>                    Signal server

wormhole list [TYPE]                List active shares and mounts
  Type: all|hosts|mounts|peers
  --detailed                        Show detailed info

wormhole history                    Show transfer history
  --limit <N>                       Number of entries [default: 50]
  --operation <TYPE>                Filter by operation
  --share <SHARE>                   Filter by share
  --since <DATE>                    Start date (YYYY-MM-DD)
  --until <DATE>                    End date

wormhole doctor                     Diagnose system issues
  --full                            Run all checks
  --fix                             Attempt automatic repair

wormhole version                    Show version info
  --detailed                        Show system info
  --check-update                    Check for updates

wormhole completions <SHELL>        Generate shell completions
  Shells: bash|zsh|fish|powershell|elvish

wormhole update                     Check for updates
  check                             Check for available updates
    --show-url                      Output download URL
  changelog [VERSION]               Show changelog
  config                            Configure auto-update settings
    --auto-check <bool>             Enable/disable auto-check
    --channel <CHANNEL>             stable|beta|nightly`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Global Options */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Global Options</h2>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-xs overflow-x-auto">
              <code className="text-zinc-300">
{`These options work with all commands:

  -v, --verbose             Increase verbosity (-v, -vv, -vvv)
  -q, --quiet               Suppress all output except errors
  --format <FORMAT>         Output format: text|json|yaml [default: text]
  --config <PATH>           Configuration file path
  --no-color                Disable colored output
  -h, --help                Print help information
  -V, --version             Print version information`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
