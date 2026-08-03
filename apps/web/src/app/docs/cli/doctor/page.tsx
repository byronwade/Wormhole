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
  title: "wormhole doctor",
  description: "Run local diagnostics for Wormhole connectivity and mounts.",
};

export default function DoctorPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumbs={[
          { href: "/docs", label: "Docs" },
          { href: "/docs/cli", label: "CLI" },
          { label: "doctor" },
        ]}
        title="wormhole doctor"
        lead="Check the local environment before you open a support issue."
      />

      <DocsCode>{`wormhole doctor`}</DocsCode>

      <section className="docs-section">
        <h2>What it checks</h2>
        <ul>
          <li>Binary and config paths</li>
          <li>Platform mount prerequisites (FUSE / WinFsp / macFUSE)</li>
          <li>Control-plane socket reachability when a service is running</li>
          <li>Obvious network / TLS self-check failures</li>
        </ul>
      </section>

      <DocsNote>
        Doctor is advisory. A green check does not guarantee NAT traversal will
        succeed on every network.
      </DocsNote>

      <DocsLinkGrid
        items={[
          { href: "/docs/troubleshooting", title: "Troubleshooting", desc: "Symptom → fix" },
          { href: "/docs/requirements", title: "Requirements", desc: "Supported platforms" },
          { href: "/docs/cli/logs", title: "logs", desc: "Collect diagnostics" },
        ]}
      />

      <p className="docs-footer-nav">
        <Link href="/docs/cli">← All CLI commands</Link>
      </p>
    </DocsArticle>
  );
}
