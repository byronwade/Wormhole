import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsNote,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "Encryption — Wormhole Docs",
  description: "QUIC TLS 1.3, cipher suites, certificates, and what Wormhole does not encrypt.",
};

export default function EncryptionPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "Security", href: "/docs/security" }}
        title="Encryption"
        description="All peer traffic uses TLS&nbsp;1.3 via QUIC. Encryption is mandatory and cannot be disabled."
      />

      <section>
        <h2>What is encrypted</h2>
        <ul>
          <li>In transit: always encrypted (QUIC / TLS&nbsp;1.3)</li>
          <li>At rest on the host: your responsibility (FileVault, BitLocker, LUKS)</li>
          <li>Disk cache: stored under the cache dir; use OS disk encryption</li>
        </ul>
      </section>

      <section>
        <h2>TLS 1.3</h2>
        <p>
          Wormhole uses rustls with TLS&nbsp;1.3 only. Compared to TLS&nbsp;1.2: 1-RTT
          handshake, optional 0-RTT resumption, no legacy ciphers, and mandatory
          forward secrecy (ECDHE).
        </p>
        <DocsCode>{`# Cipher suites (preference order)
TLS_AES_256_GCM_SHA384
TLS_AES_128_GCM_SHA256
TLS_CHACHA20_POLY1305_SHA256

# Key exchange groups
X25519          # default
secp256r1       # P-256
secp384r1       # P-384`}</DocsCode>
      </section>

      <section>
        <h2>Certificates and PAKE</h2>
        <p>
          Default mode uses an ephemeral self-signed certificate for transport
          encryption. Join-code PAKE (SPAKE2) provides mutual authentication over
          that channel.
        </p>
        <ol>
          <li>Host generates an ephemeral cert for the session.</li>
          <li>Client completes the TLS handshake (encrypted, not yet authenticated).</li>
          <li>SPAKE2 proves both sides know the join code.</li>
          <li>Session proceeds with TLS encryption + PAKE authentication.</li>
        </ol>
        <DocsCode>{`# Optional custom certificates
wormhole host ~/folder \\
  --tls-cert /path/to/cert.pem \\
  --tls-key /path/to/key.pem

wormhole mount WORM-XXXX \\
  --tls-ca /path/to/ca.pem`}</DocsCode>
      </section>

      <section>
        <h2>Forward secrecy</h2>
        <p>
          Each connection uses unique ephemeral keys. Compromising a key later does
          not decrypt past sessions. Session keys are discarded when the connection
          ends.
        </p>
      </section>

      <section>
        <h2>Why rustls</h2>
        <ul>
          <li>Memory-safe Rust implementation (no OpenSSL C surface)</li>
          <li>TLS&nbsp;1.3 only — no weak legacy suites to misconfigure</li>
          <li>Smaller attack surface than OpenSSL’s history of CVEs</li>
        </ul>
      </section>

      <section>
        <h2>What is not encrypted by Wormhole</h2>
        <DocsTable
          headers={["Data", "Status", "Notes"]}
          rows={[
            ["Files on host", "Not by Wormhole", "Use OS disk encryption"],
            ["Disk cache", "Not by Wormhole", "~/.cache (or configured path)"],
            ["Signal traffic", "WSS/TLS", "Server sees codes and IPs, not file bytes"],
            ["Join codes", "Visible to signal", "Maps codes to peer endpoints"],
            ["Connection metadata", "Visible on network", "IPs, timing, packet sizes"],
          ]}
        />
      </section>

      <section>
        <h2>Verify encryption</h2>
        <DocsCode>{`wormhole status --detailed

# Expect something like:
# Protocol: QUIC (TLS 1.3)
# Cipher: TLS_AES_256_GCM_SHA384
# Key Exchange: X25519

WORMHOLE_LOG_LEVEL=debug wormhole mount WORM-XXXX 2>&1 | grep -i tls`}</DocsCode>
        <DocsNote title="Alpha">
          Treat certificate verification and TOFU as evolving. Prefer trusted
          networks for sensitive shares until you’ve reviewed the{" "}
          <Link href="/docs/security/threat-model">threat model</Link>.
        </DocsNote>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/security/pake">PAKE</Link>
          </li>
          <li>
            <Link href="/docs/architecture/quic">QUIC transport</Link>
          </li>
          <li>
            <Link href="/docs/security">Security overview</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
