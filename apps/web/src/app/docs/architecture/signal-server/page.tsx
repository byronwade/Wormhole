import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Server, Globe, Lock, ArrowRight, Users, Zap } from "lucide-react";

export const metadata = {
  title: "Signal Server - Wormhole Architecture",
  description: "How the Wormhole signal server coordinates peer discovery and connection establishment.",
};

export default function SignalServerPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/docs/architecture" className="hover:text-white">Architecture</Link>
          <span>/</span>
          <span className="text-zinc-400">Signal Server</span>
        </div>
        <h1 className="text-4xl font-bold text-white tracking-tight">
          Signal Server
        </h1>
        <p className="text-xl text-zinc-400">
          The rendezvous service that helps Wormhole peers discover and connect to each other.
        </p>
      </div>

      {/* What is the Signal Server */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">What is the Signal Server?</h2>
        <p className="text-zinc-300">
          The signal server is a lightweight WebSocket-based rendezvous service that helps peers find each other.
          It does <strong className="text-white">not</strong> transfer files or see your data—it only exchanges
          connection metadata to help establish direct peer-to-peer connections.
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              <div className="flex justify-center items-center gap-4 text-sm flex-wrap">
                <div className="px-4 py-2 bg-wormhole-hunter/20 border border-wormhole-hunter/30 rounded">
                  Host<br/><span className="text-zinc-500 text-xs">Shares folder</span>
                </div>
                <ArrowRight className="h-5 w-5 text-zinc-600" />
                <div className="px-4 py-2 bg-yellow-500/20 border border-yellow-500/30 rounded">
                  Signal Server<br/><span className="text-zinc-500 text-xs">Exchanges metadata</span>
                </div>
                <ArrowRight className="h-5 w-5 text-zinc-600" />
                <div className="px-4 py-2 bg-blue-500/20 border border-blue-500/30 rounded">
                  Client<br/><span className="text-zinc-500 text-xs">Mounts folder</span>
                </div>
              </div>
              <div className="pt-4 border-t border-zinc-800">
                <div className="flex justify-center items-center gap-4 text-sm">
                  <div className="px-4 py-2 bg-wormhole-hunter/20 border border-wormhole-hunter/30 rounded">
                    Host
                  </div>
                  <div className="flex items-center gap-2 text-green-400">
                    <ArrowRight className="h-5 w-5" />
                    <span className="text-xs">Direct P2P</span>
                    <ArrowRight className="h-5 w-5" />
                  </div>
                  <div className="px-4 py-2 bg-blue-500/20 border border-blue-500/30 rounded">
                    Client
                  </div>
                </div>
              </div>
              <p className="text-zinc-500 text-xs">Signal server only used for initial handshake, then direct connection</p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* How it Works */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">How it Works</h2>
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-wormhole-hunter/20 flex items-center justify-center text-wormhole-hunter-light font-bold">
              1
            </div>
            <div>
              <h3 className="font-semibold text-white">Host Creates Room</h3>
              <p className="text-zinc-400 text-sm">
                When you run <code className="text-wormhole-hunter-light">wormhole host</code>, the daemon connects
                to the signal server and creates a &quot;room&quot; identified by the join code (e.g., WORM-7X9K-BETA).
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-wormhole-hunter/20 flex items-center justify-center text-wormhole-hunter-light font-bold">
              2
            </div>
            <div>
              <h3 className="font-semibold text-white">Client Joins Room</h3>
              <p className="text-zinc-400 text-sm">
                When someone runs <code className="text-wormhole-hunter-light">wormhole mount WORM-7X9K-BETA</code>,
                their client joins the same room on the signal server.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-wormhole-hunter/20 flex items-center justify-center text-wormhole-hunter-light font-bold">
              3
            </div>
            <div>
              <h3 className="font-semibold text-white">Exchange Connection Info</h3>
              <p className="text-zinc-400 text-sm">
                The signal server relays each peer&apos;s public IP, port, and SPAKE2 handshake messages.
                This is the only data that passes through the server.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-wormhole-hunter/20 flex items-center justify-center text-wormhole-hunter-light font-bold">
              4
            </div>
            <div>
              <h3 className="font-semibold text-white">Direct QUIC Connection</h3>
              <p className="text-zinc-400 text-sm">
                Once peers have each other&apos;s addresses and have completed PAKE authentication,
                they establish a direct QUIC connection. The signal server is no longer involved.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What the Server Sees */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">What the Server Sees</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <h3 className="font-semibold text-green-400 mb-2">Server Sees</h3>
              <ul className="space-y-2 text-zinc-300 text-sm">
                <li>- Join code (room identifier)</li>
                <li>- Public IP addresses of peers</li>
                <li>- SPAKE2 handshake bytes (encrypted)</li>
                <li>- Connection timestamps</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <h3 className="font-semibold text-red-400 mb-2">Server Never Sees</h3>
              <ul className="space-y-2 text-zinc-300 text-sm">
                <li>- File names or contents</li>
                <li>- Directory structure</li>
                <li>- Decrypted session keys</li>
                <li>- Any user data whatsoever</li>
              </ul>
            </CardContent>
          </Card>
        </div>
        <div className="p-4 bg-wormhole-hunter/10 border border-wormhole-hunter/20 rounded-lg">
          <p className="text-wormhole-hunter-light text-sm">
            <strong>Privacy by Design:</strong> The signal server is designed to know as little as possible.
            Even if compromised, an attacker would only learn that certain IPs connected at certain times—not
            what they shared.
          </p>
        </div>
      </section>

      {/* Implementation */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Implementation</h2>
        <p className="text-zinc-300">
          The signal server is implemented in Rust using <code className="text-wormhole-hunter-light">tokio</code> and{" "}
          <code className="text-wormhole-hunter-light">tokio-tungstenite</code> for WebSocket support.
          The code lives in <code className="text-wormhole-hunter-light">crates/teleport-signal/</code>.
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`// Room management
pub struct SignalServer {
    rooms: RwLock<HashMap<JoinCode, Room>>,
}

pub struct Room {
    host: Option<PeerConnection>,
    clients: Vec<PeerConnection>,
    created_at: Instant,
    // Rooms expire after 24 hours of inactivity
}

// Messages between peers
enum SignalMessage {
    // Host -> Server
    CreateRoom { code: JoinCode },

    // Client -> Server
    JoinRoom { code: JoinCode },

    // Server -> Both
    PeerJoined { peer_id: PeerId, addr: SocketAddr },

    // Peer -> Peer (relayed)
    IceCandidate { candidate: String },
    SpakeMessage { bytes: Vec<u8> },
}`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Public Signal Server */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Public Signal Server</h2>
        <p className="text-zinc-300">
          Wormhole operates a public signal server for convenience. You don&apos;t need to run your own
          unless you have specific requirements.
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-zinc-500 text-xs mb-1">Primary Server</p>
                <p className="font-mono text-wormhole-hunter-light">wss://signal.wormhole.dev</p>
              </div>
              <div>
                <p className="text-zinc-500 text-xs mb-1">Hosted On</p>
                <p className="text-zinc-300">Fly.io (multiple regions)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Self-Hosting */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Self-Hosting</h2>
        <p className="text-zinc-300">
          For privacy-conscious users or organizations, you can run your own signal server:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-sm overflow-x-auto">
              <code className="text-zinc-300">{`# Build and run the signal server
cargo build -p teleport-signal --release
./target/release/wormhole-signal --port 8080

# Or use Docker
docker run -p 8080:8080 ghcr.io/byronwade/wormhole-signal

# Configure clients to use your server
wormhole host ~/folder --signal wss://signal.yourdomain.com
wormhole mount WORM-XXXX --signal wss://signal.yourdomain.com`}</code>
            </pre>
          </CardContent>
        </Card>
        <p className="text-zinc-400 text-sm">
          See the <Link href="/docs/self-hosting" className="text-wormhole-hunter-light hover:underline">
            Self-Hosting Guide
          </Link> for detailed instructions on deploying your own signal server.
        </p>
      </section>

      {/* NAT Traversal */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">NAT Traversal</h2>
        <p className="text-zinc-300">
          The signal server helps with NAT traversal by exchanging public addresses. However,
          some network configurations may require additional techniques:
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <Zap className="w-6 h-6 text-green-400 mb-2" />
              <h3 className="font-semibold text-white mb-1">Direct Connect</h3>
              <p className="text-zinc-400 text-sm">
                Works when both peers have public IPs or are on the same network.
              </p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <Globe className="w-6 h-6 text-yellow-400 mb-2" />
              <h3 className="font-semibold text-white mb-1">STUN/TURN</h3>
              <p className="text-zinc-400 text-sm">
                Used for symmetric NATs. TURN relay is a last resort.
              </p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <Server className="w-6 h-6 text-blue-400 mb-2" />
              <h3 className="font-semibold text-white mb-1">Hole Punching</h3>
              <p className="text-zinc-400 text-sm">
                Coordinates simultaneous connection attempts through NAT.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* See Also */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">See Also</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/docs/security/pake">
            <Badge variant="outline" className="border-zinc-700 hover:border-wormhole-hunter/50 cursor-pointer">
              PAKE Authentication
            </Badge>
          </Link>
          <Link href="/docs/self-hosting">
            <Badge variant="outline" className="border-zinc-700 hover:border-wormhole-hunter/50 cursor-pointer">
              Self-Hosting Guide
            </Badge>
          </Link>
          <Link href="/docs/architecture/quic">
            <Badge variant="outline" className="border-zinc-700 hover:border-wormhole-hunter/50 cursor-pointer">
              QUIC Protocol
            </Badge>
          </Link>
        </div>
      </section>
    </div>
  );
}
