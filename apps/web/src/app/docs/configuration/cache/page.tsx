import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "Cache Configuration — Wormhole Docs",
  description: "RAM and disk cache size, TTL, and GC settings.",
};

export default function CacheConfigPage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "Configuration", href: "/docs/configuration" }}
        title="Cache"
        description="[cache] sizes the L1 RAM and L2 disk stores and controls expiry."
      />

      <section>
        <h2>Keys</h2>
        <DocsTable
          headers={["Key", "Default", "Description"]}
          rows={[
            ["max_disk_bytes", "10737418240", "Disk cache cap (10 GB)"],
            ["max_ram_bytes", "536870912", "RAM cache cap (512 MB)"],
            ["cache_dir", "(platform default)", "Override cache location"],
            ["chunk_ttl_secs", "3600", "Soft TTL before GC"],
            ["gc_interval_secs", "60", "Garbage collection interval"],
            ["secure_delete", "false", "Overwrite on delete"],
          ]}
        />
      </section>

      <section>
        <h2>Example</h2>
        <DocsCode>{`[cache]
max_disk_bytes = 21474836480
max_ram_bytes = 1073741824
# cache_dir = "/var/cache/wormhole"
chunk_ttl_secs = 3600
gc_interval_secs = 60
secure_delete = false`}</DocsCode>
      </section>

      <section>
        <h2>CLI and env</h2>
        <DocsCode>{`wormhole config set cache.max_ram_bytes 1073741824
export WORMHOLE_CACHE_RAM_MB=1024
export WORMHOLE_CACHE_DISK_GB=20
export WORMHOLE_CACHE_DIR=/var/cache/wormhole

wormhole cache status
wormhole cache clear`}</DocsCode>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/architecture/caching">Caching architecture</Link>
          </li>
          <li>
            <Link href="/docs/performance/cache">Cache performance</Link>
          </li>
          <li>
            <Link href="/docs/cli/cache">wormhole cache</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
