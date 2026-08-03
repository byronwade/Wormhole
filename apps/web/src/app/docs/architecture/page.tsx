import Link from "next/link";
import { DocsArticle, DocsHeader, DocsLinkGrid } from "@/components/docs-ui";

export const metadata = {
  title: "Architecture — Wormhole Docs",
  description: "How Wormhole mounts remote folders over QUIC with FUSE and caching.",
};

export default function ArchitecturePage() {
  return (
    <DocsArticle>
      <DocsHeader
        title="Architecture"
        description="Three planes: control (signaling + join codes), metadata (directory tree), and data (byte ranges over QUIC)."
      />

      <section>
        <h2>Flow</h2>
        <ol>
          <li>Host scans a folder and listens on QUIC.</li>
          <li>Join code (or direct address) reaches the client.</li>
          <li>Client authenticates, fetches metadata, and mounts via FUSE/WinFSP.</li>
          <li>Reads pull 128&nbsp;KB chunks on demand into RAM/disk cache.</li>
        </ol>
      </section>

      <section>
        <h2>Topics</h2>
        <DocsLinkGrid
          items={[
            {
              title: "FUSE filesystem",
              description: "How the OS sees a local drive.",
              href: "/docs/architecture/fuse",
            },
            {
              title: "QUIC transport",
              description: "Multiplexed encrypted streams.",
              href: "/docs/architecture/quic",
            },
            {
              title: "Wire protocol",
              description: "Messages between host and client.",
              href: "/docs/architecture/protocol",
            },
            {
              title: "Caching",
              description: "RAM + disk cache and eviction.",
              href: "/docs/architecture/caching",
            },
            {
              title: "Signal server",
              description: "Rendezvous only — not in the data path.",
              href: "/docs/architecture/signal-server",
            },
          ]}
        />
      </section>

      <section>
        <h2>Related</h2>
        <ul>
          <li>
            <Link href="/docs/security">Security</Link>
          </li>
          <li>
            <Link href="/docs/performance">Performance</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
