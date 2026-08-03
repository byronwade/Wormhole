import Link from "next/link";

export const metadata = {
  title: "Documentation — Wormhole",
  description:
    "Host, mount, and configure Wormhole. Quick start, CLI, architecture, and security.",
};

const links = [
  {
    title: "Quick Start",
    description: "Host a folder and mount it in a few minutes.",
    href: "/docs/quickstart",
  },
  {
    title: "Installation",
    description: "macOS, Windows, and Linux install paths.",
    href: "/docs/installation",
  },
  {
    title: "CLI Reference",
    description: "host, mount, status, cache, and friends.",
    href: "/docs/cli",
  },
  {
    title: "Architecture",
    description: "FUSE, QUIC, caching, and the wire protocol.",
    href: "/docs/architecture",
  },
  {
    title: "Security",
    description: "Encryption, PAKE join codes, threat model.",
    href: "/docs/security",
  },
  {
    title: "Troubleshooting",
    description: "FUSE, network, and performance snags.",
    href: "/docs/troubleshooting",
  },
];

export default function DocsPage() {
  return (
    <div className="docs-home">
      <header className="docs-home__intro">
        <h1>Documentation</h1>
        <p>
          Mount any folder from any computer. Start with the quick path, then dig into
          CLI and architecture when you need it.
        </p>
      </header>

      <pre className="docs-code" tabIndex={0}>
        <code>{`$ wormhole host ~/renders
Join code: 7KJM-XBCD-QRST

$ wormhole mount 7KJM-XBCD-QRST
Mounted at /Volumes/wormhole/renders`}</code>
      </pre>

      <div className="docs-home__grid">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="docs-home__card">
            <h2>{link.title}</h2>
            <p>{link.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
