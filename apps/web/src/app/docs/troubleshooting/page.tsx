import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Link from "next/link";
import {
  Wrench,
  Terminal,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowRight,
  Bug,
  Wifi,
  HardDrive,
  Gauge,
} from "lucide-react";

export const metadata = {
  title: "Troubleshooting - Wormhole Documentation",
  description: "Common issues and solutions for Wormhole. FUSE problems, network issues, and performance debugging.",
};

export default function TroubleshootingPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <Badge className="bg-wormhole-hunter/20 text-wormhole-hunter-light border-wormhole-hunter/40">
          Troubleshooting
        </Badge>
        <h1 className="text-4xl font-bold text-white tracking-tight">
          Troubleshooting Guide
        </h1>
        <p className="text-xl text-zinc-400">
          Common issues and solutions. Use the doctor command first for automatic diagnostics.
        </p>
      </div>

      {/* Doctor Command */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Start Here: Run Doctor</h2>
        <p className="text-zinc-400">
          The <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-wormhole-hunter-light">wormhole doctor</code> command automatically checks your system for common issues:
        </p>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`$ wormhole doctor

Wormhole System Diagnostics
============================

[✓] FUSE installed and working
[✓] Network connectivity OK
[✓] Signal server reachable (ws://signal.wormhole.app)
[✓] Cache directory writable (~/.cache/wormhole)
[✓] Sufficient disk space (45 GB free)
[!] macFUSE version 4.2.0 (4.4.0 available)
[✓] No conflicting mounts

Summary: All critical checks passed. 1 warning.

Tip: Update macFUSE for best performance:
  brew upgrade macfuse`}
              </code>
            </pre>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# Run full diagnostics (including slow tests)
$ wormhole doctor --full

# Attempt automatic fixes
$ wormhole doctor --fix`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Common Issues */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Common Issues</h2>

        <div className="space-y-4">
          {/* FUSE Issues */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-white">
                <HardDrive className="w-5 h-5 text-wormhole-hunter-light" />
                FUSE / Mount Issues
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-medium text-white">&quot;FUSE not found&quot; or &quot;fuse: failed to open /dev/fuse&quot;</h4>
                <p className="text-sm text-zinc-400">FUSE is not installed or not properly configured.</p>
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardContent className="p-0">
                    <pre className="p-3 text-xs overflow-x-auto">
                      <code className="text-zinc-300">
{`# macOS
brew install macfuse
# Then approve in System Preferences → Security & Privacy

# Linux (Ubuntu/Debian)
sudo apt install libfuse3-dev fuse3
sudo modprobe fuse

# Linux (Fedora)
sudo dnf install fuse3 fuse3-devel`}
                      </code>
                    </pre>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-white">&quot;Mount point is busy&quot; or &quot;Device or resource busy&quot;</h4>
                <p className="text-sm text-zinc-400">Previous mount wasn&apos;t cleaned up properly.</p>
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardContent className="p-0">
                    <pre className="p-3 text-xs overflow-x-auto">
                      <code className="text-zinc-300">
{`# Force unmount
wormhole unmount --force ~/mnt/wormhole

# Or with system tools
# macOS
diskutil unmount force ~/mnt/wormhole

# Linux
fusermount -uz ~/mnt/wormhole
# or
sudo umount -l ~/mnt/wormhole`}
                      </code>
                    </pre>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-white">macOS: &quot;System Extension Blocked&quot;</h4>
                <p className="text-sm text-zinc-400">macFUSE kernel extension needs approval.</p>
                <ol className="text-sm text-zinc-400 list-decimal list-inside space-y-1">
                  <li>Open System Preferences → Security & Privacy → General</li>
                  <li>Click &quot;Allow&quot; next to the message about macFUSE</li>
                  <li>Restart your Mac</li>
                  <li>Try mounting again</li>
                </ol>
              </div>
            </CardContent>
          </Card>

          {/* Connection Issues */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-white">
                <Wifi className="w-5 h-5 text-wormhole-hunter-light" />
                Connection Issues
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-medium text-white">&quot;Failed to connect to signal server&quot;</h4>
                <p className="text-sm text-zinc-400">Can&apos;t reach the signal server for peer discovery.</p>
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardContent className="p-0">
                    <pre className="p-3 text-xs overflow-x-auto">
                      <code className="text-zinc-300">
{`# Check if you can reach the signal server
curl -I https://signal.wormhole.app/health

# Try a different signal server
wormhole mount CODE ~/mnt --signal ws://your-signal-server:8080

# For LAN, skip signal server entirely
wormhole mount 192.168.1.42:4433 ~/mnt`}
                      </code>
                    </pre>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-white">&quot;Connection timed out&quot; or &quot;Peer not found&quot;</h4>
                <p className="text-sm text-zinc-400">Can&apos;t establish connection with the host.</p>
                <ul className="text-sm text-zinc-400 space-y-1 list-disc list-inside">
                  <li>Verify the join code is correct (case-sensitive)</li>
                  <li>Check that the host is still running</li>
                  <li>Ensure both machines have internet access</li>
                  <li>Check firewalls on both sides</li>
                </ul>
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardContent className="p-0">
                    <pre className="p-3 text-xs overflow-x-auto">
                      <code className="text-zinc-300">
{`# Test connectivity
wormhole ping WORM-XXXX-YYYY

# Check if host port is accessible (LAN)
nc -vz 192.168.1.42 4433

# Check firewall (Linux)
sudo iptables -L -n | grep 4433`}
                      </code>
                    </pre>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-white">&quot;NAT traversal failed&quot;</h4>
                <p className="text-sm text-zinc-400">STUN/TURN couldn&apos;t establish a direct connection.</p>
                <ul className="text-sm text-zinc-400 space-y-1 list-disc list-inside">
                  <li>Both peers may be behind symmetric NAT</li>
                  <li>Corporate firewalls may block UDP</li>
                  <li>Try a TURN relay server (coming soon)</li>
                  <li>For now, use VPN or port forwarding</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Performance Issues */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-white">
                <Gauge className="w-5 h-5 text-wormhole-hunter-light" />
                Performance Issues
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-medium text-white">Slow file access / high latency</h4>
                <p className="text-sm text-zinc-400">Files taking too long to open or read.</p>
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardContent className="p-0">
                    <pre className="p-3 text-xs overflow-x-auto">
                      <code className="text-zinc-300">
{`# Check cache hit rate
wormhole cache stats
# If hit rate is low, increase cache size:
wormhole mount CODE ~/mnt --ram-cache-mb 2048 --disk-cache-gb 50

# Enable prefetching for sequential workloads
wormhole mount CODE ~/mnt --prefetch --prefetch-lookahead 8

# Check network latency
wormhole ping CODE`}
                      </code>
                    </pre>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-white">Low throughput</h4>
                <p className="text-sm text-zinc-400">Not getting expected transfer speeds.</p>
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardContent className="p-0">
                    <pre className="p-3 text-xs overflow-x-auto">
                      <code className="text-zinc-300">
{`# Run benchmark to identify bottleneck
wormhole bench CODE

# Check if bandwidth is limited
wormhole status --detailed

# For video editing, use aggressive caching
wormhole mount CODE ~/mnt \\
    --cache-mode aggressive \\
    --ram-cache-mb 4096 \\
    --prefetch`}
                      </code>
                    </pre>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-white">High CPU usage</h4>
                <p className="text-sm text-zinc-400">Wormhole using too much CPU.</p>
                <ul className="text-sm text-zinc-400 space-y-1 list-disc list-inside">
                  <li>Reduce prefetch concurrency</li>
                  <li>Check for excessive small file access patterns</li>
                  <li>Increase attribute cache TTL</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Debug Mode */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Debug Mode</h2>
        <p className="text-zinc-400">
          Enable verbose logging to diagnose issues:
        </p>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# Verbose mode (increasing levels)
wormhole host ~/folder -v       # Info
wormhole host ~/folder -vv      # Debug
wormhole host ~/folder -vvv     # Trace

# Or with environment variable
RUST_LOG=debug wormhole host ~/folder
RUST_LOG=wormhole=trace,quinn=debug wormhole host ~/folder

# Log to file
wormhole host ~/folder -vv 2>&1 | tee wormhole.log

# Watch logs in real-time
tail -f ~/.cache/wormhole/wormhole.log`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Error Codes */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Common Error Codes</h2>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-2 text-zinc-400 font-medium">Code</th>
                    <th className="text-left py-2 text-zinc-400 font-medium">Meaning</th>
                    <th className="text-left py-2 text-zinc-400 font-medium">Solution</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-wormhole-hunter-light">ENOENT</td>
                    <td className="py-2">File not found</td>
                    <td className="py-2">Check if file exists on host</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-wormhole-hunter-light">EACCES</td>
                    <td className="py-2">Permission denied</td>
                    <td className="py-2">Check host file permissions</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-wormhole-hunter-light">EIO</td>
                    <td className="py-2">I/O error</td>
                    <td className="py-2">Network issue or host disconnected</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-wormhole-hunter-light">EBUSY</td>
                    <td className="py-2">Resource busy</td>
                    <td className="py-2">File locked or mount point in use</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 font-mono text-wormhole-hunter-light">ETIMEDOUT</td>
                    <td className="py-2">Connection timeout</td>
                    <td className="py-2">Network latency or host unreachable</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-mono text-wormhole-hunter-light">ECONNREFUSED</td>
                    <td className="py-2">Connection refused</td>
                    <td className="py-2">Host not running or wrong port</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Reset / Clean Slate */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Reset to Clean Slate</h2>
        <p className="text-zinc-400">
          If you&apos;re having persistent issues, try resetting Wormhole to its default state:
        </p>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-zinc-300">
{`# Clear all caches
wormhole cache clear --force

# Reset configuration to defaults
wormhole config reset --force

# Remove all data (nuclear option)
rm -rf ~/.cache/wormhole
rm -rf ~/.config/wormhole
# macOS: rm -rf ~/Library/Application\ Support/wormhole

# Reinstall
brew reinstall wormhole  # or your install method`}
              </code>
            </pre>
          </CardContent>
        </Card>

        <Alert className="bg-amber-500/10 border-amber-500/30">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <AlertTitle className="text-amber-400">This Deletes Your Settings</AlertTitle>
          <AlertDescription className="text-zinc-400">
            The reset commands will delete your configuration and cached data. Export your config first if you want to keep it.
          </AlertDescription>
        </Alert>
      </section>

      {/* Getting Help */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Getting More Help</h2>

        <div className="grid sm:grid-cols-2 gap-4">
          <Link href="/docs/troubleshooting/fuse">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-wormhole-hunter/50 transition-colors h-full">
              <CardContent className="p-6">
                <HardDrive className="w-6 h-6 text-wormhole-hunter-light mb-3" />
                <h3 className="font-semibold text-white mb-1">FUSE Troubleshooting</h3>
                <p className="text-sm text-zinc-400">Platform-specific FUSE issues and solutions</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/docs/troubleshooting/network">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-wormhole-hunter/50 transition-colors h-full">
              <CardContent className="p-6">
                <Wifi className="w-6 h-6 text-wormhole-hunter-light mb-3" />
                <h3 className="font-semibold text-white mb-1">Network Troubleshooting</h3>
                <p className="text-sm text-zinc-400">NAT, firewalls, and connectivity issues</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/docs/troubleshooting/performance">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-wormhole-hunter/50 transition-colors h-full">
              <CardContent className="p-6">
                <Gauge className="w-6 h-6 text-wormhole-hunter-light mb-3" />
                <h3 className="font-semibold text-white mb-1">Performance Issues</h3>
                <p className="text-sm text-zinc-400">Diagnose and fix slow transfers</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="https://github.com/byronwade/wormhole/issues">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-wormhole-hunter/50 transition-colors h-full">
              <CardContent className="p-6">
                <Bug className="w-6 h-6 text-wormhole-hunter-light mb-3" />
                <h3 className="font-semibold text-white mb-1">Report a Bug</h3>
                <p className="text-sm text-zinc-400">Open an issue on GitHub</p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </section>
    </div>
  );
}
