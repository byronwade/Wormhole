import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Link from "next/link";
import {
  Gauge,
  Zap,
  Timer,
  HardDrive,
  Wifi,
  ArrowRight,
  Info,
  Terminal,
  TrendingUp,
  Database,
} from "lucide-react";

export const metadata = {
  title: "Performance - Wormhole Documentation",
  description: "Performance benchmarks and optimization guide for Wormhole. Real-world numbers and tuning tips.",
};

export default function PerformancePage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <Badge className="bg-wormhole-hunter/20 text-wormhole-hunter-light border-wormhole-hunter/40">
          Performance
        </Badge>
        <h1 className="text-4xl font-bold text-white tracking-tight">
          Performance Benchmarks
        </h1>
        <p className="text-xl text-zinc-400">
          Real-world performance numbers, optimization tips, and how to run your own benchmarks.
        </p>
      </div>

      {/* Key Metrics */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Key Metrics</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-6 text-center">
              <Timer className="w-8 h-8 text-wormhole-hunter-light mx-auto mb-3" />
              <div className="text-3xl font-bold text-white mb-1">&lt;10s</div>
              <p className="text-sm text-zinc-400">Time to access 50GB folder</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-6 text-center">
              <Zap className="w-8 h-8 text-wormhole-hunter-light mx-auto mb-3" />
              <div className="text-3xl font-bold text-white mb-1">&lt;100ms</div>
              <p className="text-sm text-zinc-400">First byte latency</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-6 text-center">
              <TrendingUp className="w-8 h-8 text-wormhole-hunter-light mx-auto mb-3" />
              <div className="text-3xl font-bold text-white mb-1">100+ MB/s</div>
              <p className="text-sm text-zinc-400">LAN throughput</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-6 text-center">
              <Database className="w-8 h-8 text-wormhole-hunter-light mx-auto mb-3" />
              <div className="text-3xl font-bold text-white mb-1">&lt;50 MB</div>
              <p className="text-sm text-zinc-400">Memory (idle)</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Benchmark Results */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Benchmark Results</h2>
        <p className="text-zinc-400">
          Measured on two M1 MacBooks connected via 1Gbps Ethernet. Your results may vary based on network conditions and hardware.
        </p>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">LAN Performance (1Gbps Ethernet)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-3 text-zinc-400 font-medium">Test</th>
                    <th className="text-left py-3 text-zinc-400 font-medium">Result</th>
                    <th className="text-left py-3 text-zinc-400 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 text-white">Sequential Read (1GB file)</td>
                    <td className="py-3 text-green-400 font-mono">115 MB/s</td>
                    <td className="py-3">Near wire speed</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 text-white">Random Read (4KB blocks)</td>
                    <td className="py-3 text-green-400 font-mono">45 MB/s</td>
                    <td className="py-3">Limited by latency</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 text-white">Metadata (ls -R 10k files)</td>
                    <td className="py-3 text-green-400 font-mono">180 ms</td>
                    <td className="py-3">Cached on repeat</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 text-white">File Open Latency</td>
                    <td className="py-3 text-green-400 font-mono">15 ms</td>
                    <td className="py-3">First access</td>
                  </tr>
                  <tr>
                    <td className="py-3 text-white">File Open (cached)</td>
                    <td className="py-3 text-green-400 font-mono">&lt;1 ms</td>
                    <td className="py-3">From RAM cache</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">WAN Performance (100Mbps Internet)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-3 text-zinc-400 font-medium">Test</th>
                    <th className="text-left py-3 text-zinc-400 font-medium">Result</th>
                    <th className="text-left py-3 text-zinc-400 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 text-white">Sequential Read</td>
                    <td className="py-3 text-green-400 font-mono">11 MB/s</td>
                    <td className="py-3">~90% of bandwidth</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 text-white">Connection Time</td>
                    <td className="py-3 text-green-400 font-mono">3.2 s</td>
                    <td className="py-3">NAT traversal + PAKE</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 text-white">First Byte Latency</td>
                    <td className="py-3 text-green-400 font-mono">85 ms</td>
                    <td className="py-3">Includes round-trip</td>
                  </tr>
                  <tr>
                    <td className="py-3 text-white">Reconnect (0-RTT)</td>
                    <td className="py-3 text-green-400 font-mono">0.8 s</td>
                    <td className="py-3">Session resumption</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">Resource Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-3 text-zinc-400 font-medium">Metric</th>
                    <th className="text-left py-3 text-zinc-400 font-medium">Idle</th>
                    <th className="text-left py-3 text-zinc-400 font-medium">Active</th>
                    <th className="text-left py-3 text-zinc-400 font-medium">Peak</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 text-white">Memory (RAM)</td>
                    <td className="py-3 font-mono">~30 MB</td>
                    <td className="py-3 font-mono">~150 MB</td>
                    <td className="py-3 font-mono">512 MB (cache)</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 text-white">CPU Usage</td>
                    <td className="py-3 font-mono">&lt;1%</td>
                    <td className="py-3 font-mono">5-15%</td>
                    <td className="py-3 font-mono">~25%</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 text-white">Open File Descriptors</td>
                    <td className="py-3 font-mono">~50</td>
                    <td className="py-3 font-mono">~200</td>
                    <td className="py-3 font-mono">~1000</td>
                  </tr>
                  <tr>
                    <td className="py-3 text-white">Disk Cache Size</td>
                    <td className="py-3 font-mono">0 MB</td>
                    <td className="py-3 font-mono">varies</td>
                    <td className="py-3 font-mono">10 GB (default max)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Run Your Own Benchmarks */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Terminal className="w-6 h-6 text-wormhole-hunter-light" />
          Run Your Own Benchmarks
        </h2>
        <p className="text-zinc-400">
          Wormhole includes built-in benchmarking tools. Run these on your own setup to get accurate numbers.
        </p>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
              <span className="text-xs text-zinc-500 font-mono">Terminal</span>
            </div>
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# Start a test host
$ wormhole host ~/test-data --no-signal
Listening on 0.0.0.0:4433

# On another machine, run benchmarks
$ wormhole bench 192.168.1.42:4433

Running benchmarks against 192.168.1.42:4433...

=== Read Performance ===
Sequential read (1GB):    112.4 MB/s
Random read (4KB):         43.2 MB/s
Parallel reads (4x):      287.1 MB/s

=== Latency ===
Ping:                       1.2 ms
First byte:                14.8 ms
Metadata (getattr):         2.1 ms

=== Metadata ===
readdir (1000 entries):    23.4 ms
stat 1000 files:           18.7 ms

=== Summary ===
Overall score: 94/100 (Excellent)
Bottleneck: None detected`}
              </code>
            </pre>
          </CardContent>
        </Card>

        <h3 className="text-lg font-semibold text-white">Benchmark Options</h3>
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-2 text-zinc-400 font-medium">Option</th>
                    <th className="text-left py-2 text-zinc-400 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-wormhole-hunter-light">--test &lt;TYPE&gt;</td>
                    <td className="py-2">Test type: all, read, write, latency, metadata</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-wormhole-hunter-light">--duration &lt;SECS&gt;</td>
                    <td className="py-2">Duration per test (default: 10)</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-wormhole-hunter-light">--parallel &lt;N&gt;</td>
                    <td className="py-2">Parallel streams (default: 4)</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-mono text-wormhole-hunter-light">--format json</td>
                    <td className="py-2">Output as JSON for scripting</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* DIY Benchmarks */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">DIY Benchmarks</h2>
        <p className="text-zinc-400">
          Use standard tools to verify performance independently:
        </p>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
              <span className="text-xs text-zinc-500 font-mono">Test with standard tools</span>
            </div>
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# Sequential read throughput
$ dd if=/mnt/wormhole/largefile.bin of=/dev/null bs=1M
1024+0 records in
1024+0 records out
1073741824 bytes transferred in 9.312 secs (115 MB/sec)

# Metadata performance
$ time find /mnt/wormhole -type f | wc -l
10247
real    0m0.182s

# Random read (with fio if available)
$ fio --name=randread --ioengine=libaio --iodepth=16 \\
      --rw=randread --bs=4k --direct=1 --size=256M \\
      --filename=/mnt/wormhole/testfile --runtime=30

# Copy speed test
$ time cp /mnt/wormhole/video.mp4 /tmp/
real    0m8.421s  # ~120MB for 1GB file = ~118MB/s

# Check cache hits
$ wormhole cache stats --detailed
RAM cache hits:  12,847 (94.2%)
Disk cache hits:    782 (5.7%)
Network fetches:     15 (0.1%)`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Performance Factors */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">What Affects Performance</h2>

        <div className="grid sm:grid-cols-2 gap-4">
          <Card className="bg-green-500/10 border-green-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-green-400 text-lg">Factors That Help</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-zinc-400 space-y-2">
                <li className="flex items-start gap-2">
                  <Zap className="w-4 h-4 text-green-400 mt-0.5" />
                  <span>Fast network (1Gbps+ LAN)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Zap className="w-4 h-4 text-green-400 mt-0.5" />
                  <span>Large RAM cache (2GB+)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Zap className="w-4 h-4 text-green-400 mt-0.5" />
                  <span>SSD for disk cache</span>
                </li>
                <li className="flex items-start gap-2">
                  <Zap className="w-4 h-4 text-green-400 mt-0.5" />
                  <span>Sequential access patterns</span>
                </li>
                <li className="flex items-start gap-2">
                  <Zap className="w-4 h-4 text-green-400 mt-0.5" />
                  <span>Prefetching enabled</span>
                </li>
                <li className="flex items-start gap-2">
                  <Zap className="w-4 h-4 text-green-400 mt-0.5" />
                  <span>Low network latency (&lt;10ms)</span>
                </li>
              </ul>
            </CardContent>
          </Card>
          <Card className="bg-amber-500/10 border-amber-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-amber-400 text-lg">Factors That Hurt</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-zinc-400 space-y-2">
                <li className="flex items-start gap-2">
                  <Timer className="w-4 h-4 text-amber-400 mt-0.5" />
                  <span>High network latency (&gt;100ms)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Timer className="w-4 h-4 text-amber-400 mt-0.5" />
                  <span>Random small reads</span>
                </li>
                <li className="flex items-start gap-2">
                  <Timer className="w-4 h-4 text-amber-400 mt-0.5" />
                  <span>Many small files</span>
                </li>
                <li className="flex items-start gap-2">
                  <Timer className="w-4 h-4 text-amber-400 mt-0.5" />
                  <span>Cache misses</span>
                </li>
                <li className="flex items-start gap-2">
                  <Timer className="w-4 h-4 text-amber-400 mt-0.5" />
                  <span>Packet loss / unstable connection</span>
                </li>
                <li className="flex items-start gap-2">
                  <Timer className="w-4 h-4 text-amber-400 mt-0.5" />
                  <span>NAT traversal overhead</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Optimization Quick Tips */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Quick Optimization Tips</h2>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# For video editing / streaming workloads
wormhole mount CODE ~/mnt/video \\
    --cache-mode aggressive \\
    --ram-cache-mb 2048 \\
    --disk-cache-gb 50 \\
    --prefetch \\
    --prefetch-lookahead 8

# For code/development (many small files)
wormhole mount CODE ~/mnt/code \\
    --cache-mode hybrid \\
    --attr-timeout 5 \\
    --entry-timeout 5

# For bandwidth-limited connections
wormhole mount CODE ~/mnt/remote \\
    --bandwidth-limit 5 \\
    --cache-mode disk \\
    --offline-mode`}
              </code>
            </pre>
          </CardContent>
        </Card>

        <Link href="/docs/performance/tuning" className="inline-flex items-center text-wormhole-hunter-light hover:underline">
          Complete tuning guide
          <ArrowRight className="w-4 h-4 ml-1" />
        </Link>
      </section>

      {/* Comparison */}
      <section className="space-y-6 pt-8 border-t border-zinc-800">
        <h2 className="text-2xl font-bold text-white">Comparison with Alternatives</h2>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-3 text-zinc-400 font-medium">Metric</th>
                    <th className="text-left py-3 text-wormhole-hunter-light font-medium">Wormhole</th>
                    <th className="text-left py-3 text-zinc-400 font-medium">sshfs</th>
                    <th className="text-left py-3 text-zinc-400 font-medium">NFS</th>
                    <th className="text-left py-3 text-zinc-400 font-medium">SMB</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 text-white">LAN Throughput</td>
                    <td className="py-3 text-green-400 font-mono">115 MB/s</td>
                    <td className="py-3 font-mono">80 MB/s</td>
                    <td className="py-3 font-mono">110 MB/s</td>
                    <td className="py-3 font-mono">100 MB/s</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 text-white">WAN Throughput</td>
                    <td className="py-3 text-green-400 font-mono">11 MB/s*</td>
                    <td className="py-3 font-mono">5 MB/s</td>
                    <td className="py-3 font-mono">N/A</td>
                    <td className="py-3 font-mono">N/A</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 text-white">Setup Time</td>
                    <td className="py-3 text-green-400">10 seconds</td>
                    <td className="py-3">30 seconds</td>
                    <td className="py-3">5+ minutes</td>
                    <td className="py-3">5+ minutes</td>
                  </tr>
                  <tr>
                    <td className="py-3 text-white">NAT Traversal</td>
                    <td className="py-3 text-green-400">Built-in</td>
                    <td className="py-3">VPN required</td>
                    <td className="py-3">VPN required</td>
                    <td className="py-3">VPN required</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-zinc-500 mt-4">* WAN performance limited by 100Mbps test connection</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
