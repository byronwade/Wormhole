import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsNote,
} from "@/components/docs-ui";

export const metadata = {
  title: "PAKE — Wormhole Docs",
  description: "How Wormhole turn join codes into session keys with SPAKE2.",
};

export default function PakePage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "Security", href: "/docs/security" }}
        title="PAKE"
        description="Password-Authenticated Key Exchange turns a join code into a shared secret without sending the code on the wire."
      />

      <section>
        <h2>What is PAKE?</h2>
        <p>
          PAKE lets two parties prove they share a password (the join code) and
          derive a session key. Wormhole uses SPAKE2: resistant to offline
          dictionary attacks, mutual authentication, and no password equivalent
          on the wire.
        </p>
      </section>

      <section>
        <h2>Why not send the code?</h2>
        <p>
          Sending the join code as a password would let any eavesdropper replay
          it. With SPAKE2, peers exchange public shares; only parties that know
          the code can derive the shared secret. Captured messages are useless
          for offline guessing.
        </p>
      </section>

      <section>
        <h2>How SPAKE2 works (simplified)</h2>
        <ol>
          <li>Host and client both know the join code.</li>
          <li>
            Each picks a random value and computes a public share (password mixed
            in).
          </li>
          <li>They exchange shares (via signal or direct connection).</li>
          <li>
            Both derive the same key <code>K</code> only if the codes match. An
            attacker with the shares cannot compute <code>K</code>.
          </li>
        </ol>
        <DocsCode>{`use spake2::{Ed25519Group, Identity, Password, Spake2};

// Host
let (host_state, host_msg) = Spake2::<Ed25519Group>::start_symmetric(
    &Password::new(join_code.as_bytes()),
    &Identity::new(b"wormhole-host"),
);

// Client
let (client_state, client_msg) = Spake2::<Ed25519Group>::start_symmetric(
    &Password::new(join_code.as_bytes()),
    &Identity::new(b"wormhole-client"),
);

let host_key = host_state.finish(&client_msg)?;
let client_key = client_state.finish(&host_msg)?;
// host_key == client_key when codes match`}</DocsCode>
      </section>

      <section>
        <h2>Security properties</h2>
        <ul>
          <li>
            Offline attack resistance — guesses require online interaction
            (rate-limited).
          </li>
          <li>
            Forward secrecy — ephemeral session material; past sessions stay
            protected if a code leaks later.
          </li>
          <li>Mutual authentication — both sides prove knowledge of the code.</li>
          <li>No password equivalent transmitted or stored as a reusable hash.</li>
        </ul>
      </section>

      <section>
        <h2>Join code entropy</h2>
        <p>
          Codes use uppercase alphanumeric characters. An 8-character body over a
          36-character alphabet is about 41 bits of entropy (~2.8 trillion
          combinations). With rate limiting, online brute force is impractical.
        </p>
        <DocsCode>{`# Example format
WORM-XXXX-YYYY

# Character set: A-Z, 0-9 (36 symbols)
# log2(36^8) ≈ 41.4 bits`}</DocsCode>
      </section>

      <section>
        <h2>Layering with TLS</h2>
        <ol>
          <li>TLS handshake — encrypted channel.</li>
          <li>PAKE exchange — authenticate via join code over TLS.</li>
          <li>Session — encrypted and authenticated.</li>
        </ol>
        <DocsNote>
          Defense in depth: TLS encrypts; PAKE authenticates. Neither layer alone
          is the whole story.
        </DocsNote>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/security/encryption">Encryption</Link>
          </li>
          <li>
            <Link href="/docs/architecture/signal-server">Signal server</Link>
          </li>
          <li>
            <Link href="/docs/security">Security overview</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
