import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsNote,
} from "@/components/docs-ui";

export const metadata = {
  title: "Production Self-Hosting — Wormhole Docs",
  description: "TLS, systemd, and hardening for a public Wormhole signal server.",
};

export default function SelfHostingProductionPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "Self-hosting", href: "/docs/self-hosting" }}
        title="Production"
        description="Put TLS in front, persist rooms to disk, rate-limit, and run under systemd."
      />

      <section>
        <h2>TLS with Caddy</h2>
        <DocsCode>{`# Caddyfile
signal.example.com {
    reverse_proxy localhost:8080
}

caddy run --config Caddyfile
wormhole signal --port 8080 --db /var/lib/wormhole/signal.db --rate-limit`}</DocsCode>
        <DocsNote>
          Prefer terminating TLS at the proxy. Native <code>--tls-cert</code> /{" "}
          <code>--tls-key</code> works if you manage certs yourself.
        </DocsNote>
      </section>

      <section>
        <h2>systemd</h2>
        <DocsCode>{`[Unit]
Description=Wormhole Signal Server
After=network.target

[Service]
Type=simple
User=wormhole
Group=wormhole
ExecStart=/usr/local/bin/wormhole-signal \\
    --port 8080 \\
    --db /var/lib/wormhole/signal.db \\
    --rate-limit \\
    --rate-limit-rpm 60 \\
    --max-connections 1000
Restart=always
RestartSec=10
Environment=RUST_LOG=info
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/wormhole

[Install]
WantedBy=multi-user.target`}</DocsCode>
        <DocsCode>{`sudo useradd -r -s /bin/false wormhole
sudo mkdir -p /var/lib/wormhole && sudo chown wormhole:wormhole /var/lib/wormhole
sudo systemctl enable --now wormhole-signal`}</DocsCode>
      </section>

      <section>
        <h2>Checklist</h2>
        <ul>
          <li>
            <code>wss://</code> only on the public internet
          </li>
          <li>SQLite (or equivalent) persistence with backups</li>
          <li>Rate limiting enabled</li>
          <li>
            <Link href="/docs/self-hosting/monitoring">Health + metrics</Link> scraped
          </li>
          <li>Firewall: only 443 (or your WSS port) exposed</li>
        </ul>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/self-hosting/docker">Docker</Link>
          </li>
          <li>
            <Link href="/docs/security/threat-model">Threat model</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
