import Link from "next/link";

export const metadata = {
  title: "CLI Reference — Wormhole Docs",
  description: "Wormhole command-line reference: host, mount, status, cache, and more.",
};

const groups = [
  {
    title: "Core",
    commands: [
      { name: "host", href: "/docs/cli/host", example: "wormhole host ~/Projects", blurb: "Share a local folder" },
      { name: "mount", href: "/docs/cli/mount", example: "wormhole mount CODE", blurb: "Mount a remote folder" },
      { name: "status", href: "/docs/cli/status", example: "wormhole status", blurb: "Show hosts and mounts" },
      { name: "peers", href: "/docs/cli/peers", example: "wormhole peers", blurb: "List connected peers" },
    ],
  },
  {
    title: "Ops",
    commands: [
      { name: "cache", href: "/docs/cli/cache", example: "wormhole cache stats", blurb: "Inspect or clear cache" },
      { name: "config", href: "/docs/cli/config", example: "wormhole config list", blurb: "Read and set config" },
      { name: "logs", href: "/docs/cli/logs", example: "wormhole logs --follow", blurb: "Follow diagnostics" },
      { name: "doctor", href: "/docs/cli/doctor", example: "wormhole doctor", blurb: "Environment checks" },
    ],
  },
  {
    title: "Automation",
    commands: [
      { name: "mcp", href: "/docs/cli/mcp", example: "wormhole mcp", blurb: "MCP server for agents" },
      { name: "ctl", href: "/docs/cli/ctl", example: "wormhole ctl status", blurb: "Control-plane client" },
      { name: "completion", href: "/docs/cli/completion", example: "wormhole completion zsh", blurb: "Shell completions" },
      { name: "update", href: "/docs/cli/update", example: "wormhole update", blurb: "Update standalone builds" },
    ],
  },
  {
    title: "More",
    commands: [
      { name: "signal", href: "/docs/cli/signal", example: "wormhole signal", blurb: "Signal server helpers" },
      { name: "sync", href: "/docs/cli/sync", example: "wormhole sync", blurb: "Sync-oriented flows" },
      { name: "All commands", href: "/docs/cli/all-commands", example: "wormhole --help", blurb: "Full command list" },
    ],
  },
];

export default function CliPage() {
  return (
    <article className="docs-article">
      <header className="docs-home__intro">
        <h1>CLI Reference</h1>
        <p>Everything useful from a terminal. Start with host and mount.</p>
      </header>

      <pre className="docs-code" tabIndex={0}>
        <code>{`$ wormhole host ~/renders
$ wormhole mount 7KJM-XBCD-QRST
$ wormhole status`}</code>
      </pre>

      {groups.map((group) => (
        <section key={group.title}>
          <h2>{group.title}</h2>
          <div className="docs-cmd-list">
            {group.commands.map((cmd) => (
              <Link key={cmd.name} href={cmd.href} className="docs-cmd">
                <div>
                  <strong>{cmd.name}</strong>
                  <p>{cmd.blurb}</p>
                </div>
                <code>{cmd.example}</code>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </article>
  );
}
