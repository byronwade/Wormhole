import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Code, FileCode, Terminal, Webhook } from "lucide-react";

export const metadata = {
  title: "API Reference - Wormhole Documentation",
  description: "Technical API documentation for Wormhole developers.",
};

export default function ApiPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/docs" className="hover:text-white">Docs</Link>
          <span>/</span>
          <span className="text-zinc-400">API Reference</span>
        </div>
        <h1 className="text-4xl font-bold text-white tracking-tight">
          API Reference
        </h1>
        <p className="text-xl text-zinc-400">
          Technical documentation for integrating with Wormhole programmatically.
        </p>
      </div>

      {/* Overview */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Overview</h2>
        <p className="text-zinc-300">
          Wormhole provides several integration points for developers:
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <Terminal className="h-6 w-6 text-green-400" />
                <h3 className="font-semibold text-white">CLI Interface</h3>
              </div>
              <p className="text-zinc-400 text-sm">
                All Wormhole functionality is available via the command-line interface.
                Use <code>--format json</code> for machine-readable output.
              </p>
              <Link href="/docs/cli" className="text-wormhole-hunter-light text-sm hover:underline mt-2 inline-block">
                CLI Reference →
              </Link>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <FileCode className="h-6 w-6 text-blue-400" />
                <h3 className="font-semibold text-white">Wire Protocol</h3>
              </div>
              <p className="text-zinc-400 text-sm">
                The binary protocol used for peer-to-peer communication.
                Documented for implementers of compatible clients.
              </p>
              <Link href="/docs/architecture/protocol" className="text-wormhole-hunter-light text-sm hover:underline mt-2 inline-block">
                Protocol Docs →
              </Link>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <Webhook className="h-6 w-6 text-wormhole-hunter-light" />
                <h3 className="font-semibold text-white">Signal Server API</h3>
              </div>
              <p className="text-zinc-400 text-sm">
                WebSocket API for the signal/rendezvous server. Used for peer
                discovery and NAT traversal.
              </p>
              <Link href="/docs/api/signal" className="text-wormhole-hunter-light text-sm hover:underline mt-2 inline-block">
                Signal API →
              </Link>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <Code className="h-6 w-6 text-orange-400" />
                <h3 className="font-semibold text-white">Rust Crates</h3>
              </div>
              <p className="text-zinc-400 text-sm">
                The Wormhole Rust libraries can be used directly in your
                Rust applications for embedding functionality.
              </p>
              <Link href="/docs/api/rust" className="text-wormhole-hunter-light text-sm hover:underline mt-2 inline-block">
                Rust API →
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CLI JSON Output */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">CLI JSON Output</h2>
        <p className="text-zinc-300">
          All CLI commands support JSON output for scripting and automation:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-sm overflow-x-auto">
              <code className="text-zinc-300">{`# Get status as JSON
wormhole status --format json | jq '.connections[0].id'

# List with JSON output
wormhole list --format json | jq '.shares | length'

# Host and capture join code
CODE=$(wormhole host ~/folder --format json | jq -r '.join_code')
echo "Join code: $CODE"`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Exit Codes */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Exit Codes</h2>
        <p className="text-zinc-300">
          Standard exit codes used across all CLI commands:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Code</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Meaning</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-green-400">0</td>
                <td className="py-3 px-4">Success</td>
                <td className="py-3 px-4">Command completed successfully</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-yellow-400">1</td>
                <td className="py-3 px-4">General Error</td>
                <td className="py-3 px-4">Unspecified error occurred</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-yellow-400">2</td>
                <td className="py-3 px-4">Usage Error</td>
                <td className="py-3 px-4">Invalid arguments or options</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-red-400">3</td>
                <td className="py-3 px-4">Connection Error</td>
                <td className="py-3 px-4">Network or connection failure</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-red-400">4</td>
                <td className="py-3 px-4">Authentication Error</td>
                <td className="py-3 px-4">Invalid code, password, or certificate</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-red-400">5</td>
                <td className="py-3 px-4">Permission Denied</td>
                <td className="py-3 px-4">Access denied by host or system</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-red-400">6</td>
                <td className="py-3 px-4">FUSE Error</td>
                <td className="py-3 px-4">Filesystem mount/unmount failure</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-red-400">10</td>
                <td className="py-3 px-4">Timeout</td>
                <td className="py-3 px-4">Operation timed out</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Environment Variables */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Environment Variables</h2>
        <p className="text-zinc-300">
          Configure Wormhole behavior via environment variables:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Variable</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Description</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Default</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-wormhole-hunter-light">WORMHOLE_SIGNAL_SERVER</td>
                <td className="py-3 px-4">Default signal server URL</td>
                <td className="py-3 px-4 text-zinc-500">wss://signal.wormhole.app</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-wormhole-hunter-light">WORMHOLE_PORT</td>
                <td className="py-3 px-4">Default QUIC port</td>
                <td className="py-3 px-4 text-zinc-500">4433</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-wormhole-hunter-light">WORMHOLE_CACHE_DIR</td>
                <td className="py-3 px-4">Disk cache directory</td>
                <td className="py-3 px-4 text-zinc-500">~/.cache/wormhole</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-wormhole-hunter-light">WORMHOLE_CONFIG_DIR</td>
                <td className="py-3 px-4">Config directory</td>
                <td className="py-3 px-4 text-zinc-500">~/.config/wormhole</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-wormhole-hunter-light">WORMHOLE_LOG_LEVEL</td>
                <td className="py-3 px-4">Logging verbosity</td>
                <td className="py-3 px-4 text-zinc-500">info</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-wormhole-hunter-light">WORMHOLE_CACHE_RAM_MB</td>
                <td className="py-3 px-4">RAM cache size (MB)</td>
                <td className="py-3 px-4 text-zinc-500">512</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-wormhole-hunter-light">WORMHOLE_CACHE_DISK_GB</td>
                <td className="py-3 px-4">Disk cache size (GB)</td>
                <td className="py-3 px-4 text-zinc-500">10</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-wormhole-hunter-light">NO_COLOR</td>
                <td className="py-3 px-4">Disable colored output</td>
                <td className="py-3 px-4 text-zinc-500">-</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Error Messages */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Error Codes Reference</h2>
        <p className="text-zinc-300">
          Common error codes and their meanings:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`// Connection errors
E1001: Connection refused - host not reachable
E1002: Connection timeout - no response from host
E1003: Connection reset - host closed connection
E1004: TLS handshake failed - certificate error
E1005: PAKE failed - invalid join code or password

// Mount errors
E2001: Mount point busy - already mounted
E2002: Mount point not found - directory doesn't exist
E2003: FUSE not available - driver not installed
E2004: Permission denied - can't access mount point

// Protocol errors
E3001: Protocol version mismatch
E3002: Invalid message format
E3003: Unknown message type
E3004: Message too large

// Host errors
E4001: Path not found - shared path doesn't exist
E4002: Not a directory - can't share file
E4003: Permission denied - can't read shared path
E4004: Too many clients - connection limit reached`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Signal Server Protocol */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Signal Server WebSocket API</h2>
        <p className="text-zinc-300">
          The signal server uses JSON over WebSocket for simplicity:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`// Connect to signal server
ws://signal.example.com:8080

// Register a share (host)
→ {"type": "register", "code": "WORM-ABCD-EFGH", "addr": "203.0.113.1:4433"}
← {"type": "registered", "expires_at": 1705320000}

// Look up a share (client)
→ {"type": "lookup", "code": "WORM-ABCD-EFGH"}
← {"type": "found", "addr": "203.0.113.1:4433", "pake_msg": "..."}

// PAKE exchange (both sides)
→ {"type": "pake", "code": "WORM-ABCD-EFGH", "msg": "base64-encoded-spake2-msg"}
← {"type": "pake", "code": "WORM-ABCD-EFGH", "msg": "base64-encoded-spake2-msg"}

// Errors
← {"type": "error", "code": "E1005", "message": "Code not found"}
← {"type": "error", "code": "E1006", "message": "Code expired"}`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Related Pages */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Related Documentation</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/docs/cli/all-commands">
            <Badge variant="outline" className="border-zinc-700 hover:border-wormhole-hunter/50 cursor-pointer">
              All CLI Commands
            </Badge>
          </Link>
          <Link href="/docs/architecture/protocol">
            <Badge variant="outline" className="border-zinc-700 hover:border-wormhole-hunter/50 cursor-pointer">
              Wire Protocol
            </Badge>
          </Link>
          <Link href="/docs/self-hosting">
            <Badge variant="outline" className="border-zinc-700 hover:border-wormhole-hunter/50 cursor-pointer">
              Self-Hosting
            </Badge>
          </Link>
          <Link href="/docs/troubleshooting">
            <Badge variant="outline" className="border-zinc-700 hover:border-wormhole-hunter/50 cursor-pointer">
              Troubleshooting
            </Badge>
          </Link>
        </div>
      </section>
    </div>
  );
}
