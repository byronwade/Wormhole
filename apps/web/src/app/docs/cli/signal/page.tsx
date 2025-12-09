import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Radio, Lock, Shield, Activity, Settings } from "lucide-react";

export const metadata = {
  title: "wormhole signal - Wormhole CLI Reference",
  description: "Run a signal/rendezvous server for peer discovery and NAT traversal.",
};

export default function SignalCommandPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/docs/cli" className="hover:text-white">CLI Reference</Link>
          <span>/</span>
          <span className="text-zinc-400">signal</span>
        </div>
        <h1 className="text-4xl font-bold text-white tracking-tight font-mono">
          wormhole signal
        </h1>
        <p className="text-xl text-zinc-400">
          Run a signal/rendezvous server for peer discovery and NAT traversal.
        </p>
      </div>

      {/* Synopsis */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Synopsis</h2>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-sm">
              <code className="text-green-400">wormhole signal</code>
              <code className="text-zinc-400"> [OPTIONS]</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Description */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Description</h2>
        <p className="text-zinc-300">
          The signal server is a lightweight WebSocket service that helps Wormhole peers
          discover each other using join codes. It facilitates the initial connection
          handshake but never sees your file data.
        </p>
        <p className="text-zinc-300">
          By default, Wormhole uses the public signal server at{" "}
          <code className="text-violet-400">wss://signal.wormhole.app</code>. You can run
          your own for privacy, reliability, or air-gapped networks.
        </p>
      </section>

      {/* What the Signal Server Does */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">What It Does</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <h3 className="text-lg font-semibold text-green-400 mb-2">Does</h3>
              <ul className="space-y-2 text-zinc-300 text-sm">
                <li>- Maps join codes to IP addresses</li>
                <li>- Facilitates NAT hole punching</li>
                <li>- Relays PAKE handshake messages</li>
                <li>- Provides STUN/TURN services (optional)</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <h3 className="text-lg font-semibold text-red-400 mb-2">Does NOT</h3>
              <ul className="space-y-2 text-zinc-300 text-sm">
                <li>- See your files or file names</li>
                <li>- Decrypt your traffic</li>
                <li>- Store any user data</li>
                <li>- Require authentication</li>
              </ul>
            </CardContent>
          </Card>
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
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Default</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-green-400">--port &lt;PORT&gt;</td>
                <td className="py-3 px-4 text-zinc-500">8080</td>
                <td className="py-3 px-4">WebSocket listen port</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-green-400">--bind &lt;ADDR&gt;</td>
                <td className="py-3 px-4 text-zinc-500">0.0.0.0</td>
                <td className="py-3 px-4">Network interface to bind</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-green-400">--max-connections &lt;N&gt;</td>
                <td className="py-3 px-4 text-zinc-500">1000</td>
                <td className="py-3 px-4">Maximum concurrent WebSocket connections</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-green-400">--code-expiry &lt;SECS&gt;</td>
                <td className="py-3 px-4 text-zinc-500">3600</td>
                <td className="py-3 px-4">How long join codes remain valid (seconds)</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-green-400">--rate-limit</td>
                <td className="py-3 px-4 text-zinc-500">false</td>
                <td className="py-3 px-4">Enable rate limiting per IP</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-green-400">--rate-limit-rpm &lt;N&gt;</td>
                <td className="py-3 px-4 text-zinc-500">60</td>
                <td className="py-3 px-4">Requests per minute per IP (with rate limiting)</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-green-400">--daemon</td>
                <td className="py-3 px-4 text-zinc-500">false</td>
                <td className="py-3 px-4">Run in background as daemon</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-green-400">--tls-cert &lt;PATH&gt;</td>
                <td className="py-3 px-4 text-zinc-500">-</td>
                <td className="py-3 px-4">TLS certificate file (enables wss://)</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-green-400">--tls-key &lt;PATH&gt;</td>
                <td className="py-3 px-4 text-zinc-500">-</td>
                <td className="py-3 px-4">TLS private key file</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-green-400">--enable-stun</td>
                <td className="py-3 px-4 text-zinc-500">false</td>
                <td className="py-3 px-4">Enable STUN server for NAT traversal</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-green-400">--enable-turn</td>
                <td className="py-3 px-4 text-zinc-500">false</td>
                <td className="py-3 px-4">Enable TURN relay for restrictive NATs</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-green-400">--admin-port &lt;PORT&gt;</td>
                <td className="py-3 px-4 text-zinc-500">-</td>
                <td className="py-3 px-4">Admin API port (disabled by default)</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-green-400">--metrics</td>
                <td className="py-3 px-4 text-zinc-500">false</td>
                <td className="py-3 px-4">Enable Prometheus metrics endpoint</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-green-400">--metrics-port &lt;PORT&gt;</td>
                <td className="py-3 px-4 text-zinc-500">9090</td>
                <td className="py-3 px-4">Port for metrics endpoint</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Examples */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Examples</h2>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Radio className="h-5 w-5 text-violet-400" />
            Basic Usage
          </h3>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`# Start signal server on default port
wormhole signal

# Custom port
wormhole signal --port 9000

# Run as daemon
wormhole signal --daemon`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Lock className="h-5 w-5 text-violet-400" />
            With TLS (Production)
          </h3>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`# Enable TLS for secure WebSocket (wss://)
wormhole signal \\
  --port 443 \\
  --tls-cert /etc/letsencrypt/live/signal.example.com/fullchain.pem \\
  --tls-key /etc/letsencrypt/live/signal.example.com/privkey.pem

# With Let's Encrypt auto-renewal (use a reverse proxy like Caddy)
# See self-hosting documentation for details`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Shield className="h-5 w-5 text-violet-400" />
            With Rate Limiting
          </h3>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`# Enable rate limiting for public deployment
wormhole signal \\
  --rate-limit \\
  --rate-limit-rpm 30 \\
  --max-connections 5000`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-violet-400" />
            With Monitoring
          </h3>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`# Enable Prometheus metrics
wormhole signal \\
  --metrics \\
  --metrics-port 9090 \\
  --admin-port 8081

# Metrics available at http://localhost:9090/metrics
# Admin API at http://localhost:8081/`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Settings className="h-5 w-5 text-violet-400" />
            Full Production Setup
          </h3>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole signal \\
  --port 443 \\
  --tls-cert /etc/ssl/signal.crt \\
  --tls-key /etc/ssl/signal.key \\
  --max-connections 10000 \\
  --code-expiry 7200 \\
  --rate-limit \\
  --rate-limit-rpm 60 \\
  --enable-stun \\
  --metrics \\
  --daemon`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Client Configuration */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Client Configuration</h2>
        <p className="text-zinc-300">
          To use your own signal server, configure clients:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-sm">
              <code className="text-zinc-300">{`# Per-command
wormhole host ~/folder --signal-server wss://signal.example.com
wormhole mount WORM-XXXX --signal wss://signal.example.com

# Global configuration
wormhole config set general.default_signal_server "wss://signal.example.com"

# Environment variable
export WORMHOLE_SIGNAL_SERVER="wss://signal.example.com"`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Output */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Output</h2>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`$ wormhole signal --metrics
2024-01-15T10:30:00Z INFO  Starting Wormhole Signal Server
2024-01-15T10:30:00Z INFO  Version: 0.1.0
2024-01-15T10:30:00Z INFO  Listening on ws://0.0.0.0:8080
2024-01-15T10:30:00Z INFO  Metrics available at http://0.0.0.0:9090/metrics
2024-01-15T10:30:00Z INFO  Code expiry: 3600 seconds
2024-01-15T10:30:00Z INFO  Max connections: 1000
2024-01-15T10:30:00Z INFO  Signal server ready

2024-01-15T10:30:15Z INFO  New connection from 192.168.1.42
2024-01-15T10:30:15Z INFO  Code registered: WORM-ABCD
2024-01-15T10:30:22Z INFO  New connection from 10.0.0.15
2024-01-15T10:30:22Z INFO  Code lookup: WORM-ABCD -> 192.168.1.42:4433
2024-01-15T10:30:22Z INFO  Peer exchange completed`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Metrics */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Prometheus Metrics</h2>
        <p className="text-zinc-300">
          When <code className="text-violet-400">--metrics</code> is enabled:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`# HELP wormhole_signal_connections_total Total WebSocket connections
# TYPE wormhole_signal_connections_total counter
wormhole_signal_connections_total 1247

# HELP wormhole_signal_connections_active Current active connections
# TYPE wormhole_signal_connections_active gauge
wormhole_signal_connections_active 42

# HELP wormhole_signal_codes_registered_total Total codes registered
# TYPE wormhole_signal_codes_registered_total counter
wormhole_signal_codes_registered_total 892

# HELP wormhole_signal_codes_active Current active codes
# TYPE wormhole_signal_codes_active gauge
wormhole_signal_codes_active 15

# HELP wormhole_signal_exchanges_total Total successful peer exchanges
# TYPE wormhole_signal_exchanges_total counter
wormhole_signal_exchanges_total 756

# HELP wormhole_signal_request_duration_seconds Request latency
# TYPE wormhole_signal_request_duration_seconds histogram
wormhole_signal_request_duration_seconds_bucket{le="0.001"} 5420
wormhole_signal_request_duration_seconds_bucket{le="0.01"} 5892`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* See Also */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">See Also</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/docs/self-hosting">
            <Badge variant="outline" className="border-zinc-700 hover:border-violet-500/50 cursor-pointer">
              Self-Hosting Guide
            </Badge>
          </Link>
          <Link href="/docs/architecture/signal-server">
            <Badge variant="outline" className="border-zinc-700 hover:border-violet-500/50 cursor-pointer">
              Signal Server Architecture
            </Badge>
          </Link>
          <Link href="/docs/security">
            <Badge variant="outline" className="border-zinc-700 hover:border-violet-500/50 cursor-pointer">
              Security
            </Badge>
          </Link>
        </div>
      </section>
    </div>
  );
}
