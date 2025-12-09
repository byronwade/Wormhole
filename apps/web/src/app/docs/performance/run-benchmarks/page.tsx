import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Link from "next/link";
import {
  Terminal,
  Gauge,
  ArrowRight,
  Info,
  CheckCircle2,
  Download,
} from "lucide-react";

export const metadata = {
  title: "Run Your Own Benchmarks - Wormhole Documentation",
  description: "Run performance benchmarks on your own setup to verify Wormhole performance.",
};

export default function RunBenchmarksPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/docs/performance" className="hover:text-white">Performance</Link>
          <span>/</span>
          <span className="text-zinc-400">Run Benchmarks</span>
        </div>
        <h1 className="text-4xl font-bold text-white tracking-tight">
          Run Your Own Benchmarks
        </h1>
        <p className="text-xl text-zinc-400">
          Verify Wormhole performance on your specific hardware and network configuration.
        </p>
      </div>

      {/* Why Benchmark */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Why Run Your Own Benchmarks?</h2>
        <p className="text-zinc-400">
          Published benchmarks are run on specific hardware. Your results will vary based on:
        </p>
        <ul className="list-disc list-inside text-zinc-400 space-y-1">
          <li>Network speed and latency between peers</li>
          <li>Disk I/O speed (SSD vs HDD)</li>
          <li>Available RAM for caching</li>
          <li>CPU performance (especially for encryption)</li>
          <li>NAT/firewall configuration</li>
        </ul>
      </section>

      {/* Method 1: Built-in Benchmark */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Method 1: Built-in Benchmark Command</h2>
        <p className="text-zinc-400">
          Wormhole includes a built-in benchmark command that tests all aspects of performance.
        </p>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
              <span className="text-xs text-zinc-500 font-mono">Terminal</span>
            </div>
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# On the HOST machine, start sharing a folder
$ wormhole host ~/test-data --no-signal
Listening on 0.0.0.0:4433

# On the CLIENT machine, run benchmarks
$ wormhole bench 192.168.1.42:4433

Running benchmarks against 192.168.1.42:4433...

=== Connection ===
Connection time:      1.2s
PAKE authentication:  0.3s

=== Latency ===
Ping:                 1.4ms
First byte:           12.3ms
Metadata (getattr):   2.1ms

=== Read Performance ===
Sequential (1GB):     112.4 MB/s
Random (4KB):         43.2 MB/s
Parallel (4x):        287.1 MB/s

=== Metadata ===
readdir (1000):       23.4ms
stat (1000 files):    18.7ms

=== Cache Performance ===
L1 (RAM) hit:         0.02ms
L2 (disk) hit:        1.2ms
Cache miss:           12.3ms

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
                    <td className="py-2 font-mono text-violet-400">--test &lt;TYPE&gt;</td>
                    <td className="py-2">all, read, write, latency, metadata (default: all)</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-violet-400">--duration &lt;SECS&gt;</td>
                    <td className="py-2">Duration per test (default: 10)</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-violet-400">--parallel &lt;N&gt;</td>
                    <td className="py-2">Parallel streams (default: 4)</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-violet-400">--signal &lt;URL&gt;</td>
                    <td className="py-2">Signal server URL</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-mono text-violet-400">--format json</td>
                    <td className="py-2">Output as JSON for scripting</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Method 2: Benchmark Script */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Method 2: Benchmark Script</h2>
        <p className="text-zinc-400">
          For more detailed benchmarks, use the benchmark script from the repository:
        </p>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
              <span className="text-xs text-zinc-500 font-mono">Terminal</span>
            </div>
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# Download the benchmark script
curl -O https://raw.githubusercontent.com/byronwade/wormhole/main/scripts/benchmark.sh
chmod +x benchmark.sh

# Run benchmarks
./benchmark.sh --target 192.168.1.42:4433

# With options
./benchmark.sh --target WORM-XXXX-YYYY \\
    --duration 30 \\
    --output results.json \\
    --format json`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Method 3: DIY with Standard Tools */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Method 3: Standard Unix Tools</h2>
        <p className="text-zinc-400">
          Use familiar tools to verify performance independently:
        </p>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
              <span className="text-xs text-zinc-500 font-mono">Sequential Read with dd</span>
            </div>
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# Mount first
wormhole mount 192.168.1.42:4433 ~/mnt --cache-mode none

# Sequential read throughput
dd if=~/mnt/largefile.bin of=/dev/null bs=1M

# Expected output:
# 1024+0 records in
# 1024+0 records out
# 1073741824 bytes transferred in 9.312 secs (115 MB/sec)`}
              </code>
            </pre>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
              <span className="text-xs text-zinc-500 font-mono">Metadata Performance</span>
            </div>
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# Time a recursive file listing
time find ~/mnt -type f | wc -l
# real    0m0.182s  (for 10k files)

# Stat all files
time find ~/mnt -type f -exec stat {} \\; > /dev/null
# real    0m0.891s  (for 1k files)`}
              </code>
            </pre>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
              <span className="text-xs text-zinc-500 font-mono">Copy Speed Test</span>
            </div>
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# Time a file copy
time cp ~/mnt/video.mp4 /tmp/

# With progress (if pv is installed)
pv ~/mnt/video.mp4 > /tmp/video.mp4`}
              </code>
            </pre>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
              <span className="text-xs text-zinc-500 font-mono">Random Read with fio</span>
            </div>
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# Install fio: brew install fio (macOS) or apt install fio (Linux)

# Random 4K reads
fio --name=randread \\
    --ioengine=libaio \\
    --iodepth=16 \\
    --rw=randread \\
    --bs=4k \\
    --direct=1 \\
    --size=256M \\
    --filename=~/mnt/testfile \\
    --runtime=30`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Cache Performance */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Measuring Cache Effectiveness</h2>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# Check cache statistics
$ wormhole cache stats --detailed

Cache Statistics
================
RAM Cache (L1):
  Size: 487 MB / 512 MB
  Entries: 3,896 chunks
  Hit rate: 94.2%
  Avg hit time: 0.02ms

Disk Cache (L2):
  Size: 2.3 GB / 10.0 GB
  Entries: 18,432 chunks
  Hit rate: 5.7%
  Avg hit time: 1.2ms

Network fetches: 0.1%
Avg fetch time: 15.3ms`}
              </code>
            </pre>
          </CardContent>
        </Card>

        <Alert className="bg-blue-500/10 border-blue-500/30">
          <Info className="h-4 w-4 text-blue-400" />
          <AlertTitle className="text-blue-400">Cache Hit Rate</AlertTitle>
          <AlertDescription className="text-zinc-400">
            A good cache hit rate is above 90%. If you&apos;re seeing lower rates, consider increasing cache size with <code className="bg-zinc-800 px-1 rounded">--ram-cache-mb</code> and <code className="bg-zinc-800 px-1 rounded">--disk-cache-gb</code>.
          </AlertDescription>
        </Alert>
      </section>

      {/* Expected Results */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Expected Results</h2>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-3 text-zinc-400 font-medium">Metric</th>
                    <th className="text-left py-3 text-zinc-400 font-medium">LAN (1Gbps)</th>
                    <th className="text-left py-3 text-zinc-400 font-medium">WAN (100Mbps)</th>
                    <th className="text-left py-3 text-zinc-400 font-medium">Poor</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 text-white">Sequential read</td>
                    <td className="py-3 text-green-400">&gt;100 MB/s</td>
                    <td className="py-3 text-green-400">&gt;10 MB/s</td>
                    <td className="py-3 text-red-400">&lt;5 MB/s</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 text-white">Random read (4K)</td>
                    <td className="py-3 text-green-400">&gt;40 MB/s</td>
                    <td className="py-3 text-green-400">&gt;5 MB/s</td>
                    <td className="py-3 text-red-400">&lt;1 MB/s</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 text-white">First byte latency</td>
                    <td className="py-3 text-green-400">&lt;20ms</td>
                    <td className="py-3 text-green-400">&lt;100ms</td>
                    <td className="py-3 text-red-400">&gt;500ms</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-3 text-white">Metadata (ls)</td>
                    <td className="py-3 text-green-400">&lt;50ms</td>
                    <td className="py-3 text-green-400">&lt;200ms</td>
                    <td className="py-3 text-red-400">&gt;1s</td>
                  </tr>
                  <tr>
                    <td className="py-3 text-white">Cache hit rate</td>
                    <td className="py-3 text-green-400">&gt;90%</td>
                    <td className="py-3 text-green-400">&gt;90%</td>
                    <td className="py-3 text-red-400">&lt;50%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Troubleshooting Poor Results */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">If Results Are Poor</h2>
        <div className="space-y-4">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-6">
              <h3 className="font-semibold text-white mb-3">Check These First</h3>
              <ul className="text-sm text-zinc-400 space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-violet-400 mt-0.5" />
                  <span><strong className="text-white">Network:</strong> Run <code className="bg-zinc-800 px-1 rounded">iperf3</code> between machines to verify base network speed</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-violet-400 mt-0.5" />
                  <span><strong className="text-white">Latency:</strong> Run <code className="bg-zinc-800 px-1 rounded">wormhole ping TARGET</code> to check round-trip time</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-violet-400 mt-0.5" />
                  <span><strong className="text-white">Cache:</strong> Check hit rate with <code className="bg-zinc-800 px-1 rounded">wormhole cache stats</code></span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-violet-400 mt-0.5" />
                  <span><strong className="text-white">Disk:</strong> Verify disk cache is on SSD, not HDD</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Link href="/docs/performance/tuning" className="inline-flex items-center text-violet-400 hover:underline">
            See the Performance Tuning Guide
            <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>
      </section>

      {/* Share Your Results */}
      <section className="space-y-6 pt-8 border-t border-zinc-800">
        <h2 className="text-2xl font-bold text-white">Share Your Results</h2>
        <p className="text-zinc-400">
          Help improve Wormhole by sharing your benchmark results:
        </p>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# Generate a shareable benchmark report
wormhole bench TARGET --format json > benchmark-results.json

# Include system info
wormhole version --detailed >> benchmark-results.json

# Share on GitHub Discussions or Issues`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
