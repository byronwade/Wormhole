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
  description: "Manage the mesh peer registry for content-addressed fetch.",
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
        lead="Register LAN / studio hosts that can serve BLAKE3 magnets."
      />

      <DocsCode>{`wormhole peers list
wormhole peers add 192.168.1.10:4433 --name studio
wormhole peers show 192.168.1.10:4433
wormhole peers remove 192.168.1.10:4433`}</DocsCode>

      <section className="docs-section">
        <h2>What you get</h2>
        <ul>
          <li>Persistent peer list under the Wormhole data directory</li>
          <li>Default port 4433 when omitted</li>
          <li>
            Used by <code>wormhole fetch</code> when <code>--from</code> is not
            set
          </li>
        </ul>
      </section>

      <DocsNote>
        Blocked peers are skipped during mesh fetch. Prefer{" "}
        <code>wormhole fetch --from host:port</code> for a one-shot pull.
      </DocsNote>

      <DocsLinkGrid
        items={[
          { href: "/docs/cli/fetch", title: "fetch", desc: "Magnet + mesh pull" },
          { href: "/docs/features", title: "Features", desc: "Byte magnet mesh" },
          { href: "/docs/troubleshooting", title: "Troubleshooting", desc: "Common fixes" },
        ]}
      />

      <p className="docs-footer-nav">
        <Link href="/docs/cli">← All CLI commands</Link>
      </p>
    </DocsArticle>
  );
}
