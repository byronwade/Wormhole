import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "Performance Troubleshooting — Wormhole Docs",
  description: "Fix slow reads, cache thrash, and high latency on Wormhole mounts.",
};

export default function TroubleshootingPerfPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "Troubleshooting", href: "/docs/troubleshooting" }}
        title="Performance issues"
        description="Measure first. Cold cache and Wi‑Fi look like “Wormhole is slow”."
      />

      <section>
        <h2>Measure</h2>
        <DocsCode>{`wormhole bench HOST:PORT
wormhole cache stats --detailed
wormhole status --detailed`}</DocsCode>
      </section>

      <section>
        <h2>Patterns</h2>
        <DocsTable
          headers={["Pattern", "Action"]}
          rows={[
            ["First scrub slow, second fast", "Normal cold cache; enlarge RAM cache"],
            ["Always slow sequential", "Check NIC/VPN; run bench on LAN"],
            ["Random I/O crawls", "Expect RTT limits; raise prefetch carefully"],
            ["High CPU on host", "Disk or encode contention on host"],
            ["Cache thrash", "Raise max_ram_bytes / max_disk_bytes"],
          ]}
        />
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/performance/tuning">Tuning</Link>
          </li>
          <li>
            <Link href="/docs/performance/run-benchmarks">Run benchmarks</Link>
          </li>
          <li>
            <Link href="/docs/performance/cache">Cache performance</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
