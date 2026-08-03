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
  title: "wormhole update",
  description: "Check for and install Wormhole updates.",
};

export default function UpdatePage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumbs={[
          { href: "/docs", label: "Docs" },
          { href: "/docs/cli", label: "CLI" },
          { label: "update" },
        ]}
        title="wormhole update"
        lead="Keep the CLI and desktop companion on a supported release."
      />

      <DocsCode>{`wormhole update
wormhole update --check`}</DocsCode>

      <DocsNote>
        Package-manager installs (Homebrew, apt, Scoop) should update through
        those channels. Use <code>wormhole update</code> for standalone
        binaries.
      </DocsNote>

      <DocsLinkGrid
        items={[
          { href: "/docs/installation", title: "Installation", desc: "Install paths" },
          { href: "/download", title: "Downloads", desc: "Platform builds" },
          { href: "/changelog", title: "Changelog", desc: "What changed" },
        ]}
      />

      <p className="docs-footer-nav">
        <Link href="/docs/cli">← All CLI commands</Link>
      </p>
    </DocsArticle>
  );
}
