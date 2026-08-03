import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsNote,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "Environment Variables — Wormhole Docs",
  description: "WORMHOLE_* env overrides for config, cache, logging, and signal.",
};

export default function EnvConfigPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "Configuration", href: "/docs/configuration" }}
        title="Environment variables"
        description="Env vars override the TOML file. Useful for Docker, systemd, and CI."
      />

      <section>
        <h2>Common variables</h2>
        <DocsTable
          headers={["Variable", "Description", "Example"]}
          rows={[
            ["WORMHOLE_CONFIG", "Config file path", "/etc/wormhole/config.toml"],
            ["WORMHOLE_CACHE_DIR", "Cache directory", "/var/cache/wormhole"],
            ["WORMHOLE_LOG_LEVEL", "Log level", "debug"],
            ["WORMHOLE_SIGNAL_SERVER", "Signal WebSocket URL", "wss://signal.example.com"],
            ["WORMHOLE_HOST_PORT", "Default host port", "5000"],
            ["WORMHOLE_CACHE_RAM_MB", "RAM cache size (MB)", "1024"],
            ["WORMHOLE_CACHE_DISK_GB", "Disk cache size (GB)", "20"],
            ["RUST_LOG", "Detailed Rust filters", "wormhole=debug,quinn=info"],
          ]}
        />
        <DocsNote>
          Priority: CLI flags → env → config file → defaults. See{" "}
          <Link href="/docs/configuration">configuration overview</Link>.
        </DocsNote>
      </section>

      <section>
        <h2>Docker example</h2>
        <DocsCode>{`services:
  wormhole:
    image: wormhole/daemon:latest
    environment:
      - WORMHOLE_LOG_LEVEL=info
      - WORMHOLE_CACHE_DISK_GB=50
      - WORMHOLE_SIGNAL_SERVER=wss://signal.mycompany.com
    volumes:
      - ./data:/data
      - ./cache:/var/cache/wormhole`}</DocsCode>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/self-hosting/docker">Self-hosting Docker</Link>
          </li>
          <li>
            <Link href="/docs/configuration/examples">Example configs</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
