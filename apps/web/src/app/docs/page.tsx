import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Terminal,
  Download,
  Zap,
  Shield,
  Server,
  ArrowRight,
  BookOpen,
  Code2,
  Settings,
  Gauge,
  Network,
  Wrench,
} from "lucide-react";

export const metadata = {
  title: "Documentation - Wormhole",
  description: "Complete documentation for Wormhole - the peer-to-peer distributed filesystem. Learn how to host, mount, and configure shares.",
};

const quickLinks = [
  {
    title: "Quick Start",
    description: "Get up and running in 5 minutes",
    href: "/docs/quickstart",
    icon: Zap,
  },
  {
    title: "Installation",
    description: "Download and install Wormhole",
    href: "/docs/installation",
    icon: Download,
  },
  {
    title: "CLI Reference",
    description: "Complete command-line reference",
    href: "/docs/cli",
    icon: Terminal,
  },
  {
    title: "Architecture",
    description: "How Wormhole works under the hood",
    href: "/docs/architecture",
    icon: Network,
  },
  {
    title: "Security",
    description: "Encryption, authentication, and threat model",
    href: "/docs/security",
    icon: Shield,
  },
  {
    title: "Performance",
    description: "Benchmarks and tuning guide",
    href: "/docs/performance",
    icon: Gauge,
  },
];

export default function DocsPage() {
  return (
    <div className="space-y-12">
      {/* Hero */}
      <div className="space-y-4">
        <Badge className="bg-wormhole-hunter/20 text-wormhole-hunter-light border-wormhole-hunter/40">
          Documentation
        </Badge>
        <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
          Wormhole Documentation
        </h1>
        <p className="text-xl text-zinc-400 max-w-2xl">
          Everything you need to know about Wormhole - from basic setup to advanced configuration, security, and self-hosting.
        </p>
      </div>

      {/* Quick Terminal Demo */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-0">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
            <div className="w-3 h-3 rounded-full bg-red-500/50" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
            <div className="w-3 h-3 rounded-full bg-green-500/50" />
            <span className="ml-3 text-xs text-zinc-500 font-mono">Terminal</span>
          </div>
          <div className="p-6 font-mono text-sm space-y-4">
            <div>
              <div className="flex items-start gap-2">
                <span className="text-zinc-500">$</span>
                <span className="text-white">wormhole host ~/Projects/my-folder</span>
              </div>
              <div className="text-zinc-400 ml-4 mt-1">
                <div>Scanning... <span className="text-green-400">12.4 GB</span> in 847 files</div>
                <div>Join code: <span className="text-wormhole-hunter-light font-bold">WORM-7X9K-BETA</span></div>
              </div>
            </div>
            <div className="border-t border-zinc-800 pt-4">
              <div className="flex items-start gap-2">
                <span className="text-zinc-500">$</span>
                <span className="text-white">wormhole mount WORM-7X9K-BETA ~/mnt/remote</span>
              </div>
              <div className="text-green-400 ml-4 mt-1">
                Mounted at /Users/you/mnt/remote
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Links Grid */}
      <div>
        <h2 className="text-2xl font-bold text-white mb-6">Explore the Docs</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link key={link.href} href={link.href}>
                <Card className="bg-zinc-900/50 border-zinc-800 hover:border-wormhole-hunter/50 transition-colors h-full">
                  <CardContent className="p-6">
                    <Icon className="w-8 h-8 text-wormhole-hunter-light mb-4" />
                    <h3 className="text-lg font-semibold text-white mb-2">{link.title}</h3>
                    <p className="text-sm text-zinc-400">{link.description}</p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* What is Wormhole */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-white">What is Wormhole?</h2>
        <div className="prose prose-invert max-w-none">
          <p className="text-zinc-400 text-lg leading-relaxed">
            <strong className="text-white">Wormhole</strong> is a peer-to-peer (P2P) distributed filesystem that mounts remote directories locally via QUIC transport. Think of it as &quot;AirDrop meets network drive&quot; - you share a folder with a simple code, and others can mount it as if it were a local drive.
          </p>

          <div className="grid md:grid-cols-2 gap-6 mt-8">
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-lg text-white">Key Features</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <Zap className="w-4 h-4 text-wormhole-hunter-light mt-0.5" />
                  <div>
                    <span className="text-white font-medium">Instant Access</span>
                    <p className="text-zinc-500">Access 50GB folders in seconds, not hours</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Shield className="w-4 h-4 text-wormhole-hunter-light mt-0.5" />
                  <div>
                    <span className="text-white font-medium">E2E Encrypted</span>
                    <p className="text-zinc-500">TLS 1.3 + SPAKE2 authentication</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Server className="w-4 h-4 text-wormhole-hunter-light mt-0.5" />
                  <div>
                    <span className="text-white font-medium">No Cloud</span>
                    <p className="text-zinc-500">Files never touch third-party servers</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-lg text-white">Use Cases</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <ArrowRight className="w-4 h-4 text-wormhole-hunter-light mt-0.5" />
                  <span className="text-zinc-400">Video editors accessing render farm outputs</span>
                </div>
                <div className="flex items-start gap-2">
                  <ArrowRight className="w-4 h-4 text-wormhole-hunter-light mt-0.5" />
                  <span className="text-zinc-400">Game dev teams sharing build artifacts</span>
                </div>
                <div className="flex items-start gap-2">
                  <ArrowRight className="w-4 h-4 text-wormhole-hunter-light mt-0.5" />
                  <span className="text-zinc-400">VFX studios collaborating on projects</span>
                </div>
                <div className="flex items-start gap-2">
                  <ArrowRight className="w-4 h-4 text-wormhole-hunter-light mt-0.5" />
                  <span className="text-zinc-400">ML engineers sharing model weights</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* How it Differs */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-white">How Wormhole Differs</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Feature</th>
                <th className="text-left py-3 px-4 text-wormhole-hunter-light font-medium">Wormhole</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Cloud Storage</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Syncthing</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4">Share 50GB folder</td>
                <td className="py-3 px-4 text-green-400">~10 seconds</td>
                <td className="py-3 px-4">2-4 hours upload</td>
                <td className="py-3 px-4">30-60 min sync</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4">Mounts as native drive</td>
                <td className="py-3 px-4 text-green-400">Yes</td>
                <td className="py-3 px-4">No</td>
                <td className="py-3 px-4">No</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4">Files on third-party servers</td>
                <td className="py-3 px-4 text-green-400">Never</td>
                <td className="py-3 px-4">Always</td>
                <td className="py-3 px-4">Never</td>
              </tr>
              <tr className="border-b border-zinc-800/50">
                <td className="py-3 px-4">Simple join codes</td>
                <td className="py-3 px-4 text-green-400">Yes</td>
                <td className="py-3 px-4">No (links/accounts)</td>
                <td className="py-3 px-4">No (device IDs)</td>
              </tr>
              <tr>
                <td className="py-3 px-4">E2E encrypted</td>
                <td className="py-3 px-4 text-green-400">Yes (TLS 1.3)</td>
                <td className="py-3 px-4">Varies</td>
                <td className="py-3 px-4">Yes</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Next Steps */}
      <div className="flex flex-col sm:flex-row gap-4 pt-8 border-t border-zinc-800">
        <Button asChild size="lg" className="bg-wormhole-hunter hover:bg-wormhole-hunter-dark">
          <Link href="/docs/quickstart">
            Get Started
            <ArrowRight className="w-4 h-4 ml-2" />
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
          <Link href="/docs/installation">
            <Download className="w-4 h-4 mr-2" />
            Installation Guide
          </Link>
        </Button>
      </div>
    </div>
  );
}
