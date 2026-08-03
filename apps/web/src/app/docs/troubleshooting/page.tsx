import Link from "next/link";
import { DocsArticle, DocsCode, DocsHeader, DocsLinkGrid } from "@/components/docs-ui";

export const metadata = {
  title: "Troubleshooting — Wormhole Docs",
  description: "Fix common Wormhole mount, network, and performance issues.",
};

export default function TroubleshootingPage() {
  return (
    <DocsArticle>
      <DocsHeader
        title="Troubleshooting"
        description="Start with doctor. Then narrow to FUSE, network, or performance."
      />

      <section>
        <h2>First step</h2>
        <DocsCode>{`wormhole doctor
wormhole status`}</DocsCode>
        <p>Doctor checks FUSE, ports, and basic environment health.</p>
      </section>

      <section>
        <h2>Guides</h2>
        <DocsLinkGrid
          items={[
            {
              title: "FUSE issues",
              description: "macFUSE, WinFSP, permissions, mount failures.",
              href: "/docs/troubleshooting/fuse",
            },
            {
              title: "Network issues",
              description: "NAT, firewalls, signal, join code failures.",
              href: "/docs/troubleshooting/network",
            },
            {
              title: "Performance",
              description: "Slow reads, cache thrash, high latency.",
              href: "/docs/troubleshooting/performance",
            },
            {
              title: "Getting help",
              description: "Logs, GitHub issues, what to include.",
              href: "/docs/troubleshooting/help",
            },
          ]}
        />
      </section>

      <section>
        <h2>Quick checks</h2>
        <ul>
          <li>Can both machines reach each other on the LAN?</li>
          <li>Is FUSE installed and allowed by the OS?</li>
          <li>Did the join code expire or get mistyped?</li>
          <li>
            Still stuck? <Link href="/docs/troubleshooting/help">Getting help</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
