import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Link from "next/link";
import {
  Terminal,
  ArrowRight,
  Info,
  AlertTriangle,
  Database,
  Zap,
  HardDrive,
} from "lucide-react";

export const metadata = {
  title: "wormhole mount - CLI Reference",
  description: "Mount a remote folder locally using the wormhole mount command. Complete options and examples.",
};

export default function MountCommandPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/docs/cli" className="hover:text-white">CLI Reference</Link>
          <span>/</span>
          <span className="text-zinc-400">mount</span>
        </div>
        <h1 className="text-4xl font-bold text-white tracking-tight font-mono">
          wormhole mount
        </h1>
        <p className="text-xl text-zinc-400">
          Mount a remote folder locally via join code or direct IP address.
        </p>
      </div>

      {/* Synopsis */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Synopsis</h2>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <pre className="text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`wormhole mount <TARGET> [MOUNTPOINT] [OPTIONS]`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Description */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Description</h2>
        <p className="text-zinc-400">
          The <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-violet-400">mount</code> command connects to a remote Wormhole host and mounts the shared folder locally. You can connect using a join code (which uses the signal server for NAT traversal) or directly via IP address.
        </p>
        <p className="text-zinc-400">
          Once mounted, the remote folder appears as a local directory. All standard file operations work transparently - files are streamed on-demand without downloading the entire folder.
        </p>
      </section>

      {/* Arguments */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Arguments</h2>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-2 text-zinc-400 font-medium">Argument</th>
                    <th className="text-left py-2 text-zinc-400 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-violet-400">&lt;TARGET&gt;</td>
                    <td className="py-2">Join code (e.g., WORM-XXXX-YYYY) or IP:PORT (e.g., 192.168.1.42:4433)</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-mono text-violet-400">[MOUNTPOINT]</td>
                    <td className="py-2">Optional mount path. Default: ~/wormhole/&lt;share-name&gt;</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Connection Options */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Connection Options</h2>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-2 text-zinc-400 font-medium w-1/3">Option</th>
                    <th className="text-left py-2 text-zinc-400 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--signal &lt;URL&gt;</td>
                    <td className="py-3">
                      <p>Signal server URL for join code resolution.</p>
                      <p className="text-zinc-600 text-xs mt-1">Default: ws://localhost:8080</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--password &lt;PASS&gt;</td>
                    <td className="py-3">
                      <p>Password if the host requires one.</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--timeout &lt;SECS&gt;</td>
                    <td className="py-3">
                      <p>Connection timeout in seconds.</p>
                      <p className="text-zinc-600 text-xs mt-1">Default: 30</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--auto-reconnect</td>
                    <td className="py-3">
                      <p>Automatically reconnect on connection loss.</p>
                      <p className="text-zinc-600 text-xs mt-1">Default: true</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--max-reconnect &lt;N&gt;</td>
                    <td className="py-3">
                      <p>Maximum reconnection attempts. 0 for infinite.</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--reconnect-delay &lt;SECS&gt;</td>
                    <td className="py-3">
                      <p>Initial delay between reconnection attempts.</p>
                      <p className="text-zinc-600 text-xs mt-1">Default: 1 (with exponential backoff)</p>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 font-mono text-violet-400">--fallback-direct</td>
                    <td className="py-3">
                      <p>Fallback to direct IP if signal server fails.</p>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Cache Options */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Database className="w-6 h-6 text-violet-400" />
          Cache Options
        </h2>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-2 text-zinc-400 font-medium w-1/3">Option</th>
                    <th className="text-left py-2 text-zinc-400 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--cache-mode &lt;MODE&gt;</td>
                    <td className="py-3">
                      <p>Cache strategy: none, ram, disk, hybrid, aggressive.</p>
                      <p className="text-zinc-600 text-xs mt-1">Default: hybrid</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--ram-cache-mb &lt;MB&gt;</td>
                    <td className="py-3">
                      <p>RAM cache size in megabytes.</p>
                      <p className="text-zinc-600 text-xs mt-1">Default: 512</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--disk-cache-gb &lt;GB&gt;</td>
                    <td className="py-3">
                      <p>Disk cache size in gigabytes.</p>
                      <p className="text-zinc-600 text-xs mt-1">Default: 10</p>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 font-mono text-violet-400">--offline-mode</td>
                    <td className="py-3">
                      <p>Serve from cache when disconnected from host.</p>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="grid sm:grid-cols-2 gap-4">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <h4 className="font-medium text-white mb-2">Cache Modes</h4>
              <ul className="text-sm text-zinc-400 space-y-1">
                <li><code className="text-violet-400">none</code> - No caching, always fetch from host</li>
                <li><code className="text-violet-400">ram</code> - RAM only, cleared on unmount</li>
                <li><code className="text-violet-400">disk</code> - Disk only, persists across sessions</li>
                <li><code className="text-violet-400">hybrid</code> - RAM + disk (recommended)</li>
                <li><code className="text-violet-400">aggressive</code> - Cache everything for offline</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <h4 className="font-medium text-white mb-2">Cache Location</h4>
              <p className="text-sm text-zinc-400">
                Disk cache is stored at:
              </p>
              <ul className="text-sm text-zinc-400 space-y-1 mt-2">
                <li><code className="text-xs bg-zinc-800 px-1 rounded">~/.cache/wormhole/</code> (Linux)</li>
                <li><code className="text-xs bg-zinc-800 px-1 rounded">~/Library/Caches/wormhole/</code> (macOS)</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Performance Options */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Zap className="w-6 h-6 text-violet-400" />
          Performance Options
        </h2>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-2 text-zinc-400 font-medium w-1/3">Option</th>
                    <th className="text-left py-2 text-zinc-400 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--prefetch</td>
                    <td className="py-3">
                      <p>Enable prefetching for sequential reads.</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--prefetch-lookahead &lt;N&gt;</td>
                    <td className="py-3">
                      <p>Number of chunks to prefetch ahead.</p>
                      <p className="text-zinc-600 text-xs mt-1">Default: 4</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--bandwidth-limit &lt;MB/s&gt;</td>
                    <td className="py-3">
                      <p>Rate limit in MB/s. 0 for unlimited.</p>
                      <p className="text-zinc-600 text-xs mt-1">Default: 0</p>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 font-mono text-violet-400">--write-through</td>
                    <td className="py-3">
                      <p>Immediate sync mode for writes (higher latency, lower risk).</p>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* FUSE Options */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <HardDrive className="w-6 h-6 text-violet-400" />
          FUSE / Mount Options
        </h2>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-2 text-zinc-400 font-medium w-1/3">Option</th>
                    <th className="text-left py-2 text-zinc-400 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--read-only</td>
                    <td className="py-3">
                      <p>Mount in read-only mode (even if host allows writes).</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--use-kext</td>
                    <td className="py-3">
                      <p>Use kernel extension backend instead of FSKit (macOS).</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--fsname &lt;NAME&gt;</td>
                    <td className="py-3">
                      <p>Filesystem name shown in mount output.</p>
                      <p className="text-zinc-600 text-xs mt-1">Default: wormhole</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--attr-timeout &lt;SECS&gt;</td>
                    <td className="py-3">
                      <p>Attribute cache timeout.</p>
                      <p className="text-zinc-600 text-xs mt-1">Default: 1</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--entry-timeout &lt;SECS&gt;</td>
                    <td className="py-3">
                      <p>Entry (directory) cache timeout.</p>
                      <p className="text-zinc-600 text-xs mt-1">Default: 1</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--uid &lt;UID&gt;</td>
                    <td className="py-3">
                      <p>User ID for mounted files.</p>
                      <p className="text-zinc-600 text-xs mt-1">Default: current user</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--gid &lt;GID&gt;</td>
                    <td className="py-3">
                      <p>Group ID for mounted files.</p>
                      <p className="text-zinc-600 text-xs mt-1">Default: current group</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--umask &lt;MASK&gt;</td>
                    <td className="py-3">
                      <p>Permission mask for files.</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">--enable-xattr</td>
                    <td className="py-3">
                      <p>Enable extended attributes support.</p>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 font-mono text-violet-400">-o &lt;OPTIONS&gt;</td>
                    <td className="py-3">
                      <p>Additional FUSE mount options (passed through).</p>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 font-mono text-violet-400">--daemon</td>
                    <td className="py-3">
                      <p>Run in background as a daemon.</p>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Examples */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Examples</h2>

        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Basic Usage with Join Code</h3>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-0">
                <pre className="p-4 text-sm overflow-x-auto">
                  <code className="text-zinc-300">
{`# Mount using join code
$ wormhole mount WORM-7X9K-BETA ~/mnt/project

Connecting to signal server...
Found peer at 192.168.1.42:4433
Authenticating...

✓ Mounted at /Users/you/mnt/project

$ ls ~/mnt/project
README.md  src/  assets/  package.json`}
                  </code>
                </pre>
              </CardContent>
            </Card>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Direct IP Connection</h3>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-0">
                <pre className="p-4 text-sm overflow-x-auto">
                  <code className="text-zinc-300">
{`# Mount directly via IP (LAN)
$ wormhole mount 192.168.1.42:4433 ~/mnt/remote

✓ Mounted at /Users/you/mnt/remote`}
                  </code>
                </pre>
              </CardContent>
            </Card>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Optimized for Video Streaming</h3>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-0">
                <pre className="p-4 text-sm overflow-x-auto">
                  <code className="text-zinc-300">
{`# Large cache + aggressive prefetching for video editing
$ wormhole mount WORM-XXXX-YYYY ~/mnt/video \\
    --cache-mode aggressive \\
    --ram-cache-mb 2048 \\
    --disk-cache-gb 50 \\
    --prefetch \\
    --prefetch-lookahead 8`}
                  </code>
                </pre>
              </CardContent>
            </Card>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Offline-Ready Mount</h3>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-0">
                <pre className="p-4 text-sm overflow-x-auto">
                  <code className="text-zinc-300">
{`# Enable offline mode for intermittent connectivity
$ wormhole mount WORM-XXXX-YYYY ~/mnt/docs \\
    --cache-mode aggressive \\
    --offline-mode \\
    --auto-reconnect

# Files continue to work from cache when disconnected`}
                  </code>
                </pre>
              </CardContent>
            </Card>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Background Daemon with Password</h3>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-0">
                <pre className="p-4 text-sm overflow-x-auto">
                  <code className="text-zinc-300">
{`# Run as daemon with password
$ wormhole mount WORM-XXXX-YYYY ~/mnt/secure \\
    --password "secret123" \\
    --daemon

Mounted in background (PID: 12345)`}
                  </code>
                </pre>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Notes */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Notes</h2>
        <div className="space-y-4">
          <Alert className="bg-blue-500/10 border-blue-500/30">
            <Info className="h-4 w-4 text-blue-400" />
            <AlertTitle className="text-blue-400">Mount Point Creation</AlertTitle>
            <AlertDescription className="text-zinc-400">
              The mount point directory is created automatically if it doesn&apos;t exist. If not specified, mounts are created under <code className="bg-zinc-800 px-1 rounded">~/wormhole/</code>.
            </AlertDescription>
          </Alert>

          <Alert className="bg-amber-500/10 border-amber-500/30">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <AlertTitle className="text-amber-400">macOS System Extension</AlertTitle>
            <AlertDescription className="text-zinc-400">
              On macOS, you may need to approve the FUSE system extension in System Preferences → Security & Privacy the first time you mount. A reboot might be required.
            </AlertDescription>
          </Alert>
        </div>
      </section>

      {/* See Also */}
      <section className="space-y-4 pt-8 border-t border-zinc-800">
        <h2 className="text-2xl font-bold text-white">See Also</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/docs/cli/host" className="text-violet-400 hover:underline">wormhole host</Link>
          <span className="text-zinc-600">•</span>
          <Link href="/docs/cli/cache" className="text-violet-400 hover:underline">wormhole cache</Link>
          <span className="text-zinc-600">•</span>
          <Link href="/docs/performance" className="text-violet-400 hover:underline">Performance Tuning</Link>
          <span className="text-zinc-600">•</span>
          <Link href="/docs/troubleshooting/fuse" className="text-violet-400 hover:underline">FUSE Troubleshooting</Link>
        </div>
      </section>
    </div>
  );
}
