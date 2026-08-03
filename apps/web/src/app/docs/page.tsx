import Link from "next/link";

export const metadata = {
  title: "Docs — Host, mount, and ship large projects",
  description:
    "Wormhole docs for editors and developers: quick start, CLI, FUSE/QUIC architecture, security, and self-hosting.",
};

const links = [
  {
    title: "Project mesh features",
    description: "Playhead-first, project aperture, byte magnets.",
    href: "/docs/features",
  },
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
    description: "host, mount, open, fetch, playhead, and more.",
    href: "/docs/cli",
  },
  {
    title: "Architecture",
    description: "FUSE, QUIC, caching, protocol, signal server.",
    href: "/docs/architecture",
  },
  {
    title: "Security",
    description: "Encryption, PAKE join codes, threat model.",
    href: "/docs/security",
  },
  {
    title: "Performance",
    description: "Cache, network, and tuning guidance.",
    href: "/docs/performance",
  },
  {
    title: "Configuration",
    description: "Env vars, network, and cache settings.",
    href: "/docs/configuration",
  },
  {
    title: "Self-hosting",
    description: "Run your own signal server.",
    href: "/docs/self-hosting",
  },
  {
    title: "Troubleshooting",
    description: "FUSE, network, and performance snags.",
    href: "/docs/troubleshooting",
  },
  {
    title: "API",
    description: "Wire messages and building clients.",
    href: "/docs/api",
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
