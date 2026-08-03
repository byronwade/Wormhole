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
  title: "wormhole ctl",
  description: "Low-level control-plane client for Wormhole sessions.",
};

export default function CtlPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumbs={[
          { href: "/docs", label: "Docs" },
          { href: "/docs/cli", label: "CLI" },
          { label: "ctl" },
        ]}
        title="wormhole ctl"
        lead="Talk directly to the Wormhole control socket. Hidden from the default help list."
      />

      <DocsCode>{`wormhole ctl status
wormhole ctl list
wormhole ctl --help`}</DocsCode>

      <DocsNote tone="warn">
        Prefer the user-facing commands (<code>host</code>, <code>mount</code>,{" "}
        <code>status</code>) unless you are debugging the service itself.
      </DocsNote>

      <section className="docs-section">
        <h2>When to use it</h2>
        <ul>
          <li>Scripting against the JSON control plane</li>
          <li>Confirming the daemon socket is alive</li>
          <li>Parity checks with MCP tools</li>
        </ul>
      </section>

      <DocsLinkGrid
        items={[
          { href: "/docs/cli/mcp", title: "mcp", desc: "Agent-facing tools" },
          { href: "/docs/cli/status", title: "status", desc: "Friendly status" },
          { href: "/docs/architecture", title: "Architecture", desc: "Control plane" },
        ]}
      />

      <p className="docs-footer-nav">
        <Link href="/docs/cli">← All CLI commands</Link>
      </p>
    </DocsArticle>
  );
}
