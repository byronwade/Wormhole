import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsLinkGrid,
  DocsNote,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "Self-Hosting — Wormhole Docs",
  description: "Run your own Wormhole signal server with Docker or systemd.",
};

export default function SelfHostingPage() {
  return (
    <DocsArticle>
      <DocsHeader
        title="Self-hosting"
        description="Run the signal server yourself for privacy and control. It never sees file bytes."
      />

      <section>
        <h2>Why self-host</h2>
        <ul>
          <li>Keep rendezvous metadata on your network</li>
          <li>Set rate limits, expiry, and capacity</li>
          <li>Independence from a public signal endpoint</li>
        </ul>
        <DocsNote>
          Even on a public signal, transfers are peer-to-peer and encrypted. Self-hosting
          reduces who sees join codes and IPs.
        </DocsNote>
      </section>

      <section>
        <h2>Quick start</h2>
        <DocsCode>{`# Binary / CLI
wormhole signal --port 8080

# Docker
docker run -d --name wormhole-signal -p 8080:8080 \\
  -e DB_PATH=/data/signal.db -v ./data:/data \\
  wormhole/signal:latest`}</DocsCode>
        <DocsCode>{`# docker-compose.yml
services:
  signal:
    image: wormhole/signal:latest
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - WORMHOLE_SIGNAL_PORT=8080
      - WORMHOLE_SIGNAL_DB_PATH=/data/signal.db
    volumes:
      - ./data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3`}</DocsCode>
      </section>

      <section>
        <h2>Options</h2>
        <DocsTable
          headers={["Option", "Description", "Default"]}
          rows={[
            ["--port", "WebSocket listen port", "8080"],
            ["--bind", "Bind address", "0.0.0.0"],
            ["--db", "SQLite path", "in-memory"],
            ["--max-connections", "Concurrent sockets", "1000"],
            ["--code-expiry", "Join code TTL (seconds)", "3600"],
            ["--rate-limit", "Enable per-IP limits", "off"],
            ["--rate-limit-rpm", "Requests/minute/IP", "60"],
            ["--tls-cert / --tls-key", "Native WSS certs", "none"],
            ["--metrics", "Prometheus endpoint", "off"],
          ]}
        />
      </section>

      <section>
        <h2>Point clients at your server</h2>
        <DocsCode>{`wormhole host ~/folder --signal-server wss://signal.example.com
wormhole mount CODE ~/mnt --signal wss://signal.example.com

# or
export WORMHOLE_SIGNAL_SERVER=wss://signal.example.com`}</DocsCode>
      </section>

      <section>
        <h2>Guides</h2>
        <DocsLinkGrid
          items={[
            {
              title: "Docker",
              description: "Images, volumes, compose.",
              href: "/docs/self-hosting/docker",
            },
            {
              title: "Production",
              description: "TLS, systemd, hardening.",
              href: "/docs/self-hosting/production",
            },
            {
              title: "Monitoring",
              description: "Health checks and metrics.",
              href: "/docs/self-hosting/monitoring",
            },
          ]}
        />
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/cli/signal">wormhole signal</Link>
          </li>
          <li>
            <Link href="/docs/architecture/signal-server">Architecture</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
