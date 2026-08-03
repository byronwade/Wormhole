import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsNote,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "Run Benchmarks — Wormhole Docs",
  description: "How to measure Wormhole throughput and latency on your network.",
};

export default function RunBenchmarksPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "Performance", href: "/docs/performance" }}
        title="Run benchmarks"
        description="Use the built-in bench command, then fall back to dd/fio for mount-level numbers."
      />

      <section>
        <h2>Built-in bench</h2>
        <DocsCode>{`# Host
wormhole host ~/test-data --no-signal

# Client
wormhole bench 192.168.1.42:4433

# JSON for sharing
wormhole bench 192.168.1.42:4433 --format json > results.json`}</DocsCode>
        <DocsTable
          headers={["Option", "Description"]}
          rows={[
            ["--test <TYPE>", "all | read | write | latency | metadata"],
            ["--duration <SECS>", "Per-test duration (default ~10)"],
            ["--parallel <N>", "Concurrent readers"],
            ["--format json", "Machine-readable output"],
          ]}
        />
      </section>

      <section>
        <h2>Unix tools on a mount</h2>
        <DocsCode>{`wormhole mount 192.168.1.42:4433 ~/mnt

# Sequential
dd if=~/mnt/largefile.bin of=/dev/null bs=1M

# Metadata
time find ~/mnt -type f | wc -l

# Random (Linux)
fio --name=randread --ioengine=libaio --iodepth=16 \\
  --rw=randread --bs=4k --direct=1 --size=256M \\
  --filename=~/mnt/testfile --runtime=30`}</DocsCode>
      </section>

      <section>
        <h2>Cache effectiveness</h2>
        <DocsCode>{`wormhole cache stats --detailed
# Re-run the same read; hit rate should climb`}</DocsCode>
      </section>

      <section>
        <h2>If numbers look bad</h2>
        <ul>
          <li>Confirm both ends are on the intended interface (not VPN hairpin).</li>
          <li>Disable power-saving Wi‑Fi or move to Ethernet.</li>
          <li>Check host disk isn’t the bottleneck (<code>iostat</code> / Activity Monitor).</li>
          <li>
            See <Link href="/docs/troubleshooting/performance">performance troubleshooting</Link>.
          </li>
        </ul>
        <DocsNote>
          Compare cold vs warm cache separately — otherwise you measure network on
          every run.
        </DocsNote>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/performance">Performance overview</Link>
          </li>
          <li>
            <Link href="/docs/performance/tuning">Tuning</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
