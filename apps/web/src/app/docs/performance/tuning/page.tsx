import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsNote,
} from "@/components/docs-ui";

export const metadata = {
  title: "Performance Tuning — Wormhole Docs",
  description: "Workload-oriented Wormhole mount and cache settings.",
};

export default function PerfTuningPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "Performance", href: "/docs/performance" }}
        title="Tuning"
        description="Pick settings for the workload: scrubbing video, browsing code trees, or constrained WAN."
      />

      <section>
        <h2>Video / streaming</h2>
        <DocsCode>{`wormhole mount CODE ~/mnt/video \\
  --ram-cache-mb 2048 \\
  --disk-cache-gb 50

# config equivalent
[cache]
max_ram_bytes = 2147483648
max_disk_bytes = 53687091200
[client]
read_ahead_chunks = 8`}</DocsCode>
      </section>

      <section>
        <h2>Many small files</h2>
        <DocsCode>{`[client]
attr_ttl_secs = 5
dir_ttl_secs = 5
read_ahead_chunks = 2`}</DocsCode>
        <p>
          Higher attr TTL reduces getattr chatter; lower prefetch avoids wasteful
          chunk fetches.
        </p>
      </section>

      <section>
        <h2>Bandwidth-limited WAN</h2>
        <DocsCode>{`[cache]
max_disk_bytes = 21474836480
[network]
request_timeout_secs = 60
connect_timeout_secs = 20`}</DocsCode>
        <DocsNote>
          Keep the mount warm. Clearing cache on a slow link forces expensive
          re-downloads.
        </DocsNote>
      </section>

      <section>
        <h2>Host side</h2>
        <ul>
          <li>Serve from SSD when possible.</li>
          <li>Avoid CPU-starved hosts during encode + share.</li>
          <li>
            Cap peers with <code>max_connections</code> if one client saturates the
            link.
          </li>
        </ul>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/configuration">Configuration</Link>
          </li>
          <li>
            <Link href="/docs/performance/run-benchmarks">Run benchmarks</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
