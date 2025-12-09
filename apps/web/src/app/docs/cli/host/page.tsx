import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Link from "next/link";
import {
  Terminal,
  ArrowRight,
  Info,
  AlertTriangle,
  Shield,
  Zap,
} from "lucide-react";

export const metadata = {
  title: "wormhole host - CLI Reference",
  description: "Share a local folder with others using the wormhole host command. Complete options and examples.",
};

export default function HostCommandPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/docs/cli" className="hover:text-white">CLI Reference</Link>
          <span>/</span>
          <span className="text-zinc-400">host</span>
        </div>
        <h1 className="text-4xl font-bold text-white tracking-tight font-mono">
          wormhole host
        </h1>
        <p className="text-xl text-zinc-400">
          Share a local folder with others via a join code or direct IP connection.
        </p>
      </div>

      {/* Synopsis */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Synopsis</h2>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`wormhole host <PATH> [OPTIONS]`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Description */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Description</h2>
        <p className="text-zinc-400">
          The <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-violet-400">host</code> command starts a QUIC server that shares the specified folder. Other users can then mount this folder using the generated join code or by connecting directly via IP address.
        </p>
        <p className="text-zinc-400">
          By default, the host registers with a signal server to enable NAT traversal and join code functionality. Use <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-violet-400">--no-signal</code> for direct LAN-only connections.
        </p>
      </section>

      {/* Arguments */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Arguments</h2>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-2 text-zinc-400 font-medium">Argument</th>
                    <th className="text-left py-2 text-zinc-400 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr>
                    <td className="py-2 font-mono text-violet-400">&lt;PATH&gt;</td>
                    <td className="py-2">Path to the folder to share. Can be absolute or relative.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Options - Network */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Network Options</h2>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-2 text-zinc-400 font-medium w-1/3">Option</th>
                    <th className="text-left py-2 text-zinc-400 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--port &lt;PORT&gt;</td>
                    <td className="py-3">
                      <p>QUIC listening port.</p>
                      <p className="text-zinc-600 text-xs mt-1">Default: 4433</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--bind &lt;ADDRESS&gt;</td>
                    <td className="py-3">
                      <p>IP address to bind to.</p>
                      <p className="text-zinc-600 text-xs mt-1">Default: 0.0.0.0 (all interfaces)</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--signal-server &lt;URL&gt;</td>
                    <td className="py-3">
                      <p>Signal server URL for NAT traversal and join codes.</p>
                      <p className="text-zinc-600 text-xs mt-1">Default: ws://localhost:8080</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--no-signal</td>
                    <td className="py-3">
                      <p>Don&apos;t register with signal server. Direct IP only.</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--max-connections &lt;N&gt;</td>
                    <td className="py-3">
                      <p>Maximum concurrent client connections.</p>
                      <p className="text-zinc-600 text-xs mt-1">Default: 10</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--bandwidth-limit &lt;MB/s&gt;</td>
                    <td className="py-3">
                      <p>Rate limit in MB/s. 0 for unlimited.</p>
                      <p className="text-zinc-600 text-xs mt-1">Default: 0 (unlimited)</p>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 font-mono text-violet-400">--announce-local</td>
                    <td className="py-3">
                      <p>Announce on local network via mDNS/Bonjour.</p>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Options - Security */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Shield className="w-6 h-6 text-violet-400" />
          Security Options
        </h2>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-2 text-zinc-400 font-medium w-1/3">Option</th>
                    <th className="text-left py-2 text-zinc-400 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--code &lt;CODE&gt;</td>
                    <td className="py-3">
                      <p>Use a specific join code instead of generating one.</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--password &lt;PASS&gt;</td>
                    <td className="py-3">
                      <p>Require an additional password beyond the join code.</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--allow-ips &lt;IPs&gt;</td>
                    <td className="py-3">
                      <p>Comma-separated whitelist of allowed IP addresses.</p>
                      <p className="text-zinc-600 text-xs mt-1">Example: --allow-ips 192.168.1.0/24,10.0.0.5</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--block-ips &lt;IPs&gt;</td>
                    <td className="py-3">
                      <p>Comma-separated blacklist of blocked IP addresses.</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--expire-after &lt;DURATION&gt;</td>
                    <td className="py-3">
                      <p>Auto-expire the share after duration (e.g., &quot;2h&quot;, &quot;30m&quot;).</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--tls-cert &lt;PATH&gt;</td>
                    <td className="py-3">
                      <p>Path to custom TLS certificate file.</p>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 font-mono text-violet-400">--tls-key &lt;PATH&gt;</td>
                    <td className="py-3">
                      <p>Path to custom TLS key file.</p>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Options - Access Control */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Access Control Options</h2>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-2 text-zinc-400 font-medium w-1/3">Option</th>
                    <th className="text-left py-2 text-zinc-400 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--allow-write</td>
                    <td className="py-3">
                      <p>Allow clients to write/modify files. By default, shares are read-only.</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--exclude &lt;PATTERNS&gt;</td>
                    <td className="py-3">
                      <p>Glob patterns to exclude from sharing.</p>
                      <p className="text-zinc-600 text-xs mt-1">Example: --exclude &quot;*.log,node_modules/**&quot;</p>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 font-mono text-violet-400">--include &lt;PATTERNS&gt;</td>
                    <td className="py-3">
                      <p>Only include files matching these glob patterns.</p>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Options - Other */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Other Options</h2>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-2 text-zinc-400 font-medium w-1/3">Option</th>
                    <th className="text-left py-2 text-zinc-400 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--name &lt;NAME&gt;</td>
                    <td className="py-3">
                      <p>Custom name for the share (shown to clients).</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--daemon</td>
                    <td className="py-3">
                      <p>Run in background as a daemon.</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--copy-code</td>
                    <td className="py-3">
                      <p>Copy the join code to clipboard.</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--qr-code</td>
                    <td className="py-3">
                      <p>Display a QR code for the join code (mobile clients).</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--compress</td>
                    <td className="py-3">
                      <p>Enable compression for transfers.</p>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 font-mono text-violet-400">--watch</td>
                    <td className="py-3">
                      <p>Watch for file changes and notify connected clients.</p>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Examples */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Examples</h2>

        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Basic Usage</h3>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-0">
                <pre className="p-4 text-sm overflow-x-auto">
                  <code className="text-zinc-300">
{`# Share a folder with default settings
$ wormhole host ~/Projects/my-project

Scanning folder... 2.4 GB in 847 files
Starting QUIC server on 0.0.0.0:4433...
Join Code: WORM-7X9K-BETA

Waiting for connections...`}
                  </code>
                </pre>
              </CardContent>
            </Card>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Custom Port and Password</h3>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-0">
                <pre className="p-4 text-sm overflow-x-auto">
                  <code className="text-zinc-300">
{`# Use custom port with password protection
$ wormhole host ~/sensitive-data --port 5000 --password "secret123"

Join Code: WORM-ABCD-1234
Password required: yes`}
                  </code>
                </pre>
              </CardContent>
            </Card>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Direct LAN Connection</h3>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-0">
                <pre className="p-4 text-sm overflow-x-auto">
                  <code className="text-zinc-300">
{`# Skip signal server for LAN-only access
$ wormhole host ~/Projects --no-signal

Listening on 0.0.0.0:4433
Your IP: 192.168.1.42

Clients can connect with: wormhole mount 192.168.1.42:4433`}
                  </code>
                </pre>
              </CardContent>
            </Card>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Writable Share with Expiration</h3>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-0">
                <pre className="p-4 text-sm overflow-x-auto">
                  <code className="text-zinc-300">
{`# Allow writes, auto-expire after 2 hours
$ wormhole host ~/shared-workspace --allow-write --expire-after 2h

Join Code: WORM-WXYZ-9876
Mode: read/write
Expires: in 2 hours`}
                  </code>
                </pre>
              </CardContent>
            </Card>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Exclude Patterns</h3>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-0">
                <pre className="p-4 text-sm overflow-x-auto">
                  <code className="text-zinc-300">
{`# Exclude build artifacts and logs
$ wormhole host ~/project --exclude "node_modules/**,target/**,*.log,.git/**"`}
                  </code>
                </pre>
              </CardContent>
            </Card>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Run as Daemon with Bandwidth Limit</h3>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-0">
                <pre className="p-4 text-sm overflow-x-auto">
                  <code className="text-zinc-300">
{`# Run in background with 50 MB/s limit
$ wormhole host ~/large-files --daemon --bandwidth-limit 50

Started in background (PID: 12345)
Join Code: WORM-DEMO-CODE`}
                  </code>
                </pre>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Notes */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Notes</h2>
        <div className="space-y-4">
          <Alert className="bg-blue-500/10 border-blue-500/30">
            <Info className="h-4 w-4 text-blue-400" />
            <AlertTitle className="text-blue-400">Join Code Security</AlertTitle>
            <AlertDescription className="text-zinc-400">
              Join codes are cryptographically secure with 80-bit entropy. They&apos;re used for PAKE authentication, meaning even the signal server cannot eavesdrop on your connection.
            </AlertDescription>
          </Alert>

          <Alert className="bg-amber-500/10 border-amber-500/30">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <AlertTitle className="text-amber-400">Firewall Configuration</AlertTitle>
            <AlertDescription className="text-zinc-400">
              For direct connections or when not using NAT traversal, ensure UDP port 4433 (or your custom port) is accessible through your firewall.
            </AlertDescription>
          </Alert>
        </div>
      </section>

      {/* See Also */}
      <section className="space-y-4 pt-8 border-t border-zinc-800">
        <h2 className="text-2xl font-bold text-white">See Also</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/docs/cli/mount" className="text-violet-400 hover:underline">wormhole mount</Link>
          <span className="text-zinc-600">•</span>
          <Link href="/docs/cli/status" className="text-violet-400 hover:underline">wormhole status</Link>
          <span className="text-zinc-600">•</span>
          <Link href="/docs/security" className="text-violet-400 hover:underline">Security Guide</Link>
          <span className="text-zinc-600">•</span>
          <Link href="/docs/cli/signal" className="text-violet-400 hover:underline">wormhole signal</Link>
        </div>
      </section>
    </div>
  );
}
