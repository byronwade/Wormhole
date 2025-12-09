import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Database, Trash2, HardDrive, RefreshCw, Download, Upload, CheckCircle } from "lucide-react";

export const metadata = {
  title: "wormhole cache - Wormhole CLI Reference",
  description: "Manage local file cache for offline access and performance.",
};

export default function CacheCommandPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/docs/cli" className="hover:text-white">CLI Reference</Link>
          <span>/</span>
          <span className="text-zinc-400">cache</span>
        </div>
        <h1 className="text-4xl font-bold text-white tracking-tight font-mono">
          wormhole cache
        </h1>
        <p className="text-xl text-zinc-400">
          Manage local file cache for offline access and improved performance.
        </p>
      </div>

      {/* Synopsis */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Synopsis</h2>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-sm">
              <code className="text-green-400">wormhole cache</code>
              <code className="text-zinc-400"> &lt;COMMAND&gt; [OPTIONS]</code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Description */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Description</h2>
        <p className="text-zinc-300">
          Wormhole uses a two-tier caching system to improve performance and enable offline access:
        </p>
        <ul className="list-disc list-inside text-zinc-300 space-y-2 ml-4">
          <li><strong>L1 (RAM cache)</strong> - Fast in-memory cache for recently accessed chunks</li>
          <li><strong>L2 (Disk cache)</strong> - Persistent cache stored in <code className="text-violet-400">~/.cache/wormhole</code></li>
        </ul>
        <p className="text-zinc-300 mt-4">
          The cache command provides tools to inspect, clear, resize, and manage this cache.
        </p>
      </section>

      {/* Subcommands */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Subcommands</h2>

        {/* stats */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Database className="h-5 w-5 text-violet-400" />
            cache stats
          </h3>
          <p className="text-zinc-300">Display cache statistics and usage information.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole cache stats [OPTIONS]

OPTIONS:
  --detailed      Breakdown by share
  --per-file      Per-file statistics`}</code>
              </pre>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-xs overflow-x-auto">
                <code className="text-zinc-300">{`$ wormhole cache stats
Cache Statistics
──────────────────────────────────────────────────────────────────
RAM Cache (L1):
  Size:         384 MB / 512 MB (75%)
  Entries:      3,072 chunks
  Hit rate:     94.2%
  Evictions:    1,247

Disk Cache (L2):
  Size:         4.2 GB / 10 GB (42%)
  Entries:      33,792 chunks
  Hit rate:     87.6%
  Location:     ~/.cache/wormhole

Active Shares:
  remote-work:  2.1 GB cached (847 files)
  projects:     1.8 GB cached (412 files)
  media:        312 MB cached (24 files)

Total cache hit rate: 92.3%
Cache saves: ~18.4 GB network transfer`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* clear */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-red-400" />
            cache clear
          </h3>
          <p className="text-zinc-300">Clear cached data to free up space.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole cache clear [OPTIONS]

OPTIONS:
  --ram-only              Clear only RAM cache (L1)
  --disk-only             Clear only disk cache (L2)
  --share <SHARE>         Clear cache for specific share only
  --older-than <DUR>      Clear entries older than duration (e.g., "7d", "24h")
  --force                 Skip confirmation prompt`}</code>
              </pre>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`# Clear all cache (with confirmation)
wormhole cache clear

# Clear only RAM cache
wormhole cache clear --ram-only

# Clear cache for specific share
wormhole cache clear --share remote-work

# Clear entries older than 7 days
wormhole cache clear --older-than 7d

# Clear without confirmation
wormhole cache clear --force`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* path */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-violet-400" />
            cache path
          </h3>
          <p className="text-zinc-300">Show the cache directory location.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`$ wormhole cache path
/Users/alice/.cache/wormhole

# Platform-specific defaults:
# macOS:   ~/Library/Caches/wormhole
# Linux:   ~/.cache/wormhole
# Windows: %LOCALAPPDATA%\\wormhole\\cache`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* resize */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-violet-400" />
            cache resize
          </h3>
          <p className="text-zinc-300">Change cache size limits.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole cache resize [OPTIONS]

OPTIONS:
  --ram-mb <MB>     Set RAM cache size in megabytes
  --disk-gb <GB>    Set disk cache size in gigabytes`}</code>
              </pre>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`# Increase RAM cache to 1GB
wormhole cache resize --ram-mb 1024

# Increase disk cache to 50GB
wormhole cache resize --disk-gb 50

# Set both at once
wormhole cache resize --ram-mb 2048 --disk-gb 100`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* warm */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Download className="h-5 w-5 text-green-400" />
            cache warm
          </h3>
          <p className="text-zinc-300">Pre-fetch files to cache for offline use.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole cache warm <SHARE> [OPTIONS]

OPTIONS:
  --path <PATTERN>        Path pattern to warm (e.g., "project/src/**")
  --max-size-mb <MB>      Maximum total size to cache
  --include <PATTERNS>    Include patterns (comma-separated)
  --exclude <PATTERNS>    Exclude patterns (comma-separated)`}</code>
              </pre>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`# Cache all files from a share (up to cache limit)
wormhole cache warm remote-work

# Cache specific directory
wormhole cache warm remote-work --path "documents/**"

# Cache with size limit
wormhole cache warm remote-work --max-size-mb 5000

# Cache only certain file types
wormhole cache warm remote-work --include "*.pdf,*.docx" --exclude "*.tmp"

# Prepare for offline flight
wormhole cache warm project-files --path "src/**" --max-size-mb 2000`}</code>
              </pre>
            </CardContent>
          </Card>
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <p className="text-blue-400 text-sm">
              <strong>Tip:</strong> Use cache warming before going offline. Warmed files
              remain accessible even when disconnected from the host.
            </p>
          </div>
        </div>

        {/* verify */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-400" />
            cache verify
          </h3>
          <p className="text-zinc-300">Verify cache integrity using BLAKE3 checksums.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole cache verify [OPTIONS]

OPTIONS:
  --fix         Automatically remove corrupted entries
  --verbose     Show each file being verified`}</code>
              </pre>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-xs overflow-x-auto">
                <code className="text-zinc-300">{`$ wormhole cache verify
Verifying cache integrity...
Checked: 33,792 chunks
Valid:   33,790 (99.99%)
Invalid: 2

Found 2 corrupted entries. Run with --fix to remove them.

$ wormhole cache verify --fix
Verifying cache integrity...
Removed 2 corrupted entries
Cache integrity verified: 33,790 valid chunks`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* gc */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-yellow-400" />
            cache gc
          </h3>
          <p className="text-zinc-300">Run garbage collection to reclaim space.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole cache gc [OPTIONS]

OPTIONS:
  --target-gb <GB>    Target size after GC
  --dry-run           Show what would be deleted without deleting`}</code>
              </pre>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`# Reduce cache to 5GB
wormhole cache gc --target-gb 5

# See what would be deleted
wormhole cache gc --target-gb 2 --dry-run`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* export */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Upload className="h-5 w-5 text-violet-400" />
            cache export
          </h3>
          <p className="text-zinc-300">Export cache to an archive for backup or transfer.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole cache export <OUTPUT> [OPTIONS]

OPTIONS:
  --share <SHARE>     Export only specific share's cache
  --compress          Compress the archive (zstd)`}</code>
              </pre>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`# Export all cache
wormhole cache export backup.tar

# Export compressed
wormhole cache export backup.tar.zst --compress

# Export specific share
wormhole cache export project-cache.tar --share project-files`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        {/* import */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Download className="h-5 w-5 text-violet-400" />
            cache import
          </h3>
          <p className="text-zinc-300">Import cache from an archive.</p>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`wormhole cache import <INPUT> [OPTIONS]

OPTIONS:
  --verify      Verify checksums after import`}</code>
              </pre>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <pre className="text-sm">
                <code className="text-zinc-300">{`# Import cache
wormhole cache import backup.tar

# Import and verify
wormhole cache import backup.tar --verify`}</code>
              </pre>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Cache Modes */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Cache Modes</h2>
        <p className="text-zinc-300">
          When mounting, you can specify the cache mode with <code className="text-violet-400">--cache-mode</code>:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Mode</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">L1 (RAM)</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">L2 (Disk)</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Use Case</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-violet-400">none</td>
                <td className="py-3 px-4 text-red-400">Off</td>
                <td className="py-3 px-4 text-red-400">Off</td>
                <td className="py-3 px-4">Always-fresh data, testing</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-violet-400">ram</td>
                <td className="py-3 px-4 text-green-400">On</td>
                <td className="py-3 px-4 text-red-400">Off</td>
                <td className="py-3 px-4">Fast access, no disk usage</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-violet-400">disk</td>
                <td className="py-3 px-4 text-red-400">Off</td>
                <td className="py-3 px-4 text-green-400">On</td>
                <td className="py-3 px-4">Offline access, low RAM</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-violet-400">hybrid</td>
                <td className="py-3 px-4 text-green-400">On</td>
                <td className="py-3 px-4 text-green-400">On</td>
                <td className="py-3 px-4"><strong>Default</strong> - best of both</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4 font-mono text-violet-400">aggressive</td>
                <td className="py-3 px-4 text-green-400">On (large)</td>
                <td className="py-3 px-4 text-green-400">On (large)</td>
                <td className="py-3 px-4">Maximum offline access</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* See Also */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">See Also</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/docs/cli/mount">
            <Badge variant="outline" className="border-zinc-700 hover:border-violet-500/50 cursor-pointer">
              wormhole mount
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
