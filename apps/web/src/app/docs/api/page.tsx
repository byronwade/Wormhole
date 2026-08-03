import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsLinkGrid,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "API Reference — Wormhole Docs",
  description: "CLI JSON, exit codes, signal WebSocket, and protocol links.",
};

export default function ApiPage() {
  return (
    <DocsArticle>
      <DocsHeader
        title="API reference"
        description="Integrate via CLI JSON, the wire protocol, or the signal WebSocket — not a cloud REST API for file bytes."
      />

      <section>
        <h2>Integration points</h2>
        <DocsLinkGrid
          items={[
            {
              title: "Building clients",
              description: "Implement a compatible peer.",
              href: "/docs/api/building-clients",
            },
            {
              title: "Messages",
              description: "Request/response overview.",
              href: "/docs/api/messages",
            },
            {
              title: "Errors",
              description: "Exit codes and protocol errors.",
              href: "/docs/api/errors",
            },
            {
              title: "Wire protocol",
              description: "bincode over QUIC.",
              href: "/docs/architecture/protocol",
            },
          ]}
        />
      </section>

      <section>
        <h2>CLI JSON</h2>
        <DocsCode>{`wormhole status --format json | jq '.connections[0].id'
CODE=$(wormhole host ~/folder --format json | jq -r '.join_code')`}</DocsCode>
      </section>

      <section>
        <h2>Exit codes</h2>
        <DocsTable
          headers={["Code", "Meaning"]}
          rows={[
            ["0", "Success"],
            ["1", "General error"],
            ["2", "Usage / invalid args"],
            ["3", "Connection failure"],
            ["4", "Authentication failure"],
            ["5", "Permission denied"],
            ["6", "FUSE mount/unmount failure"],
            ["10", "Timeout"],
          ]}
        />
      </section>

      <section>
        <h2>Signal WebSocket (sketch)</h2>
        <DocsCode>{`// Host registers
→ {"type":"register","code":"WORM-ABCD-EFGH","addr":"203.0.113.1:4433"}
← {"type":"registered","expires_at":1705320000}

// Client lookup
→ {"type":"lookup","code":"WORM-ABCD-EFGH"}
← {"type":"found","addr":"203.0.113.1:4433","pake_msg":"..."}`}</DocsCode>
        <p>
          Details evolve with <code>teleport-signal</code>. Prefer reading the crate
          and <Link href="/docs/architecture/signal-server">architecture notes</Link>.
        </p>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/cli">CLI</Link>
          </li>
          <li>
            <Link href="/docs/configuration/env">Environment variables</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
