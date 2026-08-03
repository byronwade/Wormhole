import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsLinkGrid,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "Performance — Wormhole Docs",
  description: "Benchmarks, resource usage, and links to cache/network tuning.",
};

export default function PerformancePage() {
  return (
    <DocsArticle>
      <DocsHeader
        title="Performance"
        description="Targets: large folders usable in seconds, LAN near wire speed, modest idle memory."
      />

      <section>
        <h2>Targets</h2>
        <DocsTable
          headers={["Metric", "Goal"]}
          rows={[
            ["Access 50 GB folder", "<10 s (metadata + mount)"],
            ["First byte", "<100 ms on LAN"],
            ["LAN sequential read", "100+ MB/s on 1 GbE"],
            ["Idle memory", "<50 MB (before cache fill)"],
          ]}
        />
      </section>

      <section>
        <h2>Sample LAN results</h2>
        <p>
          Measured on two M1 MacBooks over 1&nbsp;Gbps Ethernet. Your numbers depend
          on hardware and network.
        </p>
        <DocsTable
          headers={["Test", "Result", "Notes"]}
          rows={[
            ["Sequential read (1 GB)", "115 MB/s", "Near wire speed"],
            ["Random read (4 KB)", "45 MB/s", "Latency-bound"],
            ["ls -R ~10k files", "180 ms", "Faster when cached"],
            ["Open (cold)", "15 ms", "First access"],
            ["Open (cached)", "<1 ms", "RAM cache"],
          ]}
        />
      </section>

      <section>
        <h2>Sample WAN (100 Mbps)</h2>
        <DocsTable
          headers={["Test", "Result", "Notes"]}
          rows={[
            ["Sequential read", "11 MB/s", "~90% of bandwidth"],
            ["Connection time", "3.2 s", "NAT + PAKE"],
            ["First byte", "85 ms", "Includes RTT"],
            ["Reconnect (0-RTT)", "0.8 s", "When enabled"],
          ]}
        />
      </section>

      <section>
        <h2>Resource usage</h2>
        <DocsTable
          headers={["Metric", "Idle", "Active", "Peak"]}
          rows={[
            ["Memory", "~30 MB", "~150 MB", "Up to RAM cache cap"],
            ["CPU", "<1%", "5–15%", "~25%"],
            ["Disk cache", "0", "varies", "Config max (default 10 GB)"],
          ]}
        />
      </section>

      <section>
        <h2>Quick bench</h2>
        <DocsCode>{`wormhole host ~/test-data --no-signal
# other machine:
wormhole bench 192.168.1.42:4433`}</DocsCode>
        <p>
          Full guide:{" "}
          <Link href="/docs/performance/run-benchmarks">run benchmarks</Link>.
        </p>
      </section>

      <section>
        <h2>Guides</h2>
        <DocsLinkGrid
          items={[
            {
              title: "Cache",
              description: "Hit rates, sizes, prefetch.",
              href: "/docs/performance/cache",
            },
            {
              title: "Network",
              description: "LAN/WAN bottlenecks and streams.",
              href: "/docs/performance/network",
            },
            {
              title: "Tuning",
              description: "Workload-oriented knobs.",
              href: "/docs/performance/tuning",
            },
            {
              title: "Run benchmarks",
              description: "bench, scripts, fio/dd.",
              href: "/docs/performance/run-benchmarks",
            },
          ]}
        />
      </section>
    </DocsArticle>
  );
}
