import type { Metadata } from "next";
import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsLinkGrid,
} from "@/components/docs-ui";

export const metadata: Metadata = {
  title: "wormhole logs",
  description: "View and export Wormhole diagnostic logs.",
};

export default function LogsPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumbs={[
          { href: "/docs", label: "Docs" },
          { href: "/docs/cli", label: "CLI" },
          { label: "logs" },
        ]}
        title="wormhole logs"
        lead="Follow local daemon output when something misbehaves."
      />

      <DocsCode>{`wormhole logs
wormhole logs --follow
wormhole logs --level debug`}</DocsCode>

      <section className="docs-section">
        <h2>Tips</h2>
        <ul>
          <li>Reproduce the failure, then capture the last few dozen lines</li>
          <li>Redact join codes before sharing logs</li>
          <li>Pair with <code>wormhole doctor</code> for environment context</li>
        </ul>
      </section>

      <DocsLinkGrid
        items={[
          { href: "/docs/cli/doctor", title: "doctor", desc: "Environment checks" },
          { href: "/docs/troubleshooting", title: "Troubleshooting", desc: "Common errors" },
          { href: "/docs/cli/config", title: "config", desc: "Paths and settings" },
        ]}
      />

      <p className="docs-footer-nav">
        <Link href="/docs/cli">← All CLI commands</Link>
      </p>
    </DocsArticle>
  );
}
