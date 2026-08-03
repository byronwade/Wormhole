import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsNote,
} from "@/components/docs-ui";

export const metadata = {
  title: "Building Clients — Wormhole Docs",
  description: "How to implement a Wormhole-compatible peer client.",
};

export default function BuildingClientsPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "API", href: "/docs/api" }}
        title="Building clients"
        description="Speak the wire protocol over QUIC, authenticate with SPAKE2 when using join codes, then mount or fetch chunks."
      />

      <section>
        <h2>Steps</h2>
        <ol>
          <li>
            Resolve the host: join code via{" "}
            <Link href="/docs/architecture/signal-server">signal</Link>, or direct{" "}
            <code>host:port</code>.
          </li>
          <li>
            Open QUIC (TLS&nbsp;1.3). Complete{" "}
            <Link href="/docs/security/pake">PAKE</Link> when required.
          </li>
          <li>
            Exchange <code>Hello</code> / <code>Welcome</code>; learn root inode and
            capabilities.
          </li>
          <li>
            Issue Lookup / ReadDir / ReadChunk messages per the{" "}
            <Link href="/docs/architecture/protocol">protocol</Link>.
          </li>
          <li>Optionally present a local FS (FUSE/WinFSP) or a custom UI.</li>
        </ol>
      </section>

      <section>
        <h2>Reuse the crates</h2>
        <DocsCode>{`# Prefer linking teleport-core types rather than re-deriving bincode layouts
# Protocol: crates/teleport-core/src/protocol.rs
# CHUNK_SIZE = 128 * 1024`}</DocsCode>
        <DocsNote>
          Stay additive: new fields must be <code>Option&lt;T&gt;</code>. Test
          round-trips against the reference daemon.
        </DocsNote>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/api/messages">Messages</Link>
          </li>
          <li>
            <Link href="/docs/api/errors">Errors</Link>
          </li>
          <li>
            <Link href="/docs/architecture/quic">QUIC</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
