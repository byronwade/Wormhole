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
  title: "Configuration — Wormhole Docs",
  description: "TOML config paths, sections, CLI helpers, and priority order.",
};

export default function ConfigurationPage() {
  return (
    <DocsArticle>
      <DocsHeader
        title="Configuration"
        description="TOML file, environment variables, and CLI flags. Flags win over env over file over defaults."
      />

      <section>
        <h2>Config file location</h2>
        <DocsTable
          headers={["Platform", "Path"]}
          rows={[
            ["macOS", "~/Library/Application Support/wormhole/config.toml"],
            ["Linux", "~/.config/wormhole/config.toml"],
            ["Windows", "%APPDATA%\\wormhole\\config.toml"],
          ]}
        />
        <DocsCode>{`wormhole config path
wormhole config show
wormhole config edit`}</DocsCode>
      </section>

      <section>
        <h2>Example config.toml</h2>
        <DocsCode>{`[host]
port = 4433
bind = "0.0.0.0"
writable = false
auto_cert = true
max_connections = 10

[client]
read_ahead_chunks = 4
attr_ttl_secs = 1
dir_ttl_secs = 1
sync_interval_secs = 1
auto_reconnect = true
max_reconnect_attempts = 0

[cache]
max_disk_bytes = 10737418240
max_ram_bytes = 536870912
chunk_ttl_secs = 3600
gc_interval_secs = 60
secure_delete = false

[signal]
port = 8080
bind = "0.0.0.0"
room_idle_timeout_secs = 300
max_peers_per_room = 10
rate_limit = true
rate_limit_rpm = 60

[network]
connect_timeout_secs = 10
request_timeout_secs = 30
keepalive_secs = 15
max_streams = 100
enable_0rtt = false
signal_server = "ws://localhost:8080"
stun_servers = [
  "stun.l.google.com:19302",
  "stun1.l.google.com:19302"
]

[logging]
level = "info"
format = "pretty"
timestamps = true

[ui]
start_minimized = false
show_tray = true
start_on_boot = false
auto_update_check = true
theme = "system"`}</DocsCode>
      </section>

      <section>
        <h2>Sections</h2>
        <DocsLinkGrid
          items={[
            {
              title: "[cache]",
              description: "RAM/disk size, TTL, GC.",
              href: "/docs/configuration/cache",
            },
            {
              title: "[network]",
              description: "Timeouts, streams, signal, STUN.",
              href: "/docs/configuration/network",
            },
            {
              title: "Environment variables",
              description: "Overrides for containers and CI.",
              href: "/docs/configuration/env",
            },
            {
              title: "Examples",
              description: "Ready-made configs for common setups.",
              href: "/docs/configuration/examples",
            },
          ]}
        />
      </section>

      <section>
        <h2>CLI helpers</h2>
        <DocsCode>{`wormhole config show
wormhole config get cache.max_disk_bytes
wormhole config set cache.max_disk_bytes 21474836480
wormhole config reset
wormhole config import ~/wormhole-config.toml
wormhole config export ~/wormhole-backup.toml`}</DocsCode>
        <DocsNote>
          Full command reference:{" "}
          <Link href="/docs/cli/config">wormhole config</Link>.
        </DocsNote>
      </section>

      <section>
        <h2>Priority</h2>
        <ol>
          <li>Command-line flags</li>
          <li>Environment variables</li>
          <li>Config file</li>
          <li>Built-in defaults</li>
        </ol>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/self-hosting">Self-hosting</Link>
          </li>
          <li>
            <Link href="/docs/performance/tuning">Performance tuning</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
