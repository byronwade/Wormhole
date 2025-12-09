import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Link from "next/link";
import {
  Cpu,
  HardDrive,
  Wifi,
  Monitor,
  Apple,
  Terminal,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
} from "lucide-react";

export const metadata = {
  title: "System Requirements - Wormhole Documentation",
  description: "Hardware and software requirements for running Wormhole on macOS, Linux, and Windows.",
};

export default function RequirementsPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/40">
          Getting Started
        </Badge>
        <h1 className="text-4xl font-bold text-white tracking-tight">
          System Requirements
        </h1>
        <p className="text-xl text-zinc-400">
          Hardware and software requirements for running Wormhole.
        </p>
      </div>

      {/* Minimum Requirements */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Minimum Requirements</h2>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-6 text-center">
              <Cpu className="w-8 h-8 text-violet-400 mx-auto mb-3" />
              <h3 className="font-semibold text-white mb-1">CPU</h3>
              <p className="text-sm text-zinc-400">x86_64 or ARM64</p>
              <p className="text-xs text-zinc-500 mt-1">2+ cores recommended</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-6 text-center">
              <Monitor className="w-8 h-8 text-violet-400 mx-auto mb-3" />
              <h3 className="font-semibold text-white mb-1">RAM</h3>
              <p className="text-sm text-zinc-400">512 MB minimum</p>
              <p className="text-xs text-zinc-500 mt-1">2+ GB for caching</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-6 text-center">
              <HardDrive className="w-8 h-8 text-violet-400 mx-auto mb-3" />
              <h3 className="font-semibold text-white mb-1">Storage</h3>
              <p className="text-sm text-zinc-400">100 MB for app</p>
              <p className="text-xs text-zinc-500 mt-1">10+ GB for cache</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-6 text-center">
              <Wifi className="w-8 h-8 text-violet-400 mx-auto mb-3" />
              <h3 className="font-semibold text-white mb-1">Network</h3>
              <p className="text-sm text-zinc-400">1 Mbps minimum</p>
              <p className="text-xs text-zinc-500 mt-1">100+ Mbps recommended</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Operating Systems */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Operating Systems</h2>

        <div className="space-y-4">
          {/* macOS */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-white">
                <Apple className="w-6 h-6" />
                macOS
                <Badge className="bg-green-500/20 text-green-400 border-green-500/40">Fully Supported</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-white mb-2">Minimum Version</h4>
                  <p className="text-sm text-zinc-400">macOS 10.13 High Sierra or later</p>
                </div>
                <div>
                  <h4 className="font-medium text-white mb-2">Recommended Version</h4>
                  <p className="text-sm text-zinc-400">macOS 12 Monterey or later</p>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-white mb-2">Architecture Support</h4>
                <div className="flex gap-2">
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400">Intel x86_64</Badge>
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400">Apple Silicon (M1/M2/M3)</Badge>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-white mb-2">Required Software</h4>
                <ul className="text-sm text-zinc-400 space-y-1">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <span><strong className="text-white">macFUSE 4.x+</strong> - Required for mounting</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-400" />
                    <span>System Extension approval may be required (one-time)</span>
                  </li>
                </ul>
              </div>

              <Alert className="bg-amber-500/10 border-amber-500/30">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <AlertTitle className="text-amber-400">Apple Silicon Note</AlertTitle>
                <AlertDescription className="text-zinc-400">
                  Apple Silicon Macs may require additional security approval for the macFUSE kernel extension. Go to System Preferences → Security & Privacy → General to approve.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Linux */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-white">
                <Terminal className="w-6 h-6" />
                Linux
                <Badge className="bg-green-500/20 text-green-400 border-green-500/40">Fully Supported</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-white mb-2">Minimum Kernel</h4>
                  <p className="text-sm text-zinc-400">Linux 4.18 or later</p>
                </div>
                <div>
                  <h4 className="font-medium text-white mb-2">Recommended</h4>
                  <p className="text-sm text-zinc-400">Linux 5.4+ (LTS or mainline)</p>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-white mb-2">Tested Distributions</h4>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400">Ubuntu 20.04+</Badge>
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400">Debian 11+</Badge>
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400">Fedora 35+</Badge>
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400">Arch Linux</Badge>
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400">RHEL/CentOS 8+</Badge>
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400">openSUSE 15.3+</Badge>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-white mb-2">Architecture Support</h4>
                <div className="flex gap-2">
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400">x86_64 (amd64)</Badge>
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400">ARM64 (aarch64)</Badge>
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400">ARMv7 (armhf)</Badge>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-white mb-2">Required Packages</h4>
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardContent className="p-0">
                    <pre className="p-4 text-sm overflow-x-auto">
                      <code className="text-zinc-300">
{`# Ubuntu/Debian
sudo apt install libfuse3-dev fuse3 pkg-config

# Fedora/RHEL
sudo dnf install fuse3 fuse3-devel

# Arch Linux
sudo pacman -S fuse3`}
                      </code>
                    </pre>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>

          {/* Windows */}
          <Card className="bg-zinc-900/50 border-zinc-800 opacity-75">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-white">
                <Monitor className="w-6 h-6" />
                Windows
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40">Coming Soon</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-white mb-2">Planned Support</h4>
                  <p className="text-sm text-zinc-400">Windows 10 (1809) or later</p>
                </div>
                <div>
                  <h4 className="font-medium text-white mb-2">Required Software</h4>
                  <p className="text-sm text-zinc-400">WinFSP 2.0+</p>
                </div>
              </div>

              <Alert className="bg-blue-500/10 border-blue-500/30">
                <Info className="h-4 w-4 text-blue-400" />
                <AlertTitle className="text-blue-400">Development Status</AlertTitle>
                <AlertDescription className="text-zinc-400">
                  Windows support is in active development. Track progress on <Link href="https://github.com/byronwade/wormhole/issues" className="text-violet-400 hover:underline">GitHub</Link>.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Network Requirements */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Network Requirements</h2>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-white mb-2">Protocol & Ports</h4>
                <ul className="text-sm text-zinc-400 space-y-1">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <span><strong className="text-white">UDP 4433</strong> - Default QUIC port for P2P connections</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <span><strong className="text-white">TCP 8080</strong> - Signal server WebSocket (outbound only)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <span><strong className="text-white">UDP 3478</strong> - STUN for NAT traversal (outbound only)</span>
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="font-medium text-white mb-2">Firewall Configuration</h4>
                <p className="text-sm text-zinc-400 mb-2">
                  Hosting requires UDP port 4433 (or custom) to be accessible. For NAT traversal:
                </p>
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardContent className="p-0">
                    <pre className="p-4 text-sm overflow-x-auto">
                      <code className="text-zinc-300">
{`# Linux (iptables)
sudo iptables -A INPUT -p udp --dport 4433 -j ACCEPT

# Linux (ufw)
sudo ufw allow 4433/udp

# macOS
# Use System Preferences → Security & Privacy → Firewall`}
                      </code>
                    </pre>
                  </CardContent>
                </Card>
              </div>

              <div>
                <h4 className="font-medium text-white mb-2">Bandwidth Recommendations</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left py-2 text-zinc-400">Use Case</th>
                        <th className="text-left py-2 text-zinc-400">Minimum</th>
                        <th className="text-left py-2 text-zinc-400">Recommended</th>
                      </tr>
                    </thead>
                    <tbody className="text-zinc-400">
                      <tr className="border-b border-zinc-800/50">
                        <td className="py-2">Document editing</td>
                        <td className="py-2">1 Mbps</td>
                        <td className="py-2">10 Mbps</td>
                      </tr>
                      <tr className="border-b border-zinc-800/50">
                        <td className="py-2">Code/development</td>
                        <td className="py-2">5 Mbps</td>
                        <td className="py-2">50 Mbps</td>
                      </tr>
                      <tr className="border-b border-zinc-800/50">
                        <td className="py-2">Media streaming</td>
                        <td className="py-2">25 Mbps</td>
                        <td className="py-2">100 Mbps</td>
                      </tr>
                      <tr>
                        <td className="py-2">Video editing (4K+)</td>
                        <td className="py-2">100 Mbps</td>
                        <td className="py-2 text-green-400">1 Gbps</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Resource Usage */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Resource Usage</h2>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-2 text-zinc-400">Metric</th>
                    <th className="text-left py-2 text-zinc-400">Idle</th>
                    <th className="text-left py-2 text-zinc-400">Active Transfer</th>
                    <th className="text-left py-2 text-zinc-400">Peak</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 text-white">RAM Usage</td>
                    <td className="py-2">~30 MB</td>
                    <td className="py-2">~150 MB</td>
                    <td className="py-2">512 MB (configurable cache)</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 text-white">CPU Usage</td>
                    <td className="py-2">&lt;1%</td>
                    <td className="py-2">5-15%</td>
                    <td className="py-2">25% (heavy encryption)</td>
                  </tr>
                  <tr className="border-b border-zinc-800/50">
                    <td className="py-2 text-white">Disk I/O</td>
                    <td className="py-2">None</td>
                    <td className="py-2">Cache writes</td>
                    <td className="py-2">Configurable (10 GB default cache)</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-white">Open Files</td>
                    <td className="py-2">~50</td>
                    <td className="py-2">~200</td>
                    <td className="py-2">~1000</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Compatibility Notes */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Compatibility Notes</h2>

        <div className="grid sm:grid-cols-2 gap-4">
          <Card className="bg-green-500/10 border-green-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-green-400 text-lg">
                <CheckCircle2 className="w-5 h-5" />
                Tested & Working
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-zinc-400 space-y-1">
                <li>Finder / Files integration</li>
                <li>VS Code / IDEs</li>
                <li>Video players (VLC, QuickTime)</li>
                <li>Adobe Creative Suite</li>
                <li>DaVinci Resolve</li>
                <li>Git repositories</li>
                <li>Docker bind mounts</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="bg-amber-500/10 border-amber-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-amber-400 text-lg">
                <AlertTriangle className="w-5 h-5" />
                Known Limitations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-zinc-400 space-y-1">
                <li>Spotlight indexing disabled by default</li>
                <li>Time Machine not supported</li>
                <li>Extended attributes limited</li>
                <li>File locking latency on WAN</li>
                <li>Some backup software may not recognize mounts</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
