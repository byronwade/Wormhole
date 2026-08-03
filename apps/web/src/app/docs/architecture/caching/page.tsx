import Link from "next/link";
import {
  DocsArticle,
  DocsCode,
  DocsHeader,
  DocsNote,
  DocsTable,
} from "@/components/docs-ui";

export const metadata = {
  title: "Caching — Wormhole Docs",
  description: "RAM and disk chunk cache, prefetch, and LRU eviction in Wormhole.",
};

export default function CachingArchitecturePage() {
  return (
    <DocsArticle>
      <DocsHeader
        crumb={{ label: "Architecture", href: "/docs/architecture" }}
        title="Caching"
        description="Two tiers: hot chunks in RAM, colder chunks on disk. Reads miss network when possible."
      />

      <section>
        <h2>Overview</h2>
        <ol>
          <li>Check L1 RAM cache.</li>
          <li>Miss → check L2 disk cache.</li>
          <li>Miss → fetch chunk over QUIC; populate L1 (and L2 when configured).</li>
        </ol>
        <p>Chunk size is fixed at 128&nbsp;KB.</p>
      </section>

      <section>
        <h2>L1 — RAM</h2>
        <ul>
          <li>Fast path for sequential and repeated reads</li>
          <li>Bounded by <code>cache.max_ram_bytes</code> (default 512&nbsp;MB)</li>
          <li>LRU eviction under pressure</li>
        </ul>
      </section>

      <section>
        <h2>L2 — disk</h2>
        <ul>
          <li>Persists across remounts for offline-ish re-reads</li>
          <li>Default cap <code>cache.max_disk_bytes</code> (10&nbsp;GB)</li>
          <li>Index + chunk files under the cache directory</li>
        </ul>
        <DocsCode>{`~/.cache/wormhole/
├── index.db          # metadata / integrity
└── chunks/
    └── …`}</DocsCode>
        <DocsNote>
          Cache files are not encrypted by Wormhole. Use OS disk encryption. See{" "}
          <Link href="/docs/security/encryption">encryption</Link>.
        </DocsNote>
      </section>

      <section>
        <h2>Lookup flow</h2>
        <DocsCode>{`async fn read_chunk(inode: u64, offset: u64, size: u32) -> Result<Vec<u8>> {
    if let Some(data) = ram.get(inode, offset, size) {
        return Ok(data);
    }
    if let Some(data) = disk.read(inode, offset).await? {
        ram.insert(inode, offset, data.clone());
        return Ok(data);
    }
    let data = connection.fetch_chunk(inode, offset, size).await?;
    ram.insert(inode, offset, data.clone());
    disk.write(inode, offset, &data).await?;
    Ok(data)
}`}</DocsCode>
      </section>

      <section>
        <h2>Prefetch</h2>
        <p>
          Sequential reads trigger read-ahead (
          <code>client.read_ahead_chunks</code>, default 4). Goal: hide RTT while
          editors scrub timelines or tools stream large files.
        </p>
      </section>

      <section>
        <h2>Invalidation</h2>
        <p>
          Host notifications (<code>Invalidate</code>, file change events) drop
          stale entries. TTL-based expiry also applies to attrs and directory
          listings.
        </p>
      </section>

      <section>
        <h2>Modes and knobs</h2>
        <DocsTable
          headers={["Setting", "Default", "Notes"]}
          rows={[
            ["max_ram_bytes", "512 MB", "Hot working set"],
            ["max_disk_bytes", "10 GB", "Persistent chunks"],
            ["chunk_ttl_secs", "3600", "Soft expiry before GC"],
            ["read_ahead_chunks", "4", "Sequential prefetch depth"],
          ]}
        />
        <p>
          Configure via <Link href="/docs/configuration/cache">cache config</Link>{" "}
          or <Link href="/docs/cli/cache">wormhole cache</Link>.
        </p>
      </section>

      <section>
        <h2>See also</h2>
        <ul>
          <li>
            <Link href="/docs/performance/cache">Performance: cache</Link>
          </li>
          <li>
            <Link href="/docs/architecture/fuse">FUSE</Link>
          </li>
        </ul>
      </section>
    </DocsArticle>
  );
}
