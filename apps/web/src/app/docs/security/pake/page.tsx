import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Key, Shield, ArrowRight, CheckCircle, XCircle } from "lucide-react";

export const metadata = {
  title: "PAKE Authentication - Wormhole Security",
  description: "How Wormhole uses Password-Authenticated Key Exchange for join codes.",
};

export default function PakePage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/docs/security" className="hover:text-white">Security</Link>
          <span>/</span>
          <span className="text-zinc-400">PAKE</span>
        </div>
        <h1 className="text-4xl font-bold text-white tracking-tight">
          PAKE Authentication
        </h1>
        <p className="text-xl text-zinc-400">
          Password-Authenticated Key Exchange makes join codes secure.
        </p>
      </div>

      {/* Overview */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">What is PAKE?</h2>
        <p className="text-zinc-300">
          PAKE (Password-Authenticated Key Exchange) is a cryptographic protocol that allows
          two parties to establish a shared secret using a password (in Wormhole's case, a
          join code), without ever transmitting the password itself.
        </p>
        <p className="text-zinc-300">
          Wormhole uses <strong>SPAKE2</strong>, a modern PAKE protocol that is:
        </p>
        <ul className="list-disc list-inside text-zinc-300 space-y-1 ml-4">
          <li>Resistant to offline dictionary attacks</li>
          <li>Secure against eavesdroppers</li>
          <li>Provides mutual authentication</li>
          <li>Simple and well-analyzed</li>
        </ul>
      </section>

      {/* Why PAKE */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Why Not Just Send the Code?</h2>
        <p className="text-zinc-300">
          A naive approach would be for the client to simply send the join code to prove
          they're authorized. Here's why that's dangerous:
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-red-500/10 border-red-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <XCircle className="h-5 w-5 text-red-400" />
                <h3 className="font-semibold text-red-400">Naive Approach (Bad)</h3>
              </div>
              <ul className="space-y-2 text-zinc-300 text-sm">
                <li>Client sends: "My code is WORM-ABCD"</li>
                <li>Attacker intercepts code</li>
                <li>Attacker can now connect to host</li>
                <li>Code reusable by anyone who captured it</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="bg-green-500/10 border-green-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="h-5 w-5 text-green-400" />
                <h3 className="font-semibold text-green-400">PAKE Approach (Good)</h3>
              </div>
              <ul className="space-y-2 text-zinc-300 text-sm">
                <li>Client/host exchange math values</li>
                <li>Both derive same secret IF code matches</li>
                <li>Attacker learns nothing useful</li>
                <li>Can't replay or reuse captured data</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* How SPAKE2 Works */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Key className="h-6 w-6 text-violet-400" />
          How SPAKE2 Works
        </h2>
        <p className="text-zinc-300">
          Here's a simplified explanation of the SPAKE2 protocol:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-6">
            <div className="space-y-6 font-mono text-sm">
              {/* Step 1 */}
              <div>
                <div className="text-zinc-500 text-xs mb-2">Step 1: Both parties know the password (join code)</div>
                <div className="flex items-center gap-4">
                  <span className="text-blue-400 w-16">Host</span>
                  <span className="text-zinc-600">knows</span>
                  <span className="text-violet-400">WORM-ABCD-EFGH</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-green-400 w-16">Client</span>
                  <span className="text-zinc-600">knows</span>
                  <span className="text-violet-400">WORM-ABCD-EFGH</span>
                </div>
              </div>

              {/* Step 2 */}
              <div>
                <div className="text-zinc-500 text-xs mb-2">Step 2: Each generates random value, computes public share</div>
                <div className="flex items-center gap-4">
                  <span className="text-blue-400 w-16">Host</span>
                  <span className="text-zinc-600">computes</span>
                  <span className="text-zinc-400">X = g^x * M^password</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-green-400 w-16">Client</span>
                  <span className="text-zinc-600">computes</span>
                  <span className="text-zinc-400">Y = g^y * N^password</span>
                </div>
              </div>

              {/* Step 3 */}
              <div>
                <div className="text-zinc-500 text-xs mb-2">Step 3: Exchange public shares (via signal server)</div>
                <div className="flex items-center gap-4">
                  <span className="text-blue-400 w-16">Host</span>
                  <ArrowRight className="h-4 w-4 text-zinc-600" />
                  <span className="text-green-400 w-16">Client</span>
                  <span className="text-zinc-400">X (public, safe to intercept)</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-green-400 w-16">Client</span>
                  <ArrowRight className="h-4 w-4 text-zinc-600" />
                  <span className="text-blue-400 w-16">Host</span>
                  <span className="text-zinc-400">Y (public, safe to intercept)</span>
                </div>
              </div>

              {/* Step 4 */}
              <div>
                <div className="text-zinc-500 text-xs mb-2">Step 4: Both derive same shared secret (only if passwords match!)</div>
                <div className="flex items-center gap-4">
                  <span className="text-blue-400 w-16">Host</span>
                  <span className="text-zinc-600">derives</span>
                  <span className="text-green-400">K = (Y / N^password)^x</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-green-400 w-16">Client</span>
                  <span className="text-zinc-600">derives</span>
                  <span className="text-green-400">K = (X / M^password)^y</span>
                </div>
              </div>

              {/* Result */}
              <div className="pt-4 border-t border-zinc-800">
                <div className="text-green-400">Both now share secret K, which is used for verification</div>
                <div className="text-zinc-500 text-xs mt-1">
                  An attacker who doesn't know the password cannot derive K, even with X and Y
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Security Properties */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Shield className="h-6 w-6 text-green-400" />
          Security Properties
        </h2>
        <div className="space-y-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <h3 className="font-semibold text-white mb-2">Offline Attack Resistance</h3>
              <p className="text-zinc-300 text-sm">
                An attacker who captures the protocol messages cannot try passwords offline.
                Each guess requires interacting with the server, making brute-force attacks
                impractical. This is unlike hashed passwords where attackers can guess billions
                of passwords per second.
              </p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <h3 className="font-semibold text-white mb-2">Forward Secrecy</h3>
              <p className="text-zinc-300 text-sm">
                If a password is compromised later, past sessions remain secure. Each session
                generates unique ephemeral keys that are destroyed after use.
              </p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <h3 className="font-semibold text-white mb-2">Mutual Authentication</h3>
              <p className="text-zinc-300 text-sm">
                Both parties prove knowledge of the password. A malicious server can't
                impersonate a legitimate host without knowing the join code.
              </p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <h3 className="font-semibold text-white mb-2">No Password Equivalent</h3>
              <p className="text-zinc-300 text-sm">
                The protocol doesn't transmit anything that could be used as a password.
                Unlike hash-based auth, there's no "password hash" that grants access.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Join Code Generation */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Join Code Generation</h2>
        <p className="text-zinc-300">
          Wormhole generates join codes with sufficient entropy to resist guessing:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`// Join code format: WORM-XXXX-YYYY
// Where X and Y are uppercase alphanumeric

// Character set: A-Z, 0-9 (36 characters)
// 8 random characters = 36^8 = ~2.8 trillion combinations

// Entropy calculation:
// log2(36^8) ≈ 41.4 bits of entropy

// At 1000 guesses/second (rate limited), brute force takes:
// 2.8 trillion / 1000 / 3600 / 24 / 365 ≈ 88,000 years

fn generate_join_code() -> String {
    let mut rng = rand::thread_rng();
    let chars: Vec<char> = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        .chars()
        .collect();

    let part1: String = (0..4)
        .map(|_| chars[rng.gen_range(0..36)])
        .collect();
    let part2: String = (0..4)
        .map(|_| chars[rng.gen_range(0..36)])
        .collect();

    format!("WORM-{}-{}", part1, part2)
}`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Integration with TLS */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Integration with TLS</h2>
        <p className="text-zinc-300">
          PAKE and TLS work together in Wormhole:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-6">
            <div className="space-y-4 font-mono text-sm">
              <div className="flex items-start gap-4">
                <span className="text-violet-400 font-bold">1.</span>
                <div>
                  <span className="text-white">TLS handshake</span>
                  <span className="text-zinc-500"> - establishes encrypted channel</span>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <span className="text-violet-400 font-bold">2.</span>
                <div>
                  <span className="text-white">PAKE exchange</span>
                  <span className="text-zinc-500"> - authenticates via join code (over TLS)</span>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <span className="text-violet-400 font-bold">3.</span>
                <div>
                  <span className="text-white">Session established</span>
                  <span className="text-zinc-500"> - both encrypted and authenticated</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <p className="text-zinc-300 mt-4">
          This two-layer approach provides defense in depth: even if TLS had a vulnerability,
          the PAKE layer provides additional authentication. And even if PAKE had a weakness,
          TLS provides encryption.
        </p>
      </section>

      {/* Code Example */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Implementation</h2>
        <p className="text-zinc-300">
          Wormhole uses the <code className="text-violet-400">spake2</code> crate:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`use spake2::{Ed25519Group, Identity, Password, Spake2};

// Host side
let (host_state, host_msg) = Spake2::<Ed25519Group>::start_symmetric(
    &Password::new(join_code.as_bytes()),
    &Identity::new(b"wormhole-host"),
);

// Send host_msg to client via signal server

// Client side
let (client_state, client_msg) = Spake2::<Ed25519Group>::start_symmetric(
    &Password::new(join_code.as_bytes()),
    &Identity::new(b"wormhole-client"),
);

// Send client_msg to host via signal server

// Both sides finish
let host_key = host_state.finish(&client_msg)?;
let client_key = client_state.finish(&host_msg)?;

// host_key == client_key if join codes match
// Use this key to verify connection authenticity`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* See Also */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">See Also</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/docs/security/encryption">
            <Badge variant="outline" className="border-zinc-700 hover:border-violet-500/50 cursor-pointer">
              Encryption Details
            </Badge>
          </Link>
          <Link href="/docs/security">
            <Badge variant="outline" className="border-zinc-700 hover:border-violet-500/50 cursor-pointer">
              Security Overview
            </Badge>
          </Link>
          <Link href="/docs/architecture/signal-server">
            <Badge variant="outline" className="border-zinc-700 hover:border-violet-500/50 cursor-pointer">
              Signal Server
            </Badge>
          </Link>
        </div>
      </section>
    </div>
  );
}
