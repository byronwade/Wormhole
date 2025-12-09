import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Zap, HardDrive, ArrowDown } from "lucide-react";

export const metadata = {
  title: "Caching System - Wormhole Architecture",
  description: "How Wormhole's two-tier cache provides fast access and offline support.",
};

export default function CachingArchitecturePage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/docs/architecture" className="hover:text-white">Architecture</Link>
          <span>/</span>
          <span className="text-zinc-400">Caching</span>
        </div>
        <h1 className="text-4xl font-bold text-white tracking-tight">
          Two-Tier Caching System
        </h1>
        <p className="text-xl text-zinc-400">
          Wormhole uses L1 (RAM) and L2 (Disk) caches for performance and offline access.
        </p>
      </div>

      {/* Overview */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Overview</h2>
        <p className="text-zinc-300">
          Wormhole&apos;s caching system is designed to minimize network requests and enable
          offline file access. Data flows through a two-tier cache hierarchy before
          reaching the network.
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              <div className="flex justify-center items-center gap-2 flex-wrap">
                <div className="px-4 py-3 bg-blue-500/20 border border-blue-500/30 rounded w-32">
                  <div className="font-semibold text-blue-400">Application</div>
                  <div className="text-xs text-zinc-500">file read request</div>
                </div>
              </div>
              <ArrowDown className="h-5 w-5 text-zinc-600 mx-auto" />
              <div className="flex justify-center items-center gap-2 flex-wrap">
                <div className="px-4 py-3 bg-yellow-500/20 border border-yellow-500/30 rounded w-32">
                  <div className="font-semibold text-yellow-400">L1 Cache</div>
                  <div className="text-xs text-zinc-500">RAM (512MB)</div>
                </div>
                <div className="text-green-400 text-sm">~0.1ms</div>
              </div>
              <ArrowDown className="h-5 w-5 text-zinc-600 mx-auto" />
              <div className="flex justify-center items-center gap-2 flex-wrap">
                <div className="px-4 py-3 bg-orange-500/20 border border-orange-500/30 rounded w-32">
                  <div className="font-semibold text-orange-400">L2 Cache</div>
                  <div className="text-xs text-zinc-500">Disk (10GB)</div>
                </div>
                <div className="text-green-400 text-sm">~1-5ms</div>
              </div>
              <ArrowDown className="h-5 w-5 text-zinc-600 mx-auto" />
              <div className="flex justify-center items-center gap-2 flex-wrap">
                <div className="px-4 py-3 bg-violet-500/20 border border-violet-500/30 rounded w-32">
                  <div className="font-semibold text-violet-400">Network</div>
                  <div className="text-xs text-zinc-500">Remote Host</div>
                </div>
                <div className="text-yellow-400 text-sm">2-100ms+</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* L1 Cache */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Zap className="h-6 w-6 text-yellow-400" />
          L1 Cache (RAM)
        </h2>
        <p className="text-zinc-300">
          The L1 cache keeps recently accessed chunks in memory for instant access.
          Implementation is in <code className="text-violet-400">crates/teleport-daemon/src/cache.rs</code>.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <h3 className="font-semibold text-white mb-3">Characteristics</h3>
              <ul className="space-y-2 text-zinc-300 text-sm">
                <li><strong>Default size:</strong> 512 MB</li>
                <li><strong>Access time:</strong> ~0.1ms</li>
                <li><strong>Eviction:</strong> LRU (Least Recently Used)</li>
                <li><strong>Persistence:</strong> Lost on restart</li>
                <li><strong>Thread-safe:</strong> Yes (RwLock)</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <h3 className="font-semibold text-white mb-3">Best For</h3>
              <ul className="space-y-2 text-zinc-300 text-sm">
                <li>- Repeatedly accessed files</li>
                <li>- Sequential reads (prefetched chunks)</li>
                <li>- Directory listings</li>
                <li>- File attributes</li>
                <li>- Hot data in active sessions</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-zinc-900 border-zinc-800 mt-4">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`pub struct RamCache {
    // Chunk data: (inode, chunk_index) -> data
    chunks: RwLock<LruCache<(u64, u64), Arc<Vec<u8>>>>,

    // Metadata cache: inode -> FileAttr
    attrs: RwLock<LruCache<u64, FileAttr>>,

    // Directory listings: inode -> entries
    dirs: RwLock<LruCache<u64, Vec<DirEntry>>>,

    // Statistics
    stats: CacheStats,
}

impl RamCache {
    pub fn get_chunk(&self, inode: u64, chunk_idx: u64) -> Option<Arc<Vec<u8>>> {
        let mut cache = self.chunks.write().unwrap();
        cache.get(&(inode, chunk_idx)).cloned()
    }

    pub fn insert_chunk(&self, inode: u64, chunk_idx: u64, data: Vec<u8>) {
        let mut cache = self.chunks.write().unwrap();
        cache.put((inode, chunk_idx), Arc::new(data));
    }
}`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* L2 Cache */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <HardDrive className="h-6 w-6 text-orange-400" />
          L2 Cache (Disk)
        </h2>
        <p className="text-zinc-300">
          The L2 cache persists data to disk for offline access and to survive restarts.
          Implementation is in <code className="text-violet-400">crates/teleport-daemon/src/disk_cache.rs</code>.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <h3 className="font-semibold text-white mb-3">Characteristics</h3>
              <ul className="space-y-2 text-zinc-300 text-sm">
                <li><strong>Default size:</strong> 10 GB</li>
                <li><strong>Access time:</strong> 1-5ms (SSD), 10-50ms (HDD)</li>
                <li><strong>Eviction:</strong> LRU with size-based pruning</li>
                <li><strong>Persistence:</strong> Survives restarts</li>
                <li><strong>Location:</strong> ~/.cache/wormhole</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <h3 className="font-semibold text-white mb-3">Best For</h3>
              <ul className="space-y-2 text-zinc-300 text-sm">
                <li>- Offline access</li>
                <li>- Large files (video, images)</li>
                <li>- Data that survives restarts</li>
                <li>- Cache warming for trips</li>
                <li>- Cold data that may be needed later</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <h3 className="text-lg font-semibold text-white mt-6">Disk Layout</h3>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`~/.cache/wormhole/
├── index.db              # SQLite metadata database
├── chunks/
│   ├── aa/
│   │   ├── aabbccdd...   # Chunk files named by BLAKE3 hash
│   │   └── ...
│   ├── ab/
│   └── ...
└── temp/                 # In-progress downloads

# Index schema
CREATE TABLE chunks (
    hash        BLOB PRIMARY KEY,   -- BLAKE3 hash (32 bytes)
    inode       INTEGER NOT NULL,
    chunk_idx   INTEGER NOT NULL,
    share_id    TEXT NOT NULL,
    size        INTEGER NOT NULL,
    accessed_at INTEGER NOT NULL,
    created_at  INTEGER NOT NULL
);

CREATE INDEX idx_share ON chunks(share_id);
CREATE INDEX idx_access ON chunks(accessed_at);`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Cache Flow */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Cache Lookup Flow</h2>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`async fn read_chunk(inode: u64, offset: u64, size: u32) -> Result<Vec<u8>> {
    let chunk_idx = offset / CHUNK_SIZE as u64;

    // 1. Check L1 (RAM) cache
    if let Some(data) = self.l1_cache.get_chunk(inode, chunk_idx) {
        self.stats.l1_hit();
        return Ok(data.to_vec());
    }

    // 2. Check L2 (Disk) cache
    if let Some(data) = self.l2_cache.get_chunk(inode, chunk_idx).await? {
        self.stats.l2_hit();
        // Promote to L1
        self.l1_cache.insert_chunk(inode, chunk_idx, data.clone());
        return Ok(data);
    }

    // 3. Fetch from network
    self.stats.cache_miss();
    let data = self.connection.fetch_chunk(inode, offset, size).await?;

    // 4. Populate both caches
    self.l1_cache.insert_chunk(inode, chunk_idx, data.clone());
    self.l2_cache.insert_chunk(inode, chunk_idx, &data).await?;

    // 5. Prefetch next chunks (if enabled)
    if self.config.prefetch_enabled {
        self.prefetch_next_chunks(inode, chunk_idx + 1).await;
    }

    Ok(data)
}`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Prefetching */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Prefetching (Read-Ahead)</h2>
        <p className="text-zinc-300">
          When reading sequentially, Wormhole prefetches upcoming chunks in the background
          to hide network latency:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`// Governor-based prefetching
pub struct Governor {
    // Track read patterns per file
    patterns: HashMap<u64, ReadPattern>,

    // Prefetch queue
    queue: mpsc::Sender<PrefetchRequest>,
}

impl Governor {
    pub fn on_read(&mut self, inode: u64, offset: u64) {
        let pattern = self.patterns.entry(inode).or_default();

        // Detect sequential access
        if offset == pattern.last_offset + CHUNK_SIZE as u64 {
            pattern.sequential_count += 1;

            // Start prefetching after 2 sequential reads
            if pattern.sequential_count >= 2 {
                let lookahead = self.config.prefetch_lookahead; // default: 4
                for i in 1..=lookahead {
                    let prefetch_offset = offset + (i * CHUNK_SIZE as u64);
                    self.queue.send(PrefetchRequest {
                        inode,
                        offset: prefetch_offset,
                    }).ok();
                }
            }
        } else {
            // Random access, reset counter
            pattern.sequential_count = 0;
        }

        pattern.last_offset = offset;
    }
}`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Cache Invalidation */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Cache Invalidation</h2>
        <p className="text-zinc-300">
          The host sends notifications when files change. The client invalidates affected
          cache entries:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`// On receiving FileModified notification
async fn handle_file_modified(&mut self, inode: u64, new_size: u64) {
    // Invalidate all chunks for this file
    self.l1_cache.invalidate_inode(inode);
    self.l2_cache.invalidate_inode(inode).await?;

    // Update cached attributes
    if let Some(attr) = self.l1_cache.get_attr(inode) {
        let mut new_attr = attr.clone();
        new_attr.size = new_size;
        new_attr.mtime = SystemTime::now();
        self.l1_cache.insert_attr(inode, new_attr);
    }
}

// On directory change
async fn handle_dir_changed(&mut self, parent_inode: u64) {
    // Invalidate directory listing
    self.l1_cache.invalidate_dir(parent_inode);
    self.l2_cache.invalidate_dir(parent_inode).await?;
}`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Cache Modes */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Cache Modes</h2>
        <p className="text-zinc-300">
          Configure caching behavior when mounting:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Mode</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">L1</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">L2</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Use Case</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-violet-400">none</td>
                <td className="py-3 px-4 text-red-400">Off</td>
                <td className="py-3 px-4 text-red-400">Off</td>
                <td className="py-3 px-4">Always-fresh data, debugging</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-violet-400">ram</td>
                <td className="py-3 px-4 text-green-400">512MB</td>
                <td className="py-3 px-4 text-red-400">Off</td>
                <td className="py-3 px-4">Fast, no disk writes</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-violet-400">disk</td>
                <td className="py-3 px-4 text-red-400">Off</td>
                <td className="py-3 px-4 text-green-400">10GB</td>
                <td className="py-3 px-4">Low RAM, offline needed</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-violet-400">hybrid</td>
                <td className="py-3 px-4 text-green-400">512MB</td>
                <td className="py-3 px-4 text-green-400">10GB</td>
                <td className="py-3 px-4"><strong>Default</strong> - best of both</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-violet-400">aggressive</td>
                <td className="py-3 px-4 text-green-400">2GB</td>
                <td className="py-3 px-4 text-green-400">50GB</td>
                <td className="py-3 px-4">Maximum offline, lots of storage</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Card className="bg-zinc-900 border-zinc-800 mt-4">
          <CardContent className="p-4">
            <pre className="text-sm">
              <code className="text-zinc-300">{`# Use specific cache mode
wormhole mount WORM-XXXX --cache-mode hybrid

# Customize sizes
wormhole mount WORM-XXXX --ram-cache-mb 1024 --disk-cache-gb 50`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* LRU Eviction */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">LRU Eviction</h2>
        <p className="text-zinc-300">
          When caches reach capacity, the least recently used entries are evicted:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-xs overflow-x-auto">
              <code className="text-zinc-300">{`// L1 (RAM) - synchronous eviction
impl RamCache {
    fn insert_with_eviction(&mut self, key: CacheKey, data: Vec<u8>) {
        // LruCache handles eviction automatically when capacity exceeded
        self.chunks.put(key, Arc::new(data));
    }
}

// L2 (Disk) - background garbage collection
impl DiskCache {
    async fn gc_if_needed(&self) -> Result<()> {
        let current_size = self.get_total_size().await?;

        if current_size > self.max_size {
            let target = self.max_size * 90 / 100;  // Aim for 90% capacity
            let to_remove = current_size - target;

            // Delete oldest entries until we're under target
            let old_entries = self.db.query(
                "SELECT hash, size FROM chunks ORDER BY accessed_at ASC"
            ).await?;

            let mut removed = 0;
            for entry in old_entries {
                self.delete_chunk(&entry.hash).await?;
                removed += entry.size;
                if removed >= to_remove {
                    break;
                }
            }
        }
        Ok(())
    }
}`}</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* See Also */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">See Also</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/docs/cli/cache">
            <Badge variant="outline" className="border-zinc-700 hover:border-violet-500/50 cursor-pointer">
              wormhole cache
            </Badge>
          </Link>
          <Link href="/docs/performance/cache">
            <Badge variant="outline" className="border-zinc-700 hover:border-violet-500/50 cursor-pointer">
              Cache Performance
            </Badge>
          </Link>
          <Link href="/docs/configuration">
            <Badge variant="outline" className="border-zinc-700 hover:border-violet-500/50 cursor-pointer">
              Configuration
            </Badge>
          </Link>
        </div>
      </section>
    </div>
  );
}
