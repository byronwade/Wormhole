import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "Cache Performance — Wormhole Docs",
  description: "Improve hit rates and working-set fit for Wormhole mounts.",
};

export default function PerfCachePage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "Performance", href: "/docs/performance" }}
        title="Cache performance"
        description="Most “slow mount” issues are cold cache or an undersized RAM tier."
      />

      <section>
        <h2>Check hit rates</h2>
        <DocsCode>{`wormhole cache stats --detailed

# Look for:
# RAM hit rate (should be high on sequential scrub)
# Network fetches (should drop after warm-up)`}</DocsCode>
      </section>

      <section>
        <h2>Sizing</h2>
        <DocsTable
          headers={["Workload", "Suggestion"]}
          rows={[
            ["Video scrub / NLE", "Large RAM (1–2 GB+) + big disk cache"],
            ["Many small files", "Higher attr/dir TTL; moderate RAM"],
            ["Low memory laptop", "Smaller RAM, rely on disk cache"],
            ["One-shot copy", "Disk cache less important; stream once"],
          ]}
        />
        <DocsCode>{`[cache]
max_ram_bytes = 2147483648
max_disk_bytes = 53687091200

[client]
read_ahead_chunks = 8`}</DocsCode>
      </section>

      <section>
        <h2>Warm-up</h2>
        <p>
          First pass over a timeline or tree pays network cost. Second pass should
          hit L1/L2. Clear only when diagnosing:{" "}
          <code>wormhole cache clear</code>.
        </p>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/architecture/caching">Caching architecture</Link>
          </li>
          <li>
            <Link href="/docs/configuration/cache">Cache configuration</Link>
          </li>
          <li>
            <Link href="/docs/troubleshooting/performance">Perf troubleshooting</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
