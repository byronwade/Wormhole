import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsNote,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "Network Performance — Wormhole Docs",
  description: "LAN vs WAN throughput, streams, and timeout tuning.",
};

export default function PerfNetworkPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "Performance", href: "/docs/performance" }}
        title="Network performance"
        description="QUIC multiplexes chunk reads. Throughput tracks your path; latency dominates random I/O."
      />

      <section>
        <h2>What usually limits you</h2>
        <DocsTable
          headers={["Situation", "Limiter"]}
          rows={[
            ["1 GbE LAN sequential", "NIC / disk of host"],
            ["Wi‑Fi", "Airtime and retransmits"],
            ["WAN", "Bandwidth + RTT"],
            ["Random 4K reads", "RTT × ops"],
            ["Many parallel opens", "Stream limits / CPU"],
          ]}
        />
      </section>

      <section>
        <h2>Knobs</h2>
        <DocsCode>{`[network]
max_streams = 100
request_timeout_secs = 30
keepalive_secs = 15
enable_0rtt = false

[client]
read_ahead_chunks = 4`}</DocsCode>
        <DocsNote>
          Prefer wired LAN for editors. For WAN, increase timeouts and lean on disk
          cache so remounts avoid re-fetching.
        </DocsNote>
      </section>

      <section>
        <h2>Measure</h2>
        <DocsCode>{`wormhole bench 192.168.1.42:4433
wormhole ping WORM-XXXX`}</DocsCode>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/architecture/quic">QUIC</Link>
          </li>
          <li>
            <Link href="/docs/configuration/network">Network config</Link>
          </li>
          <li>
            <Link href="/docs/troubleshooting/network">Network troubleshooting</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
