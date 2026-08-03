import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "Network Configuration — Wormhole Docs",
  description: "Timeouts, QUIC streams, signal URL, and STUN settings.",
};

export default function NetworkConfigPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "Configuration", href: "/docs/configuration" }}
        title="Network"
        description="[network] controls connect/request timeouts, stream limits, signal URL, and STUN."
      />

      <section>
        <h2>Keys</h2>
        <DocsTable
          headers={["Key", "Default", "Description"]}
          rows={[
            ["connect_timeout_secs", "10", "Time to establish QUIC"],
            ["request_timeout_secs", "30", "Per-request deadline"],
            ["keepalive_secs", "15", "Idle keepalive interval"],
            ["max_streams", "100", "Max concurrent QUIC streams"],
            ["enable_0rtt", "false", "QUIC 0-RTT resumption"],
            ["signal_server", "ws://localhost:8080", "Rendezvous URL"],
            ["stun_servers", "(Google STUN)", "NAT reflexive address helpers"],
          ]}
        />
      </section>

      <section>
        <h2>Example</h2>
        <DocsCode>{`[network]
connect_timeout_secs = 10
request_timeout_secs = 30
keepalive_secs = 15
max_streams = 100
enable_0rtt = false
signal_server = "wss://signal.example.com"
stun_servers = [
  "stun.l.google.com:19302",
  "stun1.l.google.com:19302"
]`}</DocsCode>
      </section>

      <section>
        <h2>Related host/client knobs</h2>
        <ul>
          <li>
            <code>[host].port</code> / <code>bind</code> — where the share listens
          </li>
          <li>
            <code>[host].max_connections</code> — peer cap
          </li>
          <li>
            CLI: <code>--no-signal</code>, <code>--port</code> on{" "}
            <Link href="/docs/cli/host">host</Link> /{" "}
            <Link href="/docs/cli/mount">mount</Link>
          </li>
        </ul>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/architecture/quic">QUIC</Link>
          </li>
          <li>
            <Link href="/docs/troubleshooting/network">Network troubleshooting</Link>
          </li>
          <li>
            <Link href="/docs/configuration/env">Environment variables</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
