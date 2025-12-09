import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import {
  Network,
  Server,
  HardDrive,
  Database,
  ArrowRight,
  Layers,
  Cpu,
  Wifi,
  Lock,
  FileCode,
} from "lucide-react";

export const metadata = {
  title: "Architecture - Wormhole Documentation",
  description: "Technical architecture of Wormhole. FUSE, QUIC, wire protocol, and caching systems explained.",
};

export default function ArchitecturePage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/40">
          Architecture
        </Badge>
        <h1 className="text-4xl font-bold text-white tracking-tight">
          System Architecture
        </h1>
        <p className="text-xl text-zinc-400">
          How Wormhole works under the hood - from FUSE to QUIC to the wire protocol.
        </p>
      </div>

      {/* High-Level Overview */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">High-Level Overview</h2>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-4 text-sm font-mono">
              <div className="text-center p-4 rounded bg-zinc-800 border border-zinc-700 min-w-[140px]">
                <div className="text-white font-semibold">Your App</div>
                <div className="text-xs text-zinc-500">Finder, VS Code, etc.</div>
              </div>
              <ArrowRight className="w-6 h-6 text-zinc-600 rotate-90 lg:rotate-0" />
              <div className="text-center p-4 rounded bg-zinc-800 border border-zinc-700 min-w-[140px]">
                <div className="text-white font-semibold">FUSE Mount</div>
                <div className="text-xs text-zinc-500">/mnt/wormhole</div>
              </div>
              <ArrowRight className="w-6 h-6 text-zinc-600 rotate-90 lg:rotate-0" />
              <div className="text-center p-4 rounded bg-zinc-800 border border-zinc-700 min-w-[140px]">
                <div className="text-white font-semibold">Wormhole Client</div>
                <div className="text-xs text-zinc-500">Cache + Protocol</div>
              </div>
              <ArrowRight className="w-6 h-6 text-zinc-600 rotate-90 lg:rotate-0" />
              <div className="text-center p-4 rounded bg-violet-500/20 border border-violet-500/30 min-w-[140px]">
                <div className="text-violet-300 font-semibold">QUIC Tunnel</div>
                <div className="text-xs text-violet-400">TLS 1.3 encrypted</div>
              </div>
              <ArrowRight className="w-6 h-6 text-zinc-600 rotate-90 lg:rotate-0" />
              <div className="text-center p-4 rounded bg-zinc-800 border border-zinc-700 min-w-[140px]">
                <div className="text-white font-semibold">Wormhole Host</div>
                <div className="text-xs text-zinc-500">Actual files</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="text-zinc-400">
          When you access a file through Wormhole, your application talks to the local FUSE mount. The Wormhole client checks its cache, and if needed, fetches data from the remote host over an encrypted QUIC connection.
        </p>
      </section>

      {/* Three Planes */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">The Three Planes</h2>
        <p className="text-zinc-400">
          Wormhole separates concerns into three distinct planes:
        </p>

        <div className="grid md:grid-cols-3 gap-4">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-white">
                <Lock className="w-5 h-5 text-violet-400" />
                Control Plane
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-400 mb-3">Signaling and authentication</p>
              <ul className="text-xs text-zinc-500 space-y-1">
                <li>• Signal server WebSocket</li>
                <li>• Join code generation</li>
                <li>• PAKE authentication</li>
                <li>• NAT traversal (STUN)</li>
                <li>• Peer discovery</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-white">
                <FileCode className="w-5 h-5 text-violet-400" />
                Metadata Plane
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-400 mb-3">Directory structure and attributes</p>
              <ul className="text-xs text-zinc-500 space-y-1">
                <li>• Directory listings</li>
                <li>• File attributes (size, mtime)</li>
                <li>• Inode mapping</li>
                <li>• Path resolution</li>
                <li>• Attribute caching</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-white">
                <Database className="w-5 h-5 text-violet-400" />
                Data Plane
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-400 mb-3">File content transfer</p>
              <ul className="text-xs text-zinc-500 space-y-1">
                <li>• 128KB chunk requests</li>
                <li>• Byte-range reads</li>
                <li>• Prefetching / read-ahead</li>
                <li>• L1/L2 cache</li>
                <li>• Write buffering</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Crate Structure */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Crate Structure</h2>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`wormhole/
├── crates/
│   ├── teleport-core/        # Shared library
│   │   ├── protocol.rs       # Wire protocol messages
│   │   ├── types.rs          # Core types (Inode, FileAttr, etc.)
│   │   ├── crypto.rs         # PAKE, key derivation
│   │   ├── path.rs           # Path sanitization
│   │   └── config.rs         # Configuration types
│   │
│   ├── teleport-daemon/      # Main daemon/CLI
│   │   ├── fuse.rs           # FUSE filesystem implementation
│   │   ├── host.rs           # Host server logic
│   │   ├── client.rs         # Client/mount logic
│   │   ├── cache.rs          # RAM cache (L1)
│   │   ├── disk_cache.rs     # Disk cache (L2)
│   │   ├── governor.rs       # Prefetch controller
│   │   ├── net.rs            # QUIC networking
│   │   └── bridge.rs         # Async/sync bridging
│   │
│   └── teleport-signal/      # Signal server
│       ├── server.rs         # WebSocket server
│       └── storage.rs        # Room/code storage
│
└── apps/
    ├── desktop/              # Tauri desktop app
    └── web/                  # Documentation website`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Component Deep Dives */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Component Deep Dives</h2>

        <div className="grid sm:grid-cols-2 gap-4">
          <Link href="/docs/architecture/fuse">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-violet-500/50 transition-colors h-full">
              <CardContent className="p-6">
                <HardDrive className="w-8 h-8 text-violet-400 mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">FUSE Filesystem</h3>
                <p className="text-sm text-zinc-400">
                  How we implement a virtual filesystem that intercepts file operations and forwards them over the network.
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/docs/architecture/quic">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-violet-500/50 transition-colors h-full">
              <CardContent className="p-6">
                <Wifi className="w-8 h-8 text-violet-400 mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">QUIC Protocol</h3>
                <p className="text-sm text-zinc-400">
                  Why we chose QUIC over TCP, multiplexing, 0-RTT resumption, and connection migration.
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/docs/architecture/protocol">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-violet-500/50 transition-colors h-full">
              <CardContent className="p-6">
                <Network className="w-8 h-8 text-violet-400 mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Wire Protocol</h3>
                <p className="text-sm text-zinc-400">
                  Message formats, bincode serialization, framing, and the complete list of protocol messages.
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/docs/architecture/caching">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-violet-500/50 transition-colors h-full">
              <CardContent className="p-6">
                <Database className="w-8 h-8 text-violet-400 mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Caching System</h3>
                <p className="text-sm text-zinc-400">
                  Two-tier cache architecture, LRU eviction, prefetching strategies, and offline mode.
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/docs/architecture/signal-server">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-violet-500/50 transition-colors h-full">
              <CardContent className="p-6">
                <Server className="w-8 h-8 text-violet-400 mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Signal Server</h3>
                <p className="text-sm text-zinc-400">
                  WebSocket signaling, room management, NAT traversal coordination, and self-hosting.
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/docs/security">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-violet-500/50 transition-colors h-full">
              <CardContent className="p-6">
                <Lock className="w-8 h-8 text-violet-400 mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Security Architecture</h3>
                <p className="text-sm text-zinc-400">
                  TLS 1.3, PAKE authentication, data integrity with BLAKE3, and the threat model.
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </section>

      {/* Key Design Decisions */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Key Design Decisions</h2>

        <div className="space-y-4">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Why FUSE?</h3>
              <p className="text-sm text-zinc-400">
                FUSE (Filesystem in Userspace) allows us to implement a filesystem without kernel modifications. This means:
              </p>
              <ul className="text-sm text-zinc-400 mt-2 space-y-1">
                <li>• <strong className="text-white">Portable:</strong> Works on macOS, Linux (and Windows via similar mechanisms)</li>
                <li>• <strong className="text-white">Safe:</strong> Crashes don&apos;t bring down the kernel</li>
                <li>• <strong className="text-white">Easy updates:</strong> No kernel recompilation needed</li>
                <li>• <strong className="text-white">Compatible:</strong> All applications work automatically</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Why QUIC over TCP?</h3>
              <p className="text-sm text-zinc-400">
                QUIC (RFC 9000) provides significant advantages for file transfer:
              </p>
              <ul className="text-sm text-zinc-400 mt-2 space-y-1">
                <li>• <strong className="text-white">Multiplexing:</strong> Multiple file transfers without head-of-line blocking</li>
                <li>• <strong className="text-white">Built-in TLS 1.3:</strong> Encryption with fewer round-trips</li>
                <li>• <strong className="text-white">0-RTT:</strong> Resume connections instantly after network changes</li>
                <li>• <strong className="text-white">Connection migration:</strong> Seamlessly switch between WiFi and cellular</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Why 128KB Chunks?</h3>
              <p className="text-sm text-zinc-400">
                The 128KB chunk size is a balance of several factors:
              </p>
              <ul className="text-sm text-zinc-400 mt-2 space-y-1">
                <li>• <strong className="text-white">Network efficiency:</strong> Large enough to amortize request overhead</li>
                <li>• <strong className="text-white">Cache granularity:</strong> Small enough for efficient LRU eviction</li>
                <li>• <strong className="text-white">Latency:</strong> Fast enough to fill on slow connections without stalls</li>
                <li>• <strong className="text-white">Memory:</strong> 4000 chunks = 500MB RAM cache (reasonable default)</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Async/Sync Bridge Pattern</h3>
              <p className="text-sm text-zinc-400">
                FUSE callbacks are synchronous, but our network code uses tokio (async). We bridge these with a ClientActor pattern:
              </p>
              <Card className="bg-zinc-900 border-zinc-800 mt-3">
                <CardContent className="p-0">
                  <pre className="p-4 text-xs overflow-x-auto">
                    <code className="text-zinc-300">
{`// FUSE thread (sync)             // Tokio runtime (async)
fn read(...) {                    async fn handle(req) {
  let (tx, rx) = oneshot();           let data = self.fetch().await;
  actor_tx.blocking_send(            tx.send(data);
    Request { reply: tx, ...}    }
  );
  rx.blocking_recv()
}`}
                    </code>
                  </pre>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Development Phases */}
      <section className="space-y-6 pt-8 border-t border-zinc-800">
        <h2 className="text-2xl font-bold text-white">Development Phases</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-3 text-zinc-400 font-medium">Phase</th>
                <th className="text-left py-3 text-zinc-400 font-medium">Name</th>
                <th className="text-left py-3 text-zinc-400 font-medium">Focus</th>
                <th className="text-left py-3 text-zinc-400 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 text-white">1</td>
                <td className="py-3">Hello World FS</td>
                <td className="py-3">FUSE skeleton, basic metadata</td>
                <td className="py-3"><Badge className="bg-green-500/20 text-green-400 border-green-500/40">Complete</Badge></td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 text-white">2</td>
                <td className="py-3">P2P Tunnel</td>
                <td className="py-3">QUIC, byte-range reads</td>
                <td className="py-3"><Badge className="bg-green-500/20 text-green-400 border-green-500/40">Complete</Badge></td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 text-white">3</td>
                <td className="py-3">Integration</td>
                <td className="py-3">RAM cache, prefetching</td>
                <td className="py-3"><Badge className="bg-green-500/20 text-green-400 border-green-500/40">Complete</Badge></td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 text-white">4</td>
                <td className="py-3">Performance</td>
                <td className="py-3">Disk cache, offline mode</td>
                <td className="py-3"><Badge className="bg-green-500/20 text-green-400 border-green-500/40">Complete</Badge></td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 text-white">5</td>
                <td className="py-3">Product Wrapper</td>
                <td className="py-3">Tauri GUI, installers</td>
                <td className="py-3"><Badge className="bg-green-500/20 text-green-400 border-green-500/40">Complete</Badge></td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 text-white">6</td>
                <td className="py-3">Security</td>
                <td className="py-3">Signal server, PAKE, NAT traversal</td>
                <td className="py-3"><Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40">In Progress</Badge></td>
              </tr>
              <tr>
                <td className="py-3 text-white">7</td>
                <td className="py-3">Release</td>
                <td className="py-3">Bidirectional writes, locking</td>
                <td className="py-3"><Badge variant="outline" className="border-zinc-700 text-zinc-500">Planned</Badge></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
