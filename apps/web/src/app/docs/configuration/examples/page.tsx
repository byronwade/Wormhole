import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
} from "@/components/docs-ui";

export const metadata = {
  title: "Configuration Examples — Wormhole Docs",
  description: "Sample Wormhole configs for LAN, WAN, and self-hosted signal.",
};

export default function ConfigExamplesPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "Configuration", href: "/docs/configuration" }}
        title="Examples"
        description="Drop-in TOML snippets for common deployments."
      />

      <section>
        <h2>LAN-only (no signal)</h2>
        <DocsCode>{`[host]
port = 4433
bind = "0.0.0.0"
writable = false

[network]
# Clients use host:port directly
# wormhole mount 192.168.1.20:4433

[cache]
max_ram_bytes = 1073741824
max_disk_bytes = 21474836480`}</DocsCode>
        <p>
          Host with <code>wormhole host ~/share --no-signal</code>.
        </p>
      </section>

      <section>
        <h2>Join codes via public or private signal</h2>
        <DocsCode>{`[network]
signal_server = "wss://signal.example.com"
connect_timeout_secs = 15
request_timeout_secs = 45

[client]
read_ahead_chunks = 8
auto_reconnect = true`}</DocsCode>
      </section>

      <section>
        <h2>Self-hosted signal on the same box</h2>
        <DocsCode>{`[signal]
port = 8080
bind = "0.0.0.0"
db_path = "/var/lib/wormhole/signal.db"
rate_limit = true
rate_limit_rpm = 60

[network]
signal_server = "ws://127.0.0.1:8080"`}</DocsCode>
        <p>
          Production TLS usually sits behind Caddy/nginx — see{" "}
          <Link href="/docs/self-hosting/production">production</Link>.
        </p>
      </section>

      <section>
        <h2>Low-memory client</h2>
        <DocsCode>{`[cache]
max_ram_bytes = 134217728   # 128 MB
max_disk_bytes = 4294967296 # 4 GB

[client]
read_ahead_chunks = 2
attr_ttl_secs = 5`}</DocsCode>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/configuration">Configuration reference</Link>
          </li>
          <li>
            <Link href="/docs/performance/tuning">Tuning</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
