"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowRight,
  Download,
  Zap,
  Shield,
  Globe,
  HardDrive,
  Check,
  X,
  Apple,
  Monitor,
  Terminal,
  Share2,
  Github,
  Twitter,
  AlertTriangle,
  Gauge,
  Server,
  Wifi,
  Lock,
  CircleDollarSign,
  Upload,
  Timer,
  Database,
} from "lucide-react";
import { useEffect, useState } from "react";

type Platform = "mac" | "windows" | "linux" | "unknown";

interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
  assets: {
    name: string;
    browser_download_url: string;
    size: number;
  }[];
}

const GITHUB_OWNER = "byronwade";
const GITHUB_REPO = "wormhole";

function detectPlatform(): Platform {
  if (typeof window === "undefined") return "unknown";
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("mac")) return "mac";
  if (userAgent.includes("win")) return "windows";
  if (userAgent.includes("linux")) return "linux";
  return "unknown";
}

function PlatformIcon({ platform }: { platform: Platform }) {
  switch (platform) {
    case "mac":
      return <Apple className="w-5 h-5" />;
    case "windows":
      return <Monitor className="w-5 h-5" />;
    case "linux":
      return <Terminal className="w-5 h-5" />;
    default:
      return <Download className="w-5 h-5" />;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function getAssetForPlatform(assets: GitHubRelease["assets"], platform: Platform): GitHubRelease["assets"][0] | null {
  const patterns: Record<Platform, string[]> = {
    mac: ["darwin", "macos", "osx", ".dmg", "apple"],
    windows: ["windows", "win64", "win32", ".exe", ".msi"],
    linux: ["linux", ".deb", ".rpm", ".AppImage", ".tar.gz"],
    unknown: [],
  };

  const platformPatterns = patterns[platform];
  for (const asset of assets) {
    const name = asset.name.toLowerCase();
    if (platformPatterns.some(p => name.includes(p.toLowerCase()))) {
      return asset;
    }
  }
  return null;
}

export default function Home() {
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [mounted, setMounted] = useState(false);
  const [release, setRelease] = useState<GitHubRelease | null>(null);

  useEffect(() => {
    setMounted(true);
    setPlatform(detectPlatform());

    fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`)
      .then(res => res.ok ? res.json() : null)
      .then(data => setRelease(data))
      .catch(() => {});
  }, []);

  const platformLabels: Record<Platform, string> = {
    mac: "Download for macOS",
    windows: "Download for Windows",
    linux: "Download for Linux",
    unknown: "Download",
  };

  const getDownloadUrl = (targetPlatform: Platform): string => {
    if (release?.assets) {
      const asset = getAssetForPlatform(release.assets, targetPlatform);
      if (asset) return asset.browser_download_url;
    }
    return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
  };

  const getPlatformAssetInfo = (targetPlatform: Platform) => {
    if (release?.assets) {
      const asset = getAssetForPlatform(release.assets, targetPlatform);
      if (asset) return { size: formatBytes(asset.size), name: asset.name };
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Navigation */}
      <nav className="border-b border-white/10 sticky top-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
              <Share2 className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg text-white">Wormhole</span>
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 text-xs font-medium">
              ALPHA
            </Badge>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#compare" className="text-sm text-zinc-400 hover:text-white transition-colors">Compare</a>
            <a href="#how-it-works" className="text-sm text-zinc-400 hover:text-white transition-colors">How it Works</a>
            <a href="#download" className="text-sm text-zinc-400 hover:text-white transition-colors">Download</a>
            <a href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-white transition-colors">
              <Github className="w-5 h-5" />
            </a>
          </div>
          <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white" asChild>
            <a href="#download">
              <Download className="w-4 h-4 mr-2" />
              Download
            </a>
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-20 pb-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          {/* Alpha Notice */}
          <div className="inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-sm text-amber-400 font-medium">Alpha Release</span>
            <span className="text-sm text-zinc-500">•</span>
            <span className="text-sm text-zinc-400">Free while in development</span>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 tracking-tight">
            Mount Any Folder.<br />
            <span className="text-violet-400">Any Computer. Instantly.</span>
          </h1>

          <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Access a 50GB folder in under 10 seconds. No uploads, no cloud storage, no waiting.
            Files stream directly from one computer to another.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            {mounted && (
              <Button size="lg" className="bg-violet-600 hover:bg-violet-700 text-white px-8" asChild>
                <a href={getDownloadUrl(platform)}>
                  <PlatformIcon platform={platform} />
                  <span className="ml-2">{platformLabels[platform]}</span>
                  {release && <span className="ml-2 text-violet-300 text-sm">{release.tag_name}</span>}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </a>
              </Button>
            )}
            <Button variant="outline" size="lg" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white" asChild>
              <a href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`} target="_blank" rel="noopener noreferrer">
                <Github className="w-5 h-5 mr-2" />
                View Source
              </a>
            </Button>
          </div>

          {/* Terminal Demo */}
          <div className="max-w-3xl mx-auto">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
                <div className="w-3 h-3 rounded-full bg-zinc-700" />
                <div className="w-3 h-3 rounded-full bg-zinc-700" />
                <div className="w-3 h-3 rounded-full bg-zinc-700" />
                <span className="ml-3 text-xs text-zinc-500 font-mono">Terminal</span>
              </div>
              <div className="p-6 font-mono text-sm">
                <div className="flex items-start gap-2 mb-3">
                  <span className="text-zinc-500">$</span>
                  <span className="text-white">wormhole host ~/Projects/video-project</span>
                </div>
                <div className="pl-4 space-y-1 text-zinc-400">
                  <div>Scanning folder... <span className="text-green-400">47.3 GB</span> in 1,247 files</div>
                  <div>Starting QUIC server on port 4433...</div>
                  <div className="mt-3 p-3 rounded bg-zinc-800 border border-zinc-700">
                    <div className="text-white">Join Code: <span className="text-violet-400 font-bold">WORM-7X9K-BETA</span></div>
                    <div className="text-xs text-zinc-500 mt-1">Anyone with this code can mount your folder</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Big Difference - Architecture */}
      <section className="py-24 px-6 border-t border-zinc-800">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-zinc-800 text-zinc-400 border-zinc-700">
              The Architecture Difference
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Why Wormhole is Fundamentally Different
            </h2>
            <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
              Every other solution copies your files somewhere. We don&apos;t.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-16">
            {/* Traditional Architecture */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                    <Upload className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Traditional Cloud Storage</h3>
                    <p className="text-sm text-zinc-500">Dropbox, Google Drive, WeTransfer</p>
                  </div>
                </div>
                <div className="space-y-4 mb-6">
                  <div className="flex items-center gap-3 p-3 rounded bg-zinc-800/50">
                    <Server className="w-5 h-5 text-zinc-500" />
                    <span className="text-sm text-zinc-400">Your files → Their servers → Recipient</span>
                  </div>
                </div>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-2 text-zinc-400">
                    <X className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                    Files copied to third-party servers
                  </li>
                  <li className="flex items-start gap-2 text-zinc-400">
                    <X className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                    Upload time = file size / your upload speed
                  </li>
                  <li className="flex items-start gap-2 text-zinc-400">
                    <X className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                    Storage limits and monthly fees
                  </li>
                  <li className="flex items-start gap-2 text-zinc-400">
                    <X className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                    Recipient must download entire file
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Wormhole Architecture */}
            <Card className="bg-zinc-900 border-violet-500/30">
              <CardContent className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
                    <Wifi className="w-5 h-5 text-violet-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Wormhole P2P Mount</h3>
                    <p className="text-sm text-violet-400">Direct connection, no middleman</p>
                  </div>
                </div>
                <div className="space-y-4 mb-6">
                  <div className="flex items-center gap-3 p-3 rounded bg-violet-500/10 border border-violet-500/20">
                    <Wifi className="w-5 h-5 text-violet-400" />
                    <span className="text-sm text-violet-300">Your computer ↔ Their computer (direct)</span>
                  </div>
                </div>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-2 text-zinc-400">
                    <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    Files never leave your machine
                  </li>
                  <li className="flex items-start gap-2 text-zinc-400">
                    <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    Connection ready in seconds, any file size
                  </li>
                  <li className="flex items-start gap-2 text-zinc-400">
                    <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    No storage needed - stream on demand
                  </li>
                  <li className="flex items-start gap-2 text-zinc-400">
                    <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    Access any file without downloading all
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Key Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-6 rounded-lg bg-zinc-900 border border-zinc-800 text-center">
              <div className="text-3xl font-bold text-violet-400 mb-1">&lt;10s</div>
              <div className="text-sm text-zinc-500">Time to access 50GB</div>
            </div>
            <div className="p-6 rounded-lg bg-zinc-900 border border-zinc-800 text-center">
              <div className="text-3xl font-bold text-violet-400 mb-1">0 GB</div>
              <div className="text-sm text-zinc-500">Cloud storage used</div>
            </div>
            <div className="p-6 rounded-lg bg-zinc-900 border border-zinc-800 text-center">
              <div className="text-3xl font-bold text-violet-400 mb-1">$0</div>
              <div className="text-sm text-zinc-500">Monthly cost (alpha)</div>
            </div>
            <div className="p-6 rounded-lg bg-zinc-900 border border-zinc-800 text-center">
              <div className="text-3xl font-bold text-violet-400 mb-1">100%</div>
              <div className="text-sm text-zinc-500">Files stay on your machine</div>
            </div>
          </div>
        </div>
      </section>

      {/* Competitor Comparison Table */}
      <section id="compare" className="py-24 px-6 border-t border-zinc-800 bg-zinc-900/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-zinc-800 text-zinc-400 border-zinc-700">
              Head-to-Head Comparison
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              How Wormhole Stacks Up
            </h2>
            <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
              Compare with the tools you&apos;re probably using today.
            </p>
          </div>

          {/* Comparison Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="py-4 px-4 text-sm font-medium text-zinc-400">Feature</th>
                  <th className="py-4 px-4 text-sm font-medium text-violet-400 bg-violet-500/5">
                    <div className="flex items-center gap-2">
                      <Share2 className="w-4 h-4" />
                      Wormhole
                    </div>
                  </th>
                  <th className="py-4 px-4 text-sm font-medium text-zinc-400">Dropbox</th>
                  <th className="py-4 px-4 text-sm font-medium text-zinc-400">Google Drive</th>
                  <th className="py-4 px-4 text-sm font-medium text-zinc-400">WeTransfer</th>
                  <th className="py-4 px-4 text-sm font-medium text-zinc-400">Resilio Sync</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                <tr className="border-b border-zinc-800/50">
                  <td className="py-4 px-4 text-zinc-300">
                    <div className="flex items-center gap-2">
                      <Timer className="w-4 h-4 text-zinc-500" />
                      Share 50GB folder
                    </div>
                  </td>
                  <td className="py-4 px-4 bg-violet-500/5">
                    <span className="text-green-400 font-medium">~10 seconds</span>
                  </td>
                  <td className="py-4 px-4 text-zinc-400">2-4 hours upload</td>
                  <td className="py-4 px-4 text-zinc-400">2-4 hours upload</td>
                  <td className="py-4 px-4 text-zinc-400">2GB limit</td>
                  <td className="py-4 px-4 text-zinc-400">30-60 min sync</td>
                </tr>
                <tr className="border-b border-zinc-800/50">
                  <td className="py-4 px-4 text-zinc-300">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-zinc-500" />
                      Cloud storage needed
                    </div>
                  </td>
                  <td className="py-4 px-4 bg-violet-500/5">
                    <span className="text-green-400 font-medium">None</span>
                  </td>
                  <td className="py-4 px-4 text-zinc-400">Full file size</td>
                  <td className="py-4 px-4 text-zinc-400">Full file size</td>
                  <td className="py-4 px-4 text-zinc-400">Full file size</td>
                  <td className="py-4 px-4 text-zinc-400">None</td>
                </tr>
                <tr className="border-b border-zinc-800/50">
                  <td className="py-4 px-4 text-zinc-300">
                    <div className="flex items-center gap-2">
                      <Server className="w-4 h-4 text-zinc-500" />
                      Files on third-party servers
                    </div>
                  </td>
                  <td className="py-4 px-4 bg-violet-500/5">
                    <span className="text-green-400 font-medium">Never</span>
                  </td>
                  <td className="py-4 px-4 text-zinc-400">Yes</td>
                  <td className="py-4 px-4 text-zinc-400">Yes</td>
                  <td className="py-4 px-4 text-zinc-400">Yes</td>
                  <td className="py-4 px-4 text-zinc-400">Never</td>
                </tr>
                <tr className="border-b border-zinc-800/50">
                  <td className="py-4 px-4 text-zinc-300">
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-zinc-500" />
                      Mounts as native drive
                    </div>
                  </td>
                  <td className="py-4 px-4 bg-violet-500/5">
                    <Check className="w-5 h-5 text-green-400" />
                  </td>
                  <td className="py-4 px-4"><X className="w-5 h-5 text-zinc-600" /></td>
                  <td className="py-4 px-4"><X className="w-5 h-5 text-zinc-600" /></td>
                  <td className="py-4 px-4"><X className="w-5 h-5 text-zinc-600" /></td>
                  <td className="py-4 px-4"><X className="w-5 h-5 text-zinc-600" /></td>
                </tr>
                <tr className="border-b border-zinc-800/50">
                  <td className="py-4 px-4 text-zinc-300">
                    <div className="flex items-center gap-2">
                      <CircleDollarSign className="w-4 h-4 text-zinc-500" />
                      Cost for 100GB
                    </div>
                  </td>
                  <td className="py-4 px-4 bg-violet-500/5">
                    <span className="text-green-400 font-medium">$0 (alpha)</span>
                  </td>
                  <td className="py-4 px-4 text-zinc-400">$12/month</td>
                  <td className="py-4 px-4 text-zinc-400">$3/month</td>
                  <td className="py-4 px-4 text-zinc-400">$12/month</td>
                  <td className="py-4 px-4 text-zinc-400">$60/year</td>
                </tr>
                <tr className="border-b border-zinc-800/50">
                  <td className="py-4 px-4 text-zinc-300">
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-zinc-500" />
                      E2E encryption
                    </div>
                  </td>
                  <td className="py-4 px-4 bg-violet-500/5">
                    <Check className="w-5 h-5 text-green-400" />
                  </td>
                  <td className="py-4 px-4"><X className="w-5 h-5 text-zinc-600" /></td>
                  <td className="py-4 px-4"><X className="w-5 h-5 text-zinc-600" /></td>
                  <td className="py-4 px-4"><X className="w-5 h-5 text-zinc-600" /></td>
                  <td className="py-4 px-4"><Check className="w-5 h-5 text-green-400" /></td>
                </tr>
                <tr className="border-b border-zinc-800/50">
                  <td className="py-4 px-4 text-zinc-300">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-zinc-500" />
                      Works through NAT/firewall
                    </div>
                  </td>
                  <td className="py-4 px-4 bg-violet-500/5">
                    <Check className="w-5 h-5 text-green-400" />
                  </td>
                  <td className="py-4 px-4"><Check className="w-5 h-5 text-green-400" /></td>
                  <td className="py-4 px-4"><Check className="w-5 h-5 text-green-400" /></td>
                  <td className="py-4 px-4"><Check className="w-5 h-5 text-green-400" /></td>
                  <td className="py-4 px-4"><Check className="w-5 h-5 text-green-400" /></td>
                </tr>
                <tr>
                  <td className="py-4 px-4 text-zinc-300">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-zinc-500" />
                      Stream without full download
                    </div>
                  </td>
                  <td className="py-4 px-4 bg-violet-500/5">
                    <Check className="w-5 h-5 text-green-400" />
                  </td>
                  <td className="py-4 px-4"><X className="w-5 h-5 text-zinc-600" /></td>
                  <td className="py-4 px-4 text-zinc-500">Partial</td>
                  <td className="py-4 px-4"><X className="w-5 h-5 text-zinc-600" /></td>
                  <td className="py-4 px-4"><X className="w-5 h-5 text-zinc-600" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Technical Performance */}
      <section className="py-24 px-6 border-t border-zinc-800">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-zinc-800 text-zinc-400 border-zinc-700">
              Under the Hood
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Built for Performance
            </h2>
            <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
              Modern protocols and architecture designed for large file workflows.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-6">
                <Gauge className="w-8 h-8 text-violet-400 mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">QUIC Protocol</h3>
                <p className="text-sm text-zinc-400 mb-4">
                  Same protocol as HTTP/3. Multiplexed streams, 0-RTT connection resumption, built-in encryption.
                </p>
                <div className="text-xs text-zinc-500 font-mono bg-zinc-800 rounded px-3 py-2">
                  Latency: ~50ms connection setup
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-6">
                <Database className="w-8 h-8 text-violet-400 mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Smart Caching</h3>
                <p className="text-sm text-zinc-400 mb-4">
                  128KB chunked transfers with LRU disk cache. Files you access often stay local.
                </p>
                <div className="text-xs text-zinc-500 font-mono bg-zinc-800 rounded px-3 py-2">
                  Cache location: ~/.cache/wormhole
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-6">
                <Shield className="w-8 h-8 text-violet-400 mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">PAKE Authentication</h3>
                <p className="text-sm text-zinc-400 mb-4">
                  Password-authenticated key exchange. Join codes generate session keys without server involvement.
                </p>
                <div className="text-xs text-zinc-500 font-mono bg-zinc-800 rounded px-3 py-2">
                  Algorithm: SPAKE2 + AES-256-GCM
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Architecture diagram replacement - simple text */}
          <div className="mt-12 p-8 rounded-lg bg-zinc-900 border border-zinc-800">
            <h4 className="text-lg font-semibold text-white mb-6 text-center">Data Flow</h4>
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8 text-sm font-mono">
              <div className="px-4 py-3 rounded bg-zinc-800 text-zinc-300">
                Your App<br/>
                <span className="text-xs text-zinc-500">(Finder, Premiere, etc)</span>
              </div>
              <ArrowRight className="w-5 h-5 text-zinc-600 rotate-90 md:rotate-0" />
              <div className="px-4 py-3 rounded bg-zinc-800 text-zinc-300">
                FUSE Mount<br/>
                <span className="text-xs text-zinc-500">/Volumes/wormhole</span>
              </div>
              <ArrowRight className="w-5 h-5 text-zinc-600 rotate-90 md:rotate-0" />
              <div className="px-4 py-3 rounded bg-violet-500/20 border border-violet-500/30 text-violet-300">
                QUIC Tunnel<br/>
                <span className="text-xs text-violet-400">encrypted P2P</span>
              </div>
              <ArrowRight className="w-5 h-5 text-zinc-600 rotate-90 md:rotate-0" />
              <div className="px-4 py-3 rounded bg-zinc-800 text-zinc-300">
                Host Machine<br/>
                <span className="text-xs text-zinc-500">actual files</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 px-6 border-t border-zinc-800 bg-zinc-900/30">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-zinc-800 text-zinc-400 border-zinc-700">
              Quick Start
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Three Commands to Share
            </h2>
          </div>

          <div className="space-y-8">
            {[
              {
                step: "1",
                title: "Host your folder",
                description: "Run wormhole host on any folder. Server starts instantly.",
                code: "$ wormhole host ~/Projects/video-edit",
                output: "Join Code: WORM-7X9K-BETA"
              },
              {
                step: "2",
                title: "Share the code",
                description: "Send the join code to your collaborator - text, slack, email.",
                code: "# Just copy and share",
                output: "WORM-7X9K-BETA"
              },
              {
                step: "3",
                title: "Mount and work",
                description: "They mount your folder as a local drive. Access any file instantly.",
                code: "$ wormhole mount WORM-7X9K-BETA",
                output: "Mounted at /Volumes/wormhole"
              },
            ].map((item, i) => (
              <div key={i} className="flex gap-6 items-start">
                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-violet-600 flex items-center justify-center">
                  <span className="text-xl font-bold text-white">{item.step}</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-white mb-2">{item.title}</h3>
                  <p className="text-zinc-400 mb-4">{item.description}</p>
                  <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4 font-mono text-sm">
                    <div className="text-zinc-300">{item.code}</div>
                    <div className="text-green-400 mt-2">{item.output}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Download Section */}
      <section id="download" className="py-24 px-6 border-t border-zinc-800">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-sm text-amber-400 font-medium">Alpha Release</span>
          </div>

          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Download Wormhole
          </h2>
          <p className="text-lg text-zinc-400 mb-4">
            Free while in alpha. Pro tiers with team features coming later.
          </p>

          {release && (
            <p className="text-sm text-zinc-500 mb-8">
              Version <span className="text-violet-400 font-mono">{release.tag_name}</span>
              {" • "}
              <a href={release.html_url} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline">
                Release notes
              </a>
            </p>
          )}

          <div className="grid sm:grid-cols-3 gap-4 max-w-xl mx-auto mb-8">
            <Button
              variant="outline"
              size="lg"
              className={`h-auto py-6 flex-col gap-2 ${platform === 'mac' ? 'border-violet-500 bg-violet-500/10 text-white' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'}`}
              asChild
            >
              <a href={getDownloadUrl("mac")}>
                <Apple className="w-8 h-8" />
                <span className="font-medium">macOS</span>
                <span className="text-xs text-zinc-500">
                  {getPlatformAssetInfo("mac")?.size || "Intel & ARM"}
                </span>
              </a>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className={`h-auto py-6 flex-col gap-2 ${platform === 'windows' ? 'border-violet-500 bg-violet-500/10 text-white' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'}`}
              asChild
            >
              <a href={getDownloadUrl("windows")}>
                <Monitor className="w-8 h-8" />
                <span className="font-medium">Windows</span>
                <span className="text-xs text-zinc-500">
                  {getPlatformAssetInfo("windows")?.size || "Windows 10+"}
                </span>
              </a>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className={`h-auto py-6 flex-col gap-2 ${platform === 'linux' ? 'border-violet-500 bg-violet-500/10 text-white' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'}`}
              asChild
            >
              <a href={getDownloadUrl("linux")}>
                <Terminal className="w-8 h-8" />
                <span className="font-medium">Linux</span>
                <span className="text-xs text-zinc-500">
                  {getPlatformAssetInfo("linux")?.size || "x64 & ARM"}
                </span>
              </a>
            </Button>
          </div>

          <div className="flex items-center justify-center gap-4 text-sm text-zinc-500">
            <a href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-white transition-colors">
              <Github className="w-4 h-4" />
              All releases on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
                <Share2 className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-white">Wormhole</span>
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 text-xs">
                ALPHA
              </Badge>
            </div>

            <div className="flex items-center gap-6 text-sm text-zinc-500">
              <a href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}#readme`} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Docs</a>
              <a href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
              <a href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues`} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Issues</a>
              <a href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Releases</a>
            </div>

            <div className="flex items-center gap-4">
              <a href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-white transition-colors">
                <Github className="w-5 h-5" />
              </a>
              <a href="https://twitter.com/wormholeapp" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-white transition-colors">
                <Twitter className="w-5 h-5" />
              </a>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-zinc-800 text-center text-sm text-zinc-600">
            <p>Open source under MIT License. Free during alpha.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
