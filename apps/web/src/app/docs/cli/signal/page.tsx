import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsNote,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "wormhole signal — CLI Reference",
  description: "Run the Wormhole rendezvous / signal server from the CLI.",
};

export default function SignalCommandPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "CLI", href: "/docs/cli" }}
        title="wormhole signal"
        description="Start a WebSocket rendezvous server. Does not proxy file data."
      />

      <section>
        <h2>Synopsis</h2>
        <DocsCode>{"wormhole signal [OPTIONS]"}</DocsCode>
      </section>

      <section>
        <h2>What it does</h2>
        <ul>
          <li>Registers join codes → peer addresses</li>
          <li>Relays PAKE public messages for authentication setup</li>
          <li>Helps with NAT candidate exchange</li>
        </ul>
        <p>It does not see file contents or directory listings.</p>
      </section>

      <section>
        <h2>Options</h2>
        <DocsTable
          headers={["Option", "Description"]}
          rows={[
            ["--port <PORT>", "Listen port (default 8080)"],
            ["--bind <ADDR>", "Bind address"],
            ["--db <PATH>", "SQLite persistence"],
            ["--max-connections <N>", "Concurrent sockets"],
            ["--code-expiry <SECS>", "Join code TTL"],
            ["--rate-limit", "Enable per-IP rate limits"],
            ["--rate-limit-rpm <N>", "Requests per minute"],
            ["--tls-cert / --tls-key", "Serve WSS directly"],
            ["--metrics [--metrics-port]", "Prometheus endpoint"],
            ["--daemon", "Background (platform-dependent)"],
          ]}
        />
      </section>

      <section>
        <h2>Examples</h2>
        <DocsCode>{`wormhole signal
wormhole signal --port 9000

# Rate-limited public-ish deploy
wormhole signal --rate-limit --rate-limit-rpm 30 --max-connections 5000

# Metrics
wormhole signal --metrics --metrics-port 9090

# TLS (or terminate at Caddy — preferred)
wormhole signal \\
  --tls-cert /etc/ssl/signal.crt \\
  --tls-key /etc/ssl/signal.key`}</DocsCode>
        <DocsNote>
          Production checklist:{" "}
          <Link href="/docs/self-hosting/production">self-hosting production</Link>.
        </DocsNote>
      </section>

      <section>
        <h2>Point peers at this server</h2>
        <DocsCode>{`wormhole host ~/folder --signal-server wss://signal.example.com
export WORMHOLE_SIGNAL_SERVER=wss://signal.example.com`}</DocsCode>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/self-hosting">Self-hosting</Link>
          </li>
          <li>
            <Link href="/docs/architecture/signal-server">Architecture</Link>
          </li>
          <li>
            <Link href="/docs/cli/all-commands">All commands</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
