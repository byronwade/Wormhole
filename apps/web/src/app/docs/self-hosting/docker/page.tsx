import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsNote,
} from "@/components/docs-ui";

export const metadata = {
  title: "Docker Self-Hosting — Wormhole Docs",
  description: "Run the Wormhole signal server in Docker or Compose.",
};

export default function SelfHostingDockerPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "Self-hosting", href: "/docs/self-hosting" }}
        title="Docker"
        description="Container image for teleport-signal with optional SQLite persistence."
      />

      <section>
        <h2>Run</h2>
        <DocsCode>{`docker run -d \\
  --name wormhole-signal \\
  -p 8080:8080 \\
  -e DB_PATH=/data/signal.db \\
  -v ./data:/data \\
  wormhole/signal:latest`}</DocsCode>
      </section>

      <section>
        <h2>Compose</h2>
        <DocsCode>{`services:
  signal:
    image: wormhole/signal:latest
    container_name: wormhole-signal
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - WORMHOLE_SIGNAL_PORT=8080
      - WORMHOLE_SIGNAL_DB_PATH=/data/signal.db
      - WORMHOLE_LOG_LEVEL=info
    volumes:
      - ./data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3`}</DocsCode>
        <DocsNote>
          Terminate TLS at a reverse proxy (Caddy/nginx) in front of port 8080 for{" "}
          <code>wss://</code>. See{" "}
          <Link href="/docs/self-hosting/production">production</Link>.
        </DocsNote>
      </section>

      <section>
        <h2>Clients</h2>
        <DocsCode>{`export WORMHOLE_SIGNAL_SERVER=wss://signal.example.com
wormhole host ~/share
wormhole mount WORM-XXXX ~/mnt`}</DocsCode>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/self-hosting/monitoring">Monitoring</Link>
          </li>
          <li>
            <Link href="/docs/configuration/env">Environment variables</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
