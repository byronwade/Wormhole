import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import {
  Terminal,
  ArrowRight,
  Server,
  HardDrive,
  Settings,
  Users,
  Database,
  RefreshCw,
  Activity,
  Wrench,
} from "lucide-react";

export const metadata = {
  title: "CLI Reference - Wormhole Documentation",
  description: "Complete command-line reference for Wormhole. All commands, options, and examples.",
};

const commandGroups = [
  {
    title: "Core Commands",
    description: "Primary commands for hosting and mounting",
    icon: Terminal,
    commands: [
      {
        name: "host",
        description: "Share a local folder with others",
        href: "/docs/cli/host",
        example: "wormhole host ~/Projects",
      },
      {
        name: "mount",
        description: "Mount a remote folder locally",
        href: "/docs/cli/mount",
        example: "wormhole mount CODE ~/mnt",
      },
      {
        name: "unmount",
        description: "Unmount a mounted share",
        href: "/docs/cli/all-commands",
        example: "wormhole unmount ~/mnt",
      },
    ],
  },
  {
    title: "Status & Monitoring",
    description: "Monitor connections and performance",
    icon: Activity,
    commands: [
      {
        name: "status",
        description: "Show connection status and stats",
        href: "/docs/cli/status",
        example: "wormhole status",
      },
      {
        name: "list",
        description: "List active hosts and mounts",
        href: "/docs/cli/all-commands",
        example: "wormhole list",
      },
      {
        name: "ping",
        description: "Ping a remote host",
        href: "/docs/cli/all-commands",
        example: "wormhole ping CODE",
      },
      {
        name: "bench",
        description: "Run network benchmarks",
        href: "/docs/cli/all-commands",
        example: "wormhole bench CODE",
      },
    ],
  },
  {
    title: "Cache Management",
    description: "Manage local file cache",
    icon: Database,
    commands: [
      {
        name: "cache stats",
        description: "Show cache statistics",
        href: "/docs/cli/cache",
        example: "wormhole cache stats",
      },
      {
        name: "cache clear",
        description: "Clear cached data",
        href: "/docs/cli/cache",
        example: "wormhole cache clear",
      },
      {
        name: "cache warm",
        description: "Pre-fetch files for offline use",
        href: "/docs/cli/cache",
        example: "wormhole cache warm SHARE",
      },
    ],
  },
  {
    title: "Configuration",
    description: "Manage settings and preferences",
    icon: Settings,
    commands: [
      {
        name: "config show",
        description: "Display current configuration",
        href: "/docs/cli/config",
        example: "wormhole config show",
      },
      {
        name: "config set",
        description: "Set a configuration value",
        href: "/docs/cli/config",
        example: "wormhole config set cache.max_gb 20",
      },
      {
        name: "config edit",
        description: "Edit config in your editor",
        href: "/docs/cli/config",
        example: "wormhole config edit",
      },
    ],
  },
  {
    title: "Peer Management",
    description: "Manage known peers and trust",
    icon: Users,
    commands: [
      {
        name: "peers list",
        description: "List known peers",
        href: "/docs/cli/peers",
        example: "wormhole peers list",
      },
      {
        name: "peers trust",
        description: "Trust a peer's certificate",
        href: "/docs/cli/peers",
        example: "wormhole peers trust PEER",
      },
      {
        name: "peers block",
        description: "Block a peer",
        href: "/docs/cli/peers",
        example: "wormhole peers block PEER",
      },
    ],
  },
  {
    title: "Synchronization",
    description: "Bidirectional file sync (Phase 7)",
    icon: RefreshCw,
    badge: "Phase 7",
    commands: [
      {
        name: "sync status",
        description: "Show sync status",
        href: "/docs/cli/sync",
        example: "wormhole sync status",
      },
      {
        name: "sync now",
        description: "Force synchronization",
        href: "/docs/cli/sync",
        example: "wormhole sync now",
      },
      {
        name: "sync conflicts",
        description: "List and resolve conflicts",
        href: "/docs/cli/sync",
        example: "wormhole sync conflicts",
      },
    ],
  },
  {
    title: "Signal Server",
    description: "Run and manage signal server",
    icon: Server,
    commands: [
      {
        name: "signal",
        description: "Run the signal server",
        href: "/docs/cli/signal",
        example: "wormhole signal --port 8080",
      },
    ],
  },
  {
    title: "Utilities",
    description: "Helper commands and diagnostics",
    icon: Wrench,
    commands: [
      {
        name: "doctor",
        description: "Diagnose system issues",
        href: "/docs/cli/all-commands",
        example: "wormhole doctor",
      },
      {
        name: "version",
        description: "Show version info",
        href: "/docs/cli/all-commands",
        example: "wormhole version --detailed",
      },
      {
        name: "completions",
        description: "Generate shell completions",
        href: "/docs/cli/all-commands",
        example: "wormhole completions bash",
      },
    ],
  },
];

export default function CLIPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/40">
          CLI Reference
        </Badge>
        <h1 className="text-4xl font-bold text-white tracking-tight">
          Command Line Interface
        </h1>
        <p className="text-xl text-zinc-400">
          Complete reference for all Wormhole CLI commands, options, and usage examples.
        </p>
      </div>

      {/* Quick Reference */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Quick Reference</h2>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
              <span className="text-xs text-zinc-500 font-mono">Common Commands</span>
            </div>
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# Share a folder
wormhole host ~/folder [options]

# Mount a remote folder
wormhole mount <CODE|IP:PORT> [mountpoint] [options]

# Check status
wormhole status [--detailed]

# Unmount
wormhole unmount <mountpoint>

# Get help
wormhole --help
wormhole <command> --help`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Global Options */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Global Options</h2>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-2 text-zinc-400 font-medium">Option</th>
                    <th className="text-left py-2 text-zinc-400 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-violet-400">-v, --verbose</td>
                    <td className="py-2">Increase output verbosity (-v, -vv, -vvv)</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-violet-400">-q, --quiet</td>
                    <td className="py-2">Suppress all output except errors</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-violet-400">--format &lt;FORMAT&gt;</td>
                    <td className="py-2">Output format: text, json, yaml (default: text)</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-violet-400">--config &lt;PATH&gt;</td>
                    <td className="py-2">Path to config file</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-violet-400">--no-color</td>
                    <td className="py-2">Disable colored output</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-mono text-violet-400">-h, --help</td>
                    <td className="py-2">Print help information</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Command Groups */}
      <section className="space-y-8">
        <h2 className="text-2xl font-bold text-white">Commands by Category</h2>

        {commandGroups.map((group) => {
          const Icon = group.icon;
          return (
            <div key={group.title} className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    {group.title}
                    {group.badge && (
                      <Badge variant="outline" className="border-violet-500/50 text-violet-400 text-xs">
                        {group.badge}
                      </Badge>
                    )}
                  </h3>
                  <p className="text-sm text-zinc-500">{group.description}</p>
                </div>
              </div>

              <div className="grid gap-3 ml-13">
                {group.commands.map((cmd) => (
                  <Link key={cmd.name} href={cmd.href}>
                    <Card className="bg-zinc-900/50 border-zinc-800 hover:border-violet-500/50 transition-colors">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <code className="text-violet-400 font-mono font-semibold">{cmd.name}</code>
                            </div>
                            <p className="text-sm text-zinc-400">{cmd.description}</p>
                          </div>
                          <div className="flex-shrink-0">
                            <code className="text-xs text-zinc-600 font-mono bg-zinc-800 px-2 py-1 rounded">
                              {cmd.example}
                            </code>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {/* Environment Variables */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Environment Variables</h2>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-2 text-zinc-400 font-medium">Variable</th>
                    <th className="text-left py-2 text-zinc-400 font-medium">Description</th>
                    <th className="text-left py-2 text-zinc-400 font-medium">Default</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-violet-400">WORMHOLE_CONFIG</td>
                    <td className="py-2">Path to config file</td>
                    <td className="py-2 text-zinc-600">~/.config/wormhole/config.toml</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-violet-400">WORMHOLE_CACHE_DIR</td>
                    <td className="py-2">Cache directory path</td>
                    <td className="py-2 text-zinc-600">~/.cache/wormhole</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-violet-400">WORMHOLE_LOG_LEVEL</td>
                    <td className="py-2">Log level (trace, debug, info, warn, error)</td>
                    <td className="py-2 text-zinc-600">info</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-violet-400">WORMHOLE_SIGNAL_SERVER</td>
                    <td className="py-2">Default signal server URL</td>
                    <td className="py-2 text-zinc-600">ws://signal.wormhole.app</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-violet-400">RUST_LOG</td>
                    <td className="py-2">Rust logging filter (for debugging)</td>
                    <td className="py-2 text-zinc-600">(none)</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-mono text-violet-400">NO_COLOR</td>
                    <td className="py-2">Disable colored output</td>
                    <td className="py-2 text-zinc-600">(none)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* See Also */}
      <section className="space-y-4 pt-8 border-t border-zinc-800">
        <h2 className="text-2xl font-bold text-white">See Also</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Link href="/docs/cli/all-commands">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-violet-500/50 transition-colors h-full">
              <CardContent className="p-6">
                <h3 className="font-semibold text-white mb-1">All Commands Reference</h3>
                <p className="text-sm text-zinc-400">Complete list of every command and option</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/docs/configuration">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-violet-500/50 transition-colors h-full">
              <CardContent className="p-6">
                <h3 className="font-semibold text-white mb-1">Configuration</h3>
                <p className="text-sm text-zinc-400">Config file reference and examples</p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </section>
    </div>
  );
}
