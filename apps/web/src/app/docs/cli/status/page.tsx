import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Activity, Eye, Network, Gauge } from "lucide-react";

export const metadata = {
  title: "wormhole status - Wormhole CLI Reference",
  description: "Monitor active shares and mounts with real-time statistics.",
};

export default function StatusCommandPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/docs/cli" className="hover:text-white">CLI Reference</Link>
          <span>/</span>
          <span className="text-zinc-400">status</span>
        </div>
        <h1 className="text-4xl font-bold text-white tracking-tight font-mono">
          wormhole status
        </h1>
        <p className="text-xl text-zinc-400">
          Monitor active shares, mounts, and connection statistics in real-time.
        </p>
      </div>

      {/* Synopsis */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Synopsis</h2>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-sm">
              <code className="text-green-400">wormhole status</code>
              <code className="text-zinc-400"> [ID] [OPTIONS]</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Description */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Description</h2>
        <p className="text-zinc-300">
          The <code className="text-violet-400">status</code> command displays information about active
          Wormhole connections. Without arguments, it shows a summary of all hosts and mounts. With an
          ID argument, it shows detailed information about a specific connection.
        </p>
        <p className="text-zinc-300">
          Use the <code className="text-violet-400">--watch</code> flag to continuously update the
          display, similar to tools like <code>top</code> or <code>htop</code>.
        </p>
      </section>

      {/* Arguments */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Arguments</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Argument</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-violet-400">[ID]</td>
                <td className="py-3 px-4">Optional share or mount ID to show details for a specific connection</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Options */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Options</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Option</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-green-400">--detailed</td>
                <td className="py-3 px-4">Show detailed information including peer addresses, cache stats, and transfer history</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-green-400">--watch</td>
                <td className="py-3 px-4">Continuously update display (like <code>top</code>)</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-green-400">--interval &lt;SECS&gt;</td>
                <td className="py-3 px-4">Update interval for watch mode (default: 1)</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-green-400">--hosts</td>
                <td className="py-3 px-4">Show only active hosts (shares you&apos;re providing)</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-green-400">--mounts</td>
                <td className="py-3 px-4">Show only active mounts (shares you&apos;re consuming)</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-green-400">--network</td>
                <td className="py-3 px-4">Show network statistics (bandwidth, latency, packet loss)</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-green-400">--performance</td>
                <td className="py-3 px-4">Show performance metrics (IOPS, throughput, cache hit rate)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Output Fields */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Output Fields</h2>

        <h3 className="text-lg font-semibold text-white">Basic Output</h3>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`$ wormhole status
Active Connections
──────────────────────────────────────────────────────────────────
ID          Type    Name            Status      Peers   Transfer
abc123      host    ~/Projects      active      3       ↑ 2.4 GB
def456      mount   remote-work     active      1       ↓ 847 MB
──────────────────────────────────────────────────────────────────
Total: 2 connections (2 active)`}</code>
            </pre>
          </CardContent>
        </Card>

        <h3 className="text-lg font-semibold text-white mt-6">Detailed Output</h3>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`$ wormhole status abc123 --detailed
Share: abc123
──────────────────────────────────────────────────────────────────
Type:           host
Name:           Projects
Path:           /Users/alice/Projects
Status:         active
Join Code:      WORM-ABCD-EFGH
Started:        2024-01-15 09:30:00 (2h 15m ago)
Expires:        never

Connected Peers (3):
  • bob@192.168.1.42:4433     connected 1h 30m    ↑ 1.2 GB
  • carol@10.0.0.15:4433      connected 45m       ↑ 847 MB
  • dave@172.16.0.8:4433      connected 15m       ↑ 412 MB

Network:
  Protocol:     QUIC (TLS 1.3)
  Encryption:   ChaCha20-Poly1305
  Port:         4433/UDP
  Bandwidth:    unlimited

Statistics:
  Files shared: 1,247
  Total size:   48.2 GB
  Transferred:  2.4 GB (5% of total)
  Requests:     8,412
  Cache hits:   92.3%`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Examples */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Examples</h2>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Eye className="h-5 w-5 text-violet-400" />
            Basic Status
          </h3>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300"># Show all active connections
wormhole status

# Show only hosts
wormhole status --hosts

# Show only mounts
wormhole status --mounts</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-violet-400" />
            Live Monitoring
          </h3>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300"># Watch all connections (updates every second)
wormhole status --watch

# Watch with 5-second interval
wormhole status --watch --interval 5

# Watch a specific connection
wormhole status abc123 --watch</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Network className="h-5 w-5 text-violet-400" />
            Network Statistics
          </h3>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300"># Show network stats for all connections
wormhole status --network

# Detailed network stats for specific mount
wormhole status def456 --network --detailed</code>
              </pre>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-xs overflow-x-auto">
                <code className="text-zinc-300">{`$ wormhole status --network
Network Statistics
──────────────────────────────────────────────────────────────────
ID          Latency     Bandwidth       Packets     Loss
abc123      2.1ms       ↑ 45 MB/s       1.2M        0.01%
def456      15.3ms      ↓ 28 MB/s       847K        0.02%`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Gauge className="h-5 w-5 text-violet-400" />
            Performance Metrics
          </h3>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300"># Show performance metrics
wormhole status --performance

# Combined detailed view
wormhole status abc123 --detailed --network --performance</code>
              </pre>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* JSON Output */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">JSON Output</h2>
        <p className="text-zinc-300">
          For scripting and automation, use <code className="text-violet-400">--format json</code>:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`$ wormhole status --format json
{
  "connections": [
    {
      "id": "abc123",
      "type": "host",
      "name": "Projects",
      "path": "/Users/alice/Projects",
      "status": "active",
      "join_code": "WORM-ABCD-EFGH",
      "started_at": "2024-01-15T09:30:00Z",
      "peers": [
        {
          "address": "192.168.1.42:4433",
          "connected_at": "2024-01-15T10:15:00Z",
          "bytes_sent": 1288490188
        }
      ],
      "stats": {
        "files_shared": 1247,
        "total_bytes": 51778846720,
        "bytes_transferred": 2576980377
      }
    }
  ],
  "summary": {
    "total": 2,
    "active": 2,
    "hosts": 1,
    "mounts": 1
  }
}`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Exit Codes */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Exit Codes</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Code</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Meaning</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-green-400">0</td>
                <td className="py-3 px-4">Success (at least one connection exists)</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-yellow-400">1</td>
                <td className="py-3 px-4">No active connections</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-red-400">2</td>
                <td className="py-3 px-4">Specified ID not found</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* See Also */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">See Also</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/docs/cli/host">
            <Badge variant="outline" className="border-zinc-700 hover:border-violet-500/50 cursor-pointer">
              wormhole host
            </Badge>
          </Link>
          <Link href="/docs/cli/mount">
            <Badge variant="outline" className="border-zinc-700 hover:border-violet-500/50 cursor-pointer">
              wormhole mount
            </Badge>
          </Link>
          <Link href="/docs/cli/all-commands">
            <Badge variant="outline" className="border-zinc-700 hover:border-violet-500/50 cursor-pointer">
              All Commands
            </Badge>
          </Link>
        </div>
      </section>
    </div>
  );
}
