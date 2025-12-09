import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Zap, Lock, Layers, ArrowLeftRight, RefreshCw } from "lucide-react";

export const metadata = {
  title: "QUIC Protocol - Wormhole Architecture",
  description: "How Wormhole uses QUIC for fast, secure, multiplexed transport.",
};

export default function QuicArchitecturePage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/docs/architecture" className="hover:text-white">Architecture</Link>
          <span>/</span>
          <span className="text-zinc-400">QUIC</span>
        </div>
        <h1 className="text-4xl font-bold text-white tracking-tight">
          QUIC Transport Protocol
        </h1>
        <p className="text-xl text-zinc-400">
          Wormhole uses QUIC (RFC 9000) for fast, secure, multiplexed data transfer.
        </p>
      </div>

      {/* What is QUIC */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">What is QUIC?</h2>
        <p className="text-zinc-300">
          QUIC is a modern transport protocol originally developed by Google and now
          standardized as RFC 9000. It runs over UDP and provides:
        </p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-6">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4 text-center">
              <Zap className="h-8 w-8 text-yellow-400 mx-auto mb-2" />
              <h3 className="font-semibold text-white">Low Latency</h3>
              <p className="text-zinc-400 text-sm mt-1">0-RTT connection establishment</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4 text-center">
              <Lock className="h-8 w-8 text-green-400 mx-auto mb-2" />
              <h3 className="font-semibold text-white">Built-in TLS</h3>
              <p className="text-zinc-400 text-sm mt-1">TLS 1.3 mandatory</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4 text-center">
              <Layers className="h-8 w-8 text-violet-400 mx-auto mb-2" />
              <h3 className="font-semibold text-white">Multiplexing</h3>
              <p className="text-zinc-400 text-sm mt-1">Multiple streams, no HOL blocking</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4 text-center">
              <RefreshCw className="h-8 w-8 text-blue-400 mx-auto mb-2" />
              <h3 className="font-semibold text-white">Connection Migration</h3>
              <p className="text-zinc-400 text-sm mt-1">Survives IP changes</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Why QUIC for Wormhole */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Why QUIC for Wormhole?</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <h3 className="font-semibold text-green-400 mb-3">Perfect for File Transfer</h3>
              <ul className="space-y-2 text-zinc-300 text-sm">
                <li><strong>Streams:</strong> Each file read is a separate stream - if one stalls,
                  others continue.</li>
                <li><strong>No HOL Blocking:</strong> Unlike TCP, a lost packet doesn&apos;t block
                  other streams.</li>
                <li><strong>Congestion Control:</strong> Per-stream flow control prevents
                  slow files from blocking fast ones.</li>
                <li><strong>0-RTT:</strong> Reconnecting to a known host is instant.</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <h3 className="font-semibold text-green-400 mb-3">Security Built-In</h3>
              <ul className="space-y-2 text-zinc-300 text-sm">
                <li><strong>TLS 1.3:</strong> All traffic encrypted, always.</li>
                <li><strong>No Plaintext:</strong> Even connection headers are encrypted.</li>
                <li><strong>Certificate Pinning:</strong> Wormhole validates peer certificates.</li>
                <li><strong>Forward Secrecy:</strong> Past traffic can&apos;t be decrypted.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* QUIC vs TCP */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">QUIC vs TCP Comparison</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Feature</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">TCP + TLS</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">QUIC</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4">Connection Setup</td>
                <td className="py-3 px-4 text-yellow-400">3 RTT (TCP + TLS handshake)</td>
                <td className="py-3 px-4 text-green-400">1 RTT (0-RTT for repeat)</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4">Head-of-Line Blocking</td>
                <td className="py-3 px-4 text-red-400">Yes (packet loss blocks all)</td>
                <td className="py-3 px-4 text-green-400">No (per-stream only)</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4">Encryption</td>
                <td className="py-3 px-4 text-yellow-400">Optional TLS layer</td>
                <td className="py-3 px-4 text-green-400">Mandatory TLS 1.3</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4">Multiplexing</td>
                <td className="py-3 px-4 text-red-400">Requires HTTP/2</td>
                <td className="py-3 px-4 text-green-400">Native streams</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4">Connection Migration</td>
                <td className="py-3 px-4 text-red-400">No (IP change = reconnect)</td>
                <td className="py-3 px-4 text-green-400">Yes (connection ID based)</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4">NAT Traversal</td>
                <td className="py-3 px-4 text-red-400">Needs additional tools</td>
                <td className="py-3 px-4 text-green-400">Better (UDP-based)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Wormhole's QUIC Implementation */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Wormhole&apos;s Implementation</h2>
        <p className="text-zinc-300">
          Wormhole uses the <code className="text-violet-400">quinn</code> crate for QUIC
          and <code className="text-violet-400">rustls</code> for TLS. The implementation
          is in <code className="text-violet-400">crates/teleport-daemon/src/net.rs</code>.
        </p>

        <h3 className="text-lg font-semibold text-white mt-6">Connection Setup</h3>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`// Server (Host) setup
let server_config = ServerConfig::with_single_cert(
    vec![cert],      // TLS certificate
    private_key,     // TLS private key
)?;

let endpoint = Endpoint::server(server_config, bind_addr)?;

// Accept connections
while let Some(connecting) = endpoint.accept().await {
    let connection = connecting.await?;
    tokio::spawn(handle_connection(connection));
}

// Client (Mount) setup
let client_config = ClientConfig::with_root_certificates(root_certs);
let endpoint = Endpoint::client(bind_addr)?;

// Connect to host
let connection = endpoint
    .connect_with(client_config, host_addr, server_name)?
    .await?;`}</code>
            </pre>
          </CardContent>
        </Card>

        <h3 className="text-lg font-semibold text-white mt-6">Stream Management</h3>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`// Bidirectional stream for request/response
let (mut send, mut recv) = connection.open_bi().await?;

// Send request
let request = Request::ReadChunk { inode, offset, size };
send.write_all(&bincode::serialize(&request)?).await?;
send.finish().await?;

// Receive response
let response: Response = bincode::deserialize(&recv.read_to_end(MAX_SIZE).await?)?;

// Unidirectional stream for notifications
let send = connection.open_uni().await?;
send.write_all(&notification_data).await?;`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Stream Types */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Stream Usage</h2>
        <p className="text-zinc-300">
          Wormhole uses different stream types for different purposes:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Stream Type</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Direction</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Use Case</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-violet-400">Control Stream</td>
                <td className="py-3 px-4">Bidirectional</td>
                <td className="py-3 px-4">Handshake, metadata queries, keepalives</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-violet-400">Data Streams</td>
                <td className="py-3 px-4">Bidirectional</td>
                <td className="py-3 px-4">Chunk requests and responses</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-violet-400">Notification Stream</td>
                <td className="py-3 px-4">Unidirectional (host→client)</td>
                <td className="py-3 px-4">File change notifications, invalidations</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-violet-400">Write Stream</td>
                <td className="py-3 px-4">Unidirectional (client→host)</td>
                <td className="py-3 px-4">File writes (Phase 7)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Congestion Control */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Congestion Control</h2>
        <p className="text-zinc-300">
          QUIC implements congestion control at the protocol level. Wormhole uses Quinn&apos;s
          default controller (based on CUBIC) but can be tuned:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-sm">
              <code className="text-zinc-300">{`// Configuration options in quinn
TransportConfig {
    // Initial congestion window
    initial_rtt: Duration::from_millis(100),

    // Flow control limits
    max_concurrent_bidi_streams: 100,
    max_concurrent_uni_streams: 100,

    // Stream receive window
    stream_receive_window: 10 * 1024 * 1024,  // 10MB

    // Connection receive window
    receive_window: 50 * 1024 * 1024,         // 50MB

    // Keepalive
    keep_alive_interval: Some(Duration::from_secs(15)),
}`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Connection Migration */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Connection Migration</h2>
        <p className="text-zinc-300">
          QUIC connections survive IP address changes (e.g., WiFi → cellular). This is
          especially useful for laptops moving between networks:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              <div className="flex justify-center items-center gap-4 text-sm">
                <div className="px-4 py-2 bg-blue-500/20 border border-blue-500/30 rounded">
                  Client<br/><span className="text-zinc-500 text-xs">192.168.1.42</span>
                </div>
                <ArrowLeftRight className="h-5 w-5 text-green-400" />
                <div className="px-4 py-2 bg-violet-500/20 border border-violet-500/30 rounded">
                  Host<br/><span className="text-zinc-500 text-xs">Connection ID: abc123</span>
                </div>
              </div>
              <p className="text-zinc-500 text-xs">↓ Client switches to cellular</p>
              <div className="flex justify-center items-center gap-4 text-sm">
                <div className="px-4 py-2 bg-blue-500/20 border border-blue-500/30 rounded">
                  Client<br/><span className="text-zinc-500 text-xs">10.0.0.15</span>
                </div>
                <ArrowLeftRight className="h-5 w-5 text-green-400" />
                <div className="px-4 py-2 bg-violet-500/20 border border-violet-500/30 rounded">
                  Host<br/><span className="text-zinc-500 text-xs">Connection ID: abc123</span>
                </div>
              </div>
              <p className="text-green-400 text-sm">Same connection, no interruption!</p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* TLS Configuration */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">TLS Configuration</h2>
        <p className="text-zinc-300">
          Wormhole uses rustls with a strict TLS 1.3-only configuration:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`// Cipher suites (in preference order)
TLS13_AES_256_GCM_SHA384
TLS13_AES_128_GCM_SHA256
TLS13_CHACHA20_POLY1305_SHA256

// Key exchange
X25519 (ECDHE)

// Signature algorithms
Ed25519
ECDSA-P256
RSA-PSS

// Certificate validation
- Self-signed allowed for join code connections
- Custom CA support for enterprise deployments
- Certificate pinning for known peers`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* See Also */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">See Also</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/docs/architecture/protocol">
            <Badge variant="outline" className="border-zinc-700 hover:border-violet-500/50 cursor-pointer">
              Wire Protocol
            </Badge>
          </Link>
          <Link href="/docs/security/encryption">
            <Badge variant="outline" className="border-zinc-700 hover:border-violet-500/50 cursor-pointer">
              Encryption Details
            </Badge>
          </Link>
          <Link href="/docs/performance/network">
            <Badge variant="outline" className="border-zinc-700 hover:border-violet-500/50 cursor-pointer">
              Network Performance
            </Badge>
          </Link>
        </div>
      </section>
    </div>
  );
}
