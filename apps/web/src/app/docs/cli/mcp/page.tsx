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
  title: "wormhole mcp",
  description: "Run the Wormhole MCP server for AI agent tooling.",
};

export default function McpPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumbs={[
          { href: "/docs", label: "Docs" },
          { href: "/docs/cli", label: "CLI" },
          { label: "mcp" },
        ]}
        title="wormhole mcp"
        lead="Expose Wormhole session tools over the Model Context Protocol (stdio)."
      />

      <DocsCode>{`wormhole mcp
# or
wormhole-mcp`}</DocsCode>

      <section className="docs-section">
        <h2>What agents can do</h2>
        <ul>
          <li>Start / stop host and mount sessions</li>
          <li>Read session status and peers</li>
          <li>Inspect cache and configuration surfaces that the CLI exposes</li>
        </ul>
      </section>

      <DocsNote>
        Tools mirror the control-plane API. Prefer{" "}
        <code>WORMHOLE_NO_FUSE=1</code> in headless CI so mounts stay data-plane
        only.
      </DocsNote>

      <section className="docs-section">
        <h2>Cursor example</h2>
        <p>
          Copy <code>.mcp.json.example</code> from the repo and point the
          command at your built <code>wormhole</code> binary.
        </p>
      </section>

      <DocsLinkGrid
        items={[
          { href: "/docs/cli/ctl", title: "ctl", desc: "Raw control plane" },
          { href: "/docs/architecture", title: "Architecture", desc: "How sessions fit" },
          { href: "/docs/cli", title: "CLI index", desc: "All commands" },
        ]}
      />

      <p className="docs-footer-nav">
        <Link href="/docs/cli">← All CLI commands</Link>
      </p>
    </DocsArticle>
  );
}
