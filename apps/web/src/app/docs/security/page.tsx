import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Link from "next/link";
import {
  Shield,
  Lock,
  Key,
  Eye,
  Server,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Fingerprint,
  Network,
  FileCode,
} from "lucide-react";

export const metadata = {
  title: "Security - Wormhole Documentation",
  description: "Security architecture of Wormhole. Encryption, authentication, access control, and threat model.",
};

export default function SecurityPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/40">
          Security
        </Badge>
        <h1 className="text-4xl font-bold text-white tracking-tight">
          Security Architecture
        </h1>
        <p className="text-xl text-zinc-400">
          How Wormhole protects your files with end-to-end encryption, password-authenticated key exchange, and defense-in-depth security.
        </p>
      </div>

      {/* Security Overview */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Security at a Glance</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-6 text-center">
              <Lock className="w-8 h-8 text-green-400 mx-auto mb-3" />
              <h3 className="font-semibold text-white mb-1">E2E Encrypted</h3>
              <p className="text-sm text-zinc-400">TLS 1.3 via QUIC</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-6 text-center">
              <Key className="w-8 h-8 text-green-400 mx-auto mb-3" />
              <h3 className="font-semibold text-white mb-1">PAKE Auth</h3>
              <p className="text-sm text-zinc-400">SPAKE2 protocol</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-6 text-center">
              <Server className="w-8 h-8 text-green-400 mx-auto mb-3" />
              <h3 className="font-semibold text-white mb-1">No Cloud</h3>
              <p className="text-sm text-zinc-400">Files never leave your machine</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-6 text-center">
              <Eye className="w-8 h-8 text-green-400 mx-auto mb-3" />
              <h3 className="font-semibold text-white mb-1">Zero Knowledge</h3>
              <p className="text-sm text-zinc-400">Signal server can&apos;t see your files</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Encryption */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Lock className="w-6 h-6 text-violet-400" />
          Encryption
        </h2>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Transport Layer Security</h3>
              <p className="text-zinc-400 mb-4">
                All Wormhole connections use <strong className="text-white">TLS 1.3</strong> via the QUIC protocol (RFC 9000). This provides:
              </p>
              <ul className="space-y-2 text-sm text-zinc-400">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5" />
                  <span><strong className="text-white">Forward Secrecy:</strong> Session keys are ephemeral - past sessions can&apos;t be decrypted even if long-term keys are compromised</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5" />
                  <span><strong className="text-white">Authenticated Encryption:</strong> AEAD (AES-256-GCM or ChaCha20-Poly1305) provides both confidentiality and integrity</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5" />
                  <span><strong className="text-white">Modern Cryptography:</strong> X25519 for key exchange, SHA-256 for handshake hashing</span>
                </li>
              </ul>
            </div>

            <div className="pt-4 border-t border-zinc-800">
              <h4 className="font-medium text-white mb-2">Implementation</h4>
              <p className="text-sm text-zinc-400">
                We use <code className="bg-zinc-800 px-1 rounded">rustls</code> (a memory-safe TLS implementation in Rust) with the <code className="bg-zinc-800 px-1 rounded">ring</code> crypto backend. No OpenSSL, no C code in the crypto path.
              </p>
            </div>
          </CardContent>
        </Card>

        <Link href="/docs/security/encryption" className="inline-flex items-center text-violet-400 hover:underline">
          Learn more about encryption implementation
          <ArrowRight className="w-4 h-4 ml-1" />
        </Link>
      </section>

      {/* PAKE Authentication */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Fingerprint className="w-6 h-6 text-violet-400" />
          Password-Authenticated Key Exchange (PAKE)
        </h2>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">How Join Codes Work</h3>
              <p className="text-zinc-400 mb-4">
                Wormhole uses <strong className="text-white">SPAKE2</strong> (Simple Password-Authenticated Key Exchange) to derive encryption keys from short join codes. This is the same protocol used by Magic Wormhole and Google&apos;s security keys.
              </p>

              <div className="bg-zinc-900 rounded-lg p-4 font-mono text-sm mb-4">
                <div className="text-zinc-500 mb-2"># Join code format (16 characters, ~80 bits entropy)</div>
                <div className="text-violet-400">WORM-7X9K-ABCD-EFGH</div>
              </div>

              <ul className="space-y-2 text-sm text-zinc-400">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5" />
                  <span><strong className="text-white">No Password Transmission:</strong> The password never leaves your device - only cryptographic proofs are exchanged</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5" />
                  <span><strong className="text-white">Mutual Authentication:</strong> Both parties prove knowledge of the join code</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5" />
                  <span><strong className="text-white">Signal Server Ignorance:</strong> The signal server facilitates connection but cannot decrypt traffic</span>
                </li>
              </ul>
            </div>

            <div className="pt-4 border-t border-zinc-800">
              <h4 className="font-medium text-white mb-2">Security Guarantees</h4>
              <p className="text-sm text-zinc-400">
                Even if an attacker controls the signal server, they cannot:
              </p>
              <ul className="text-sm text-zinc-400 mt-2 space-y-1">
                <li>• Decrypt file transfers between peers</li>
                <li>• Brute-force the join code (rate-limited + high entropy)</li>
                <li>• Perform man-in-the-middle attacks (PAKE prevents this)</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Link href="/docs/security/pake" className="inline-flex items-center text-violet-400 hover:underline">
          Deep dive into PAKE implementation
          <ArrowRight className="w-4 h-4 ml-1" />
        </Link>
      </section>

      {/* Data Integrity */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <FileCode className="w-6 h-6 text-violet-400" />
          Data Integrity
        </h2>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Chunk Verification</h3>
              <p className="text-zinc-400 mb-4">
                Every 128KB chunk is verified with a <strong className="text-white">BLAKE3</strong> cryptographic hash. Corrupted or tampered chunks are rejected.
              </p>

              <div className="bg-zinc-900 rounded-lg p-4 font-mono text-xs overflow-x-auto">
                <div className="text-zinc-500"># Each chunk includes:</div>
                <div className="text-zinc-300">ChunkResponse {'{'}</div>
                <div className="text-zinc-300 ml-4">data: Vec&lt;u8&gt;,      <span className="text-zinc-500">{/* 128KB payload */}</span></div>
                <div className="text-zinc-300 ml-4">checksum: [u8; 32], <span className="text-zinc-500">{/* BLAKE3 hash */}</span></div>
                <div className="text-zinc-300">{'}'}</div>
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-800">
              <h4 className="font-medium text-white mb-2">Why BLAKE3?</h4>
              <ul className="text-sm text-zinc-400 space-y-1">
                <li>• <strong className="text-white">Fast:</strong> 3x faster than SHA-256, parallelizable</li>
                <li>• <strong className="text-white">Secure:</strong> Based on BLAKE2 (used in Argon2, WireGuard)</li>
                <li>• <strong className="text-white">Streaming:</strong> Supports incremental hashing</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Threat Model */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-amber-400" />
          Threat Model
        </h2>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-3 text-zinc-400 font-medium">Threat</th>
                    <th className="text-left py-3 text-zinc-400 font-medium">Mitigation</th>
                    <th className="text-left py-3 text-zinc-400 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 text-white">Passive Eavesdropping</td>
                    <td className="py-3">TLS 1.3 encryption on all traffic</td>
                    <td className="py-3"><Badge className="bg-green-500/20 text-green-400 border-green-500/40">Protected</Badge></td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 text-white">Man-in-the-Middle</td>
                    <td className="py-3">PAKE authentication + certificate pinning</td>
                    <td className="py-3"><Badge className="bg-green-500/20 text-green-400 border-green-500/40">Protected</Badge></td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 text-white">Path Traversal</td>
                    <td className="py-3">Canonicalization + prefix validation</td>
                    <td className="py-3"><Badge className="bg-green-500/20 text-green-400 border-green-500/40">Protected</Badge></td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 text-white">Symlink Escape</td>
                    <td className="py-3">Symlinks skipped in scanning, validated in safe_path</td>
                    <td className="py-3"><Badge className="bg-green-500/20 text-green-400 border-green-500/40">Protected</Badge></td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 text-white">DoS (Denial of Service)</td>
                    <td className="py-3">Rate limiting, max request size (1MB), bounded channels</td>
                    <td className="py-3"><Badge className="bg-green-500/20 text-green-400 border-green-500/40">Protected</Badge></td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 text-white">Lock Starvation</td>
                    <td className="py-3">TTL-based locks with automatic expiration</td>
                    <td className="py-3"><Badge className="bg-green-500/20 text-green-400 border-green-500/40">Protected</Badge></td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 text-white">Malicious Signal Server</td>
                    <td className="py-3">E2E encryption via PAKE - server can&apos;t decrypt</td>
                    <td className="py-3"><Badge className="bg-green-500/20 text-green-400 border-green-500/40">Protected</Badge></td>
                  </tr>
                  <tr>
                    <td className="py-3 text-white">Local Disk Cache Access</td>
                    <td className="py-3">OS file permissions + optional secure deletion</td>
                    <td className="py-3"><Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40">User Responsibility</Badge></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Link href="/docs/security/threat-model" className="inline-flex items-center text-violet-400 hover:underline">
          Full threat model documentation
          <ArrowRight className="w-4 h-4 ml-1" />
        </Link>
      </section>

      {/* What We Don't Protect Against */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Limitations</h2>
        <Alert className="bg-amber-500/10 border-amber-500/30">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <AlertTitle className="text-amber-400">Security Boundaries</AlertTitle>
          <AlertDescription className="text-zinc-400">
            Wormhole protects data <strong>in transit</strong>. It does not protect against:
          </AlertDescription>
        </Alert>

        <ul className="space-y-2 text-sm text-zinc-400">
          <li className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" />
            <span><strong className="text-white">Compromised endpoints:</strong> If either machine has malware, your files are at risk</span>
          </li>
          <li className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" />
            <span><strong className="text-white">Shoulder surfing:</strong> Someone physically watching you enter the join code</span>
          </li>
          <li className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" />
            <span><strong className="text-white">Weak join codes:</strong> If you choose your own code, make it random</span>
          </li>
          <li className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" />
            <span><strong className="text-white">Metadata analysis:</strong> Connection timing/size patterns may leak information</span>
          </li>
        </ul>
      </section>

      {/* Security Best Practices */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Best Practices</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-6">
              <h3 className="font-semibold text-white mb-3">For Hosts</h3>
              <ul className="text-sm text-zinc-400 space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5" />
                  <span>Use <code className="bg-zinc-800 px-1 rounded">--expire-after</code> for temporary shares</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5" />
                  <span>Add <code className="bg-zinc-800 px-1 rounded">--password</code> for sensitive data</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5" />
                  <span>Use <code className="bg-zinc-800 px-1 rounded">--allow-ips</code> to whitelist clients</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5" />
                  <span>Avoid <code className="bg-zinc-800 px-1 rounded">--allow-write</code> unless necessary</span>
                </li>
              </ul>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-6">
              <h3 className="font-semibold text-white mb-3">For Clients</h3>
              <ul className="text-sm text-zinc-400 space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5" />
                  <span>Verify join codes through a secure channel</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5" />
                  <span>Use <code className="bg-zinc-800 px-1 rounded">--read-only</code> if you don&apos;t need writes</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5" />
                  <span>Clear cache after accessing sensitive files</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5" />
                  <span>Run your own signal server for sensitive deployments</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Audit & Verify */}
      <section className="space-y-6 pt-8 border-t border-zinc-800">
        <h2 className="text-2xl font-bold text-white">Audit & Verify</h2>
        <p className="text-zinc-400">
          Wormhole is open source. You can audit the code yourself:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# Clone and review
git clone https://github.com/byronwade/wormhole.git

# Key security-critical files:
crates/teleport-core/src/crypto.rs    # PAKE, key derivation
crates/teleport-core/src/path.rs      # Path sanitization
crates/teleport-daemon/src/net.rs     # TLS/QUIC setup`}
              </code>
            </pre>
          </CardContent>
        </Card>

        <Link href="/docs/security/audit" className="inline-flex items-center text-violet-400 hover:underline">
          Security audit guide
          <ArrowRight className="w-4 h-4 ml-1" />
        </Link>
      </section>
    </div>
  );
}
