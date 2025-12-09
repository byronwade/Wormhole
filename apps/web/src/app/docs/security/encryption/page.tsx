import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Lock, Key, Shield, CheckCircle } from "lucide-react";

export const metadata = {
  title: "Encryption - Wormhole Security",
  description: "Deep dive into Wormhole's encryption implementation.",
};

export default function EncryptionPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/docs/security" className="hover:text-white">Security</Link>
          <span>/</span>
          <span className="text-zinc-400">Encryption</span>
        </div>
        <h1 className="text-4xl font-bold text-white tracking-tight">
          Encryption Details
        </h1>
        <p className="text-xl text-zinc-400">
          How Wormhole encrypts your data in transit.
        </p>
      </div>

      {/* Overview */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Overview</h2>
        <p className="text-zinc-300">
          All Wormhole traffic is encrypted using TLS 1.3 via the QUIC protocol.
          This is not optional—encryption is mandatory and cannot be disabled.
        </p>
        <div className="grid gap-4 md:grid-cols-3 mt-6">
          <Card className="bg-green-500/10 border-green-500/20">
            <CardContent className="p-4 text-center">
              <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-2" />
              <h3 className="font-semibold text-white">In Transit</h3>
              <p className="text-green-400 text-sm mt-1">Always Encrypted</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4 text-center">
              <Lock className="h-8 w-8 text-zinc-500 mx-auto mb-2" />
              <h3 className="font-semibold text-white">At Rest (Host)</h3>
              <p className="text-zinc-400 text-sm mt-1">Your responsibility</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4 text-center">
              <Lock className="h-8 w-8 text-zinc-500 mx-auto mb-2" />
              <h3 className="font-semibold text-white">At Rest (Cache)</h3>
              <p className="text-zinc-400 text-sm mt-1">OS-level encryption</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* TLS 1.3 */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Lock className="h-6 w-6 text-green-400" />
          TLS 1.3
        </h2>
        <p className="text-zinc-300">
          Wormhole uses TLS 1.3, the latest version of the Transport Layer Security protocol.
          TLS 1.3 provides significant security and performance improvements over TLS 1.2.
        </p>

        <h3 className="text-lg font-semibold text-white mt-6">Key Improvements in TLS 1.3</h3>
        <ul className="space-y-2 text-zinc-300 ml-4">
          <li>- <strong>Faster handshake:</strong> 1-RTT (vs 2-RTT in TLS 1.2)</li>
          <li>- <strong>0-RTT resumption:</strong> Instant reconnection to known hosts</li>
          <li>- <strong>Removed weak ciphers:</strong> No RC4, DES, MD5, SHA-1</li>
          <li>- <strong>Forward secrecy mandatory:</strong> All cipher suites use ECDHE</li>
          <li>- <strong>Encrypted handshake:</strong> Server certificate is encrypted</li>
        </ul>
      </section>

      {/* Cipher Suites */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Cipher Suites</h2>
        <p className="text-zinc-300">
          Wormhole uses rustls, which only supports modern, secure cipher suites:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-sm overflow-x-auto">
              <code className="text-zinc-300">{`# Supported TLS 1.3 cipher suites (in preference order)

TLS_AES_256_GCM_SHA384
  - 256-bit AES encryption in GCM mode
  - SHA-384 for HKDF
  - Best security, hardware-accelerated on most CPUs

TLS_AES_128_GCM_SHA256
  - 128-bit AES encryption in GCM mode
  - SHA-256 for HKDF
  - Excellent security, fastest on hardware-accelerated CPUs

TLS_CHACHA20_POLY1305_SHA256
  - ChaCha20 stream cipher with Poly1305 MAC
  - SHA-256 for HKDF
  - Fastest on CPUs without AES-NI (ARM, older x86)`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Key Exchange */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Key className="h-6 w-6 text-violet-400" />
          Key Exchange
        </h2>
        <p className="text-zinc-300">
          TLS 1.3 key exchange uses Elliptic Curve Diffie-Hellman Ephemeral (ECDHE):
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-sm overflow-x-auto">
              <code className="text-zinc-300">{`# Key exchange groups (in preference order)

X25519
  - Curve25519 elliptic curve
  - 128-bit security level
  - Fastest, constant-time implementation
  - Default for Wormhole

secp256r1 (P-256)
  - NIST P-256 curve
  - 128-bit security level
  - Widely supported, FIPS compliant

secp384r1 (P-384)
  - NIST P-384 curve
  - 192-bit security level
  - Higher security, slower`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Certificate Handling */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Shield className="h-6 w-6 text-blue-400" />
          Certificate Handling
        </h2>
        <p className="text-zinc-300">
          Wormhole uses self-signed certificates by default, with PAKE providing
          authentication via join codes:
        </p>

        <h3 className="text-lg font-semibold text-white mt-6">Default Mode (Join Codes)</h3>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`1. Host generates ephemeral self-signed certificate
   - Ed25519 key pair
   - Certificate valid for session duration

2. Client connects, accepts self-signed cert
   - TLS handshake establishes encrypted channel
   - Channel is encrypted but not yet authenticated

3. PAKE (SPAKE2) authenticates both parties
   - Join code is the shared password
   - PAKE proves both parties know the code
   - Derives shared secret for additional verification

4. Session key established
   - TLS provides transport encryption
   - PAKE provides mutual authentication`}</code>
            </pre>
          </CardContent>
        </Card>

        <h3 className="text-lg font-semibold text-white mt-6">Enterprise Mode (Custom Certificates)</h3>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-sm overflow-x-auto">
              <code className="text-zinc-300">{`# Use custom TLS certificates
wormhole host ~/folder \\
  --tls-cert /path/to/cert.pem \\
  --tls-key /path/to/key.pem

# Client with custom CA
wormhole mount WORM-XXXX \\
  --tls-ca /path/to/ca.pem`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Forward Secrecy */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Forward Secrecy</h2>
        <p className="text-zinc-300">
          All Wormhole connections have forward secrecy. This means:
        </p>
        <ul className="space-y-2 text-zinc-300 ml-4">
          <li>- Each connection uses unique ephemeral keys</li>
          <li>- If a private key is later compromised, past traffic cannot be decrypted</li>
          <li>- Even Wormhole developers cannot decrypt recorded traffic</li>
        </ul>
        <Card className="bg-green-500/10 border-green-500/20 mt-4">
          <CardContent className="p-4">
            <p className="text-green-400 text-sm">
              <strong>Why this matters:</strong> If someone records your encrypted traffic today
              and obtains your keys years later, they still cannot decrypt that old traffic.
              Each session's keys are destroyed when the connection ends.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* rustls */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Why rustls?</h2>
        <p className="text-zinc-300">
          Wormhole uses <code className="text-violet-400">rustls</code> instead of OpenSSL:
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <h3 className="font-semibold text-green-400 mb-3">rustls Advantages</h3>
              <ul className="space-y-2 text-zinc-300 text-sm">
                <li>- Memory-safe (Rust, no C code)</li>
                <li>- No CVEs from buffer overflows</li>
                <li>- TLS 1.3 only (no legacy protocols)</li>
                <li>- No weak cipher suites to configure</li>
                <li>- Smaller attack surface</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <h3 className="font-semibold text-yellow-400 mb-3">OpenSSL History</h3>
              <ul className="space-y-2 text-zinc-300 text-sm">
                <li>- Heartbleed (CVE-2014-0160)</li>
                <li>- Hundreds of CVEs over decades</li>
                <li>- Complex configuration footguns</li>
                <li>- Legacy protocol support risks</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* What's NOT Encrypted */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">What's NOT Encrypted</h2>
        <p className="text-zinc-300">
          For transparency, here's what Wormhole does <em>not</em> encrypt:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Data</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Status</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4">Files on Host</td>
                <td className="py-3 px-4 text-yellow-400">Not by Wormhole</td>
                <td className="py-3 px-4">Use OS-level encryption (FileVault, LUKS)</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4">Cache on Disk</td>
                <td className="py-3 px-4 text-yellow-400">Not by Wormhole</td>
                <td className="py-3 px-4">Stored in ~/.cache, use disk encryption</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4">Signal Server Traffic</td>
                <td className="py-3 px-4 text-green-400">Encrypted (WSS)</td>
                <td className="py-3 px-4">TLS for WebSocket, but server sees codes/IPs</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4">Join Codes</td>
                <td className="py-3 px-4 text-yellow-400">Visible to Signal</td>
                <td className="py-3 px-4">Signal server maps codes to IPs</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4">Connection Metadata</td>
                <td className="py-3 px-4 text-yellow-400">Visible to Network</td>
                <td className="py-3 px-4">IP addresses, connection timing, packet sizes</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Verification */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Verify Your Connection</h2>
        <p className="text-zinc-300">
          Check that encryption is working:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-sm overflow-x-auto">
              <code className="text-zinc-300">{`# Check connection encryption
wormhole status --detailed

# Look for:
# Protocol: QUIC (TLS 1.3)
# Cipher: TLS_AES_256_GCM_SHA384
# Key Exchange: X25519

# Verify with verbose logging
WORMHOLE_LOG_LEVEL=debug wormhole mount WORM-XXXX 2>&1 | grep -i tls`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* See Also */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">See Also</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/docs/security/pake">
            <Badge variant="outline" className="border-zinc-700 hover:border-violet-500/50 cursor-pointer">
              PAKE Authentication
            </Badge>
          </Link>
          <Link href="/docs/security">
            <Badge variant="outline" className="border-zinc-700 hover:border-violet-500/50 cursor-pointer">
              Security Overview
            </Badge>
          </Link>
          <Link href="/docs/architecture/quic">
            <Badge variant="outline" className="border-zinc-700 hover:border-violet-500/50 cursor-pointer">
              QUIC Protocol
            </Badge>
          </Link>
        </div>
      </section>
    </div>
  );
}
