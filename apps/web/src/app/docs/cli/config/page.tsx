import type { Metadata } from "next";
import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsLinkGrid,
  DocsTable,
} from "@/components/docs-ui";

export const metadata: Metadata = {
  title: "wormhole config",
  description: "Inspect and update Wormhole configuration.",
};

export default function ConfigCliPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumbs={[
          { href: "/docs", label: "Docs" },
          { href: "/docs/cli", label: "CLI" },
          { label: "config" },
        ]}
        title="wormhole config"
        lead="Read and write local configuration without hunting through files."
      />

      <DocsCode>{`wormhole config list
wormhole config get <key>
wormhole config set <key> <value>`}</DocsCode>

      <DocsTable
        headers={["Key area", "Examples"]}
        rows={[
          ["Cache", "cache directory, size caps"],
          ["Network", "bind address, signal URL"],
          ["Mount", "default mount root, FUSE flags"],
        ]}
      />

      <DocsLinkGrid
        items={[
          { href: "/docs/configuration", title: "Configuration guide", desc: "Full reference" },
          { href: "/docs/cli/cache", title: "cache", desc: "Cache commands" },
          { href: "/docs/self-hosting", title: "Self-hosting", desc: "Signal server" },
        ]}
      />

      <p className="docs-footer-nav">
        <Link href="/docs/cli">← All CLI commands</Link>
      </p>
    </DocsArticle>
  );
}
