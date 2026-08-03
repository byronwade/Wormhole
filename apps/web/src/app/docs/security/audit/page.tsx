import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsNote,
} from "@/components/docs-ui";

export const metadata = {
  title: "Audit — Wormhole Docs",
  description: "How to review Wormhole source, builds, and security posture.",
};

export default function AuditPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "Security", href: "/docs/security" }}
        title="Audit"
        description="Wormhole is open source. Verify the code and builds yourself."
      />

      <section>
        <h2>Source</h2>
        <p>
          Primary crates live under <code>crates/</code> (
          <code>teleport-core</code>, <code>teleport-daemon</code>,{" "}
          <code>teleport-signal</code>). Protocol types are in{" "}
          <code>teleport-core/src/protocol.rs</code>. Path sanitization and FUSE
          entry points are in the daemon.
        </p>
        <DocsCode>{`git clone https://github.com/byronwade/wormhole
cd wormhole
cargo test
cargo clippy -- -D warnings`}</DocsCode>
      </section>

      <section>
        <h2>What to review</h2>
        <ul>
          <li>
            <Link href="/docs/security/encryption">TLS / rustls configuration</Link>
          </li>
          <li>
            <Link href="/docs/security/pake">SPAKE2 join-code flow</Link>
          </li>
          <li>
            Path validation (<code>safe_path</code>) and symlink handling
          </li>
          <li>
            Signal server: room expiry, rate limits, what is logged
          </li>
          <li>Cache directory permissions and eviction</li>
        </ul>
      </section>

      <section>
        <h2>Reproducible checks</h2>
        <DocsCode>{`# Dependency audit (when cargo-audit is installed)
cargo install cargo-audit
cargo audit

# Confirm release artifacts match tagged source
git checkout <tag>
cargo build --release -p teleport-daemon`}</DocsCode>
        <DocsNote>
          Alpha builds evolve quickly. Prefer building from a tagged commit you
          have reviewed rather than trusting an unsigned binary alone.
        </DocsNote>
      </section>

      <section>
        <h2>Reporting issues</h2>
        <p>
          For vulnerabilities, prefer a private report via GitHub Security
          Advisories on the repository. For docs and non-sensitive bugs, open a
          public issue with reproduction steps and{" "}
          <Link href="/docs/troubleshooting/help">logs</Link>.
        </p>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/security/threat-model">Threat model</Link>
          </li>
          <li>
            <Link href="/docs/architecture">Architecture</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
