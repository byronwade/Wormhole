import type { Metadata } from "next";
import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsLinkGrid,
  DocsNote,
} from "@/components/docs-ui";

export const metadata: Metadata = {
  title: "wormhole peers",
  description: "List connected peers for the active Wormhole session.",
};

export default function PeersPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumbs={[
          { href: "/docs", label: "Docs" },
          { href: "/docs/cli", label: "CLI" },
          { label: "peers" },
        ]}
        title="wormhole peers"
        lead="Show who is connected to the current share or mount."
      />

      <DocsCode>{`wormhole peers
wormhole peers --json`}</DocsCode>

      <section className="docs-section">
        <h2>What you get</h2>
        <ul>
          <li>Peer id and display name when available</li>
          <li>Connection state</li>
          <li>Optional throughput / cache hints when the session exposes them</li>
        </ul>
      </section>

      <DocsNote>
        Prefer <code>wormhole status</code> for a one-line summary; use{" "}
        <code>peers</code> when you need the full list.
      </DocsNote>

      <DocsLinkGrid
        items={[
          { href: "/docs/cli/status", title: "status", desc: "Session overview" },
          { href: "/docs/cli/doctor", title: "doctor", desc: "Diagnose issues" },
          { href: "/docs/troubleshooting", title: "Troubleshooting", desc: "Common fixes" },
        ]}
      />

      <p className="docs-footer-nav">
        <Link href="/docs/cli">← All CLI commands</Link>
      </p>
    </DocsArticle>
  );
}
