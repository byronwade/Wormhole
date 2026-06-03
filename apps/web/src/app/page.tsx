"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
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
  Video,
  Gamepad2,
  Film,
  Code2,
  Users,
  DollarSign,
  FolderOpen,
  ChevronDown,
  MessageSquare,
  Sparkles,
  Heart,
  BookOpen,
  Menu,
  ExternalLink,
} from "lucide-react";
import { useEffect, useState, Suspense } from "react";
import dynamic from "next/dynamic";

// Dynamically import the 3D scene to avoid SSR issues
const WormholeScene = dynamic(
  () => import("@/components/three/WormholeScene"),
  { ssr: false }
);

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

// AGENTS.md: Icon-only buttons have descriptive aria-label, decorative icons are aria-hidden
function PlatformIcon({ platform }: { platform: Platform }) {
  switch (platform) {
    case "mac":
      return <Apple className="w-5 h-5" aria-hidden="true" />;
    case "windows":
      return <Monitor className="w-5 h-5" aria-hidden="true" />;
    case "linux":
      return <Terminal className="w-5 h-5" aria-hidden="true" />;
    default:
      return <Download className="w-5 h-5" aria-hidden="true" />;
  }
}

// AGENTS.md: Tabular numbers for comparisons
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0\u00A0B"; // Non-breaking space
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + "\u00A0" + sizes[i];
}

function getAssetForPlatform(assets: GitHubRelease["assets"], platform: Platform): GitHubRelease["assets"][0] | null {
  const patterns: Record<Platform, string[][]> = {
    mac: [
      [".dmg"],
      ["macos", "darwin", "aarch64", "arm64"].filter(() => true),
    ],
    windows: [
      ["-setup.exe", ".msi"],
      [".exe"],
    ],
    linux: [
      [".appimage"],
      [".deb"],
      [".rpm"],
    ],
    unknown: [],
  };

  const platformPatternGroups = patterns[platform];

  for (const patternGroup of platformPatternGroups) {
    for (const asset of assets) {
      const name = asset.name.toLowerCase();
      if (patternGroup.some(p => name.includes(p.toLowerCase()))) {
        return asset;
      }
    }
  }
  return null;
}

export default function Home() {
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [mounted, setMounted] = useState(false);
  const [release, setRelease] = useState<GitHubRelease | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

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

  const getPlatformAssetInfo = (targetPlatform: Platform) => {
    if (release?.assets) {
      const asset = getAssetForPlatform(release.assets, targetPlatform);
      if (asset) return { size: formatBytes(asset.size), name: asset.name };
    }
    return null;
  };

  const getPlatformDownloadUrl = (targetPlatform: Platform) => {
    switch (targetPlatform) {
      case "mac": return "/download/macos";
      case "windows": return "/download/windows";
      case "linux": return "/download/linux";
      default: return "#download";
    }
  };

  const faqs = [
    {
      q: "How is this different from Dropbox or Google Drive?",
      a: "Cloud storage uploads your files to third-party servers, which takes time and costs money. Wormhole creates a direct peer-to-peer connection - your files never leave your machine. A 50GB folder is accessible in seconds, not hours."
    },
    {
      q: "What happens when the host computer goes offline?",
      a: "Mounted files become unavailable (like unplugging a USB drive). Wormhole uses smart caching - files you've accessed recently stay available locally. For offline support, we recommend keeping critical files synced."
    },
    {
      q: "Is my data secure?",
      a: "Yes. All connections use end-to-end encryption (TLS 1.3 via QUIC). Join codes use PAKE (SPAKE2) so the session key is never transmitted. The signaling server only facilitates connections - it never sees your files or content."
    },
    {
      q: "Why do I need to install FUSE/macFUSE/WinFSP?",
      a: "FUSE (Filesystem in Userspace) is what allows Wormhole to mount remote files as a native drive. This means you can use Finder, Explorer, or any app - they see a normal folder. The FUSE drivers are open source and trusted by millions."
    },
    {
      q: "Will Wormhole always be free?",
      a: "The core product will always have a free tier. We're planning Pro ($8/mo) and Team ($15/mo) tiers with features like persistent sessions, team management, and priority support. During alpha, everything is free."
    },
    {
      q: "Can I edit files or just read them?",
      a: "Currently read-only in alpha. Bidirectional sync with write support is planned for Phase 7. For now, you can read, copy, and stream files directly."
    },
  ];

  return (
    <div className="min-h-screen bg-wormhole-off-black">
      {/* Navigation - Beautiful Modern Header */}
      <nav className="fixed top-0 left-0 right-0 z-50" aria-label="Main navigation">
        {/* Blur background */}
        <div className="absolute inset-0 bg-wormhole-off-black/70 backdrop-blur-xl border-b border-border/5" />

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 group" aria-label="Wormhole Home">
              <div className="relative">
                <div className="absolute inset-0 bg-wormhole-hunter/50 rounded-xl blur-lg group-hover:bg-wormhole-hunter/70 transition-colors" />
                <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-wormhole-hunter-light to-wormhole-hunter flex items-center justify-center shadow-lg shadow-wormhole-hunter/20" aria-hidden="true">
                  <Share2 className="w-4.5 h-4.5 text-foreground" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-foreground">Wormhole</span>
                <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px] font-semibold px-1.5 py-0">
                  ALPHA
                </Badge>
              </div>
            </Link>

            {/* Center Navigation */}
            <div className="hidden lg:flex items-center">
              <div className="flex items-center gap-1 px-2 py-1.5 rounded-full bg-background/5 border border-border/5">
                <a href="#use-cases" className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-background/5 rounded-full transition-all">
                  Use Cases
                </a>
                <a href="#compare" className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-background/5 rounded-full transition-all">
                  Compare
                </a>
                <a href="#how-it-works" className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-background/5 rounded-full transition-all">
                  How it Works
                </a>
                <Link href="/docs" className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-background/5 rounded-full transition-all flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                  Docs
                </Link>
                <a href="#faq" className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-background/5 rounded-full transition-all">
                  FAQ
                </a>
              </div>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-3">
              {/* Support/Sponsor Button */}
              <a
                href="https://github.com/sponsors/byronwade"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-sm text-pink-400 hover:text-pink-300 bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/20 rounded-full transition-all"
                aria-label="Sponsor on GitHub"
              >
                <Heart className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Sponsor</span>
              </a>

              {/* GitHub */}
              <a
                href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:flex w-9 h-9 items-center justify-center rounded-full bg-background/5 hover:bg-background/10 text-muted-foreground hover:text-foreground border border-border/5 transition-all"
                aria-label="View source on GitHub"
              >
                <Github className="w-4 h-4" aria-hidden="true" />
              </a>

              {/* Theme toggle */}
              <ThemeToggle />

              {/* Download Button */}
              <Button size="sm" className="h-9 px-4 bg-wormhole-hunter hover:bg-wormhole-hunter-dark text-foreground shadow-lg shadow-wormhole-hunter/20 hover:shadow-wormhole-hunter/30 transition-all" render={<a href={mounted ? getPlatformDownloadUrl(platform) : "#download"} className="flex items-center gap-2" />}>
                {mounted && <PlatformIcon platform={platform} />}
                <span className="hidden sm:inline">{mounted ? platformLabels[platform] : "Download"}</span>
                <span className="sm:hidden">
                  <Download className="w-4 h-4" aria-hidden="true" />
                </span>
              </Button>

              {/* Mobile Menu Button */}
              <button className="lg:hidden w-9 h-9 flex items-center justify-center rounded-full bg-background/5 hover:bg-background/10 text-muted-foreground hover:text-foreground border border-border/5 transition-all" aria-label="Open menu">
                <Menu className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Spacer for fixed nav */}
      <div className="h-16" />

      {/* Hero Section with 3D Background */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        {/* 3D Wormhole Background */}
        <Suspense fallback={<div className="absolute inset-0 bg-wormhole-off-black" />}>
          <WormholeScene />
        </Suspense>

        {/* Content */}
        <div className="relative z-10 max-w-5xl mx-auto text-center px-6 py-20">
          {/* Alpha Notice */}
          <div className="inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 backdrop-blur-sm">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-sm text-amber-400 font-medium">Alpha Release</span>
            <span className="text-sm text-muted-foreground">•</span>
            <span className="text-sm text-muted-foreground">Free while in development</span>
          </div>

          <h1
            className="text-5xl md:text-7xl lg:text-8xl font-bold text-wormhole-off-white mb-8 tracking-tight leading-[1.1]"
            style={{ textShadow: "0 0 60px rgba(53, 94, 59, 0.5), 0 0 120px rgba(53, 94, 59, 0.3)" }}
          >
            Mount Any Folder.<br />
            <span className="bg-gradient-to-r from-wormhole-hunter-light via-wormhole-hunter to-wormhole-hunter-dark bg-clip-text text-transparent">
              Any Computer. No Setup.
            </span>
          </h1>

          <p
            className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-4 leading-relaxed"
            style={{ textShadow: "0 0 40px rgba(53, 94, 59, 0.35)" }}
          >
            Stop uploading. Stop waiting. Stop paying rent on your own files.
          </p>

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-12">
            Direct peer-to-peer file sharing. A 50GB folder accessible in under 10 seconds.
            No cloud, no accounts, no monthly fees.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            {mounted && (
              <Button size="lg" className="bg-wormhole-hunter hover:bg-wormhole-hunter-dark text-wormhole-off-white px-8 h-14 text-lg shadow-lg shadow-wormhole-hunter/25 hover:shadow-wormhole-hunter/40 transition-all" render={<a href={getPlatformDownloadUrl(platform)} />}>
                <PlatformIcon platform={platform} />
                <span className="ml-2">{platformLabels[platform]}</span>
                {release && <span className="ml-2 text-wormhole-hunter-light text-sm">{release.tag_name}</span>}
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            )}
            <Button variant="outline" size="lg" className="border-border bg-card/50 backdrop-blur-sm text-muted-foreground hover:bg-muted hover:text-wormhole-off-white h-14 text-lg" render={<a href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`} target="_blank" rel="noopener noreferrer" />}>
              <Github className="w-5 h-5 mr-2" />
              View Source
            </Button>
          </div>

          {/* Terminal Demo - Floating Card */}
          <div className="max-w-2xl mx-auto">
            <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-md overflow-hidden shadow-2xl shadow-wormhole-hunter/10">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/50">
                <div className="w-3 h-3 rounded-full bg-red-500/70" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                <div className="w-3 h-3 rounded-full bg-green-500/70" />
                <span className="ml-3 text-xs text-muted-foreground font-mono">Terminal</span>
              </div>
              <div className="p-6 font-mono text-sm text-left">
                <div className="flex items-start gap-2 mb-3">
                  <span className="text-wormhole-hunter-light">❯</span>
                  <span className="text-wormhole-off-white">wormhole host ~/Projects/video-project</span>
                </div>
                <div className="pl-4 space-y-1 text-muted-foreground">
                  <div>Scanning folder... <span className="text-green-400">47.3 GB</span> in 1,247 files</div>
                  <div>Starting QUIC server on port 4433...</div>
                  <div className="mt-4 p-4 rounded-lg bg-muted/70 border border-wormhole-hunter/30">
                    <div className="text-muted-foreground text-xs mb-2">Share this code with anyone:</div>
                    <div className="text-2xl font-bold tracking-wider text-wormhole-hunter-light">MARS-WIND-BLUE-FISH</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Scroll indicator */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
            <div className="w-6 h-10 rounded-full border-2 border-border flex items-start justify-center p-2">
              <div className="w-1 h-2 bg-muted rounded-full" />
            </div>
          </div>
        </div>
      </section>

      {/* Key Value Props */}
      <section className="py-16 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-6">
            <div className="text-center p-6">
              <div className="w-14 h-14 rounded-xl bg-wormhole-hunter/20 flex items-center justify-center mx-auto mb-4">
                <Zap className="w-7 h-7 text-wormhole-hunter-light" />
              </div>
              <div className="text-3xl font-bold text-wormhole-off-white mb-2">&lt;10 sec</div>
              <div className="text-sm text-muted-foreground">to access 50GB folder</div>
              <div className="text-xs text-muted-foreground mt-1">vs 2-4 hours cloud upload</div>
            </div>
            <div className="text-center p-6">
              <div className="w-14 h-14 rounded-xl bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <DollarSign className="w-7 h-7 text-green-400" />
              </div>
              <div className="text-3xl font-bold text-wormhole-off-white mb-2">$0</div>
              <div className="text-sm text-muted-foreground">forever free tier</div>
              <div className="text-xs text-muted-foreground mt-1">vs $144-600/year cloud</div>
            </div>
            <div className="text-center p-6">
              <div className="w-14 h-14 rounded-xl bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
                <Shield className="w-7 h-7 text-blue-400" />
              </div>
              <div className="text-3xl font-bold text-wormhole-off-white mb-2">E2E</div>
              <div className="text-sm text-muted-foreground">encrypted always</div>
              <div className="text-xs text-muted-foreground mt-1">files never hit servers</div>
            </div>
            <div className="text-center p-6">
              <div className="w-14 h-14 rounded-xl bg-pink-500/20 flex items-center justify-center mx-auto mb-4">
                <HardDrive className="w-7 h-7 text-pink-400" />
              </div>
              <div className="text-3xl font-bold text-wormhole-off-white mb-2">Native</div>
              <div className="text-sm text-muted-foreground">mounts as a drive</div>
              <div className="text-xs text-muted-foreground mt-1">works with any app</div>
            </div>
          </div>
        </div>
      </section>

      {/* Who It's For - Use Cases */}
      <section id="use-cases" className="py-24 px-6 border-t border-border bg-card/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-wormhole-hunter/20 text-wormhole-hunter-light border-wormhole-hunter/40">
              Built For Creators
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-wormhole-off-white mb-4">
              Stop Waiting. Start Working.
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Wormhole is designed for creative professionals who work with large files
              and are tired of cloud upload delays and subscription fees.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Video Editors */}
            <Card className="bg-card border-border overflow-hidden">
              <CardContent className="p-0">
                <div className="p-6 border-b border-border">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
                      <Video className="w-6 h-6 text-wormhole-off-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-wormhole-off-white">Video Editors</h3>
                      <p className="text-sm text-muted-foreground">Premiere, DaVinci, Final Cut</p>
                    </div>
                  </div>
                  <p className="text-muted-foreground">
                    Mount your render farm&apos;s output folder and edit files as they finish rendering.
                    No more downloading 50GB projects just to review a timeline.
                  </p>
                </div>
                <div className="p-6 bg-muted/30">
                  <div className="text-sm font-medium text-muted-foreground mb-3">Real savings:</div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-2xl font-bold text-green-400">2-4 hrs</div>
                      <div className="text-muted-foreground">saved per project</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-400">$600+</div>
                      <div className="text-muted-foreground">saved yearly vs Frame.io</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Game Developers */}
            <Card className="bg-card border-border overflow-hidden">
              <CardContent className="p-0">
                <div className="p-6 border-b border-border">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-wormhole-hunter to-wormhole-hunter-dark flex items-center justify-center">
                      <Gamepad2 className="w-6 h-6 text-wormhole-off-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-wormhole-off-white">Game Developers</h3>
                      <p className="text-sm text-muted-foreground">Unity, Unreal, Godot</p>
                    </div>
                  </div>
                  <p className="text-muted-foreground">
                    Mount your build server&apos;s output for instant testing. Share game builds with QA
                    without uploading 100GB to Steam or creating download links.
                  </p>
                </div>
                <div className="p-6 bg-muted/30">
                  <div className="text-sm font-medium text-muted-foreground mb-3">Real savings:</div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-2xl font-bold text-green-400">Instant</div>
                      <div className="text-muted-foreground">build distribution</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-400">$0</div>
                      <div className="text-muted-foreground">bandwidth costs</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* VFX Studios */}
            <Card className="bg-card border-border overflow-hidden">
              <CardContent className="p-0">
                <div className="p-6 border-b border-border">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
                      <Film className="w-6 h-6 text-wormhole-off-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-wormhole-off-white">VFX Studios</h3>
                      <p className="text-sm text-muted-foreground">After Effects, Nuke, Houdini</p>
                    </div>
                  </div>
                  <p className="text-muted-foreground">
                    Remote artists can mount the studio&apos;s asset library directly.
                    No more syncing 500GB of textures before starting work.
                  </p>
                </div>
                <div className="p-6 bg-muted/30">
                  <div className="text-sm font-medium text-muted-foreground mb-3">Real savings:</div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-2xl font-bold text-green-400">$500+</div>
                      <div className="text-muted-foreground">saved monthly on storage</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-400">1 day</div>
                      <div className="text-muted-foreground">to onboard new artists</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Remote Dev Teams */}
            <Card className="bg-card border-border overflow-hidden">
              <CardContent className="p-0">
                <div className="p-6 border-b border-border">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                      <Code2 className="w-6 h-6 text-wormhole-off-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-wormhole-off-white">Remote Dev Teams</h3>
                      <p className="text-sm text-muted-foreground">Any tech stack</p>
                    </div>
                  </div>
                  <p className="text-muted-foreground">
                    Share ML model weights, training data, or Docker images directly between machines.
                    Skip the 45-minute docker push/pull cycle.
                  </p>
                </div>
                <div className="p-6 bg-muted/30">
                  <div className="text-sm font-medium text-muted-foreground mb-3">Real savings:</div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-2xl font-bold text-green-400">Zero</div>
                      <div className="text-muted-foreground">config required</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-400">$0</div>
                      <div className="text-muted-foreground">vs S3/GCS egress fees</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* The Big Difference - Architecture */}
      <section className="py-24 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-muted text-muted-foreground border-border">
              The Architecture Difference
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-wormhole-off-white mb-4">
              Why Wormhole is Fundamentally Different
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Every other solution copies your files somewhere. We don&apos;t.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-16">
            {/* Traditional Architecture */}
            <Card className="bg-card border-border">
              <CardContent className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                    <Upload className="w-6 h-6 text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-wormhole-off-white">Traditional Cloud Storage</h3>
                    <p className="text-sm text-muted-foreground">Dropbox, Google Drive, WeTransfer</p>
                  </div>
                </div>

                <div className="mb-6 p-4 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center justify-between text-sm mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                        <FolderOpen className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <span className="text-muted-foreground">Your Files</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded bg-red-500/20 flex items-center justify-center">
                        <Server className="w-4 h-4 text-red-400" />
                      </div>
                      <span className="text-muted-foreground">Their Servers</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                        <Users className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <span className="text-muted-foreground">Recipient</span>
                    </div>
                  </div>
                  <div className="text-xs text-red-400 text-center">
                    Files copied twice • Upload wait • Storage fees • Privacy concerns
                  </div>
                </div>

                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-3 text-muted-foreground">
                    <X className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                    <span>Upload 50GB = 2-4 hours (at 5 Mbps upload)</span>
                  </li>
                  <li className="flex items-start gap-3 text-muted-foreground">
                    <X className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                    <span>Pay $12-25/mo for storage you already have</span>
                  </li>
                  <li className="flex items-start gap-3 text-muted-foreground">
                    <X className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                    <span>Files exist on third-party servers</span>
                  </li>
                  <li className="flex items-start gap-3 text-muted-foreground">
                    <X className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                    <span>Recipient must download entire file first</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Wormhole Architecture */}
            <Card className="bg-card border-wormhole-hunter/30 ring-1 ring-wormhole-hunter/20">
              <CardContent className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-wormhole-hunter/20 flex items-center justify-center">
                    <Wifi className="w-6 h-6 text-wormhole-hunter-light" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-wormhole-off-white">Wormhole P2P Mount</h3>
                    <p className="text-sm text-wormhole-hunter-light">Direct connection, no middleman</p>
                  </div>
                </div>

                <div className="mb-6 p-4 rounded-lg bg-wormhole-hunter/10 border border-wormhole-hunter/20">
                  <div className="flex items-center justify-center gap-4 text-sm mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded bg-wormhole-hunter/20 flex items-center justify-center">
                        <FolderOpen className="w-4 h-4 text-wormhole-hunter-light" />
                      </div>
                      <span className="text-muted-foreground">Your Files</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-wormhole-hunter-light" />
                      <ArrowRight className="w-4 h-4 text-wormhole-hunter-light -ml-3" style={{ transform: 'scaleX(-1)' }} />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded bg-wormhole-hunter/20 flex items-center justify-center">
                        <Users className="w-4 h-4 text-wormhole-hunter-light" />
                      </div>
                      <span className="text-muted-foreground">Recipient</span>
                    </div>
                  </div>
                  <div className="text-xs text-wormhole-hunter-light text-center">
                    Direct connection • Instant access • Zero storage • Complete privacy
                  </div>
                </div>

                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-3 text-muted-foreground">
                    <Check className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Access 50GB = under 10 seconds (any connection)</span>
                  </li>
                  <li className="flex items-start gap-3 text-muted-foreground">
                    <Check className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Free tier forever - you own the storage</span>
                  </li>
                  <li className="flex items-start gap-3 text-muted-foreground">
                    <Check className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Files never leave your machine</span>
                  </li>
                  <li className="flex items-start gap-3 text-muted-foreground">
                    <Check className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Stream any byte range on demand</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Competitor Comparison Table */}
      <section id="compare" className="py-24 px-6 border-t border-border bg-card/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-muted text-muted-foreground border-border">
              Head-to-Head Comparison
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-wormhole-off-white mb-4">
              How Wormhole Stacks Up
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Compare with the tools you&apos;re probably using today.
            </p>
          </div>

          {/* Comparison Table */}
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="py-4 px-6 text-sm font-medium text-muted-foreground">Feature</th>
                  <th className="py-4 px-6 text-sm font-medium text-wormhole-hunter-light bg-wormhole-hunter/10">
                    <div className="flex items-center gap-2">
                      <Share2 className="w-4 h-4" />
                      Wormhole
                    </div>
                  </th>
                  <th className="py-4 px-6 text-sm font-medium text-muted-foreground">Dropbox</th>
                  <th className="py-4 px-6 text-sm font-medium text-muted-foreground">Google Drive</th>
                  <th className="py-4 px-6 text-sm font-medium text-muted-foreground">WeTransfer</th>
                  <th className="py-4 px-6 text-sm font-medium text-muted-foreground">Resilio Sync</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                <tr className="border-b border-border/50">
                  <td className="py-4 px-6 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Timer className="w-4 h-4 text-muted-foreground" />
                      Share 50GB folder
                    </div>
                  </td>
                  <td className="py-4 px-6 bg-wormhole-hunter/5">
                    <span className="text-green-400 font-semibold">~10 seconds</span>
                  </td>
                  <td className="py-4 px-6 text-muted-foreground">2-4 hours upload</td>
                  <td className="py-4 px-6 text-muted-foreground">2-4 hours upload</td>
                  <td className="py-4 px-6 text-muted-foreground">2GB limit</td>
                  <td className="py-4 px-6 text-muted-foreground">30-60 min sync</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-4 px-6 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <CircleDollarSign className="w-4 h-4 text-muted-foreground" />
                      Monthly cost (100GB)
                    </div>
                  </td>
                  <td className="py-4 px-6 bg-wormhole-hunter/5">
                    <span className="text-green-400 font-semibold">$0 free tier</span>
                  </td>
                  <td className="py-4 px-6 text-muted-foreground">$12/month</td>
                  <td className="py-4 px-6 text-muted-foreground">$3/month</td>
                  <td className="py-4 px-6 text-muted-foreground">$12/month</td>
                  <td className="py-4 px-6 text-muted-foreground">$60/year</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-4 px-6 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-muted-foreground" />
                      Cloud storage needed
                    </div>
                  </td>
                  <td className="py-4 px-6 bg-wormhole-hunter/5">
                    <span className="text-green-400 font-semibold">None</span>
                  </td>
                  <td className="py-4 px-6 text-muted-foreground">Full file size</td>
                  <td className="py-4 px-6 text-muted-foreground">Full file size</td>
                  <td className="py-4 px-6 text-muted-foreground">Full file size</td>
                  <td className="py-4 px-6 text-muted-foreground">None</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-4 px-6 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Server className="w-4 h-4 text-muted-foreground" />
                      Files on third-party servers
                    </div>
                  </td>
                  <td className="py-4 px-6 bg-wormhole-hunter/5">
                    <span className="text-green-400 font-semibold">Never</span>
                  </td>
                  <td className="py-4 px-6 text-muted-foreground">Yes</td>
                  <td className="py-4 px-6 text-muted-foreground">Yes</td>
                  <td className="py-4 px-6 text-muted-foreground">Yes</td>
                  <td className="py-4 px-6 text-muted-foreground">Never</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-4 px-6 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-muted-foreground" />
                      Mounts as native drive
                    </div>
                  </td>
                  <td className="py-4 px-6 bg-wormhole-hunter/5">
                    <Check className="w-5 h-5 text-green-400" />
                  </td>
                  <td className="py-4 px-6"><X className="w-5 h-5 text-muted-foreground" /></td>
                  <td className="py-4 px-6"><X className="w-5 h-5 text-muted-foreground" /></td>
                  <td className="py-4 px-6"><X className="w-5 h-5 text-muted-foreground" /></td>
                  <td className="py-4 px-6"><X className="w-5 h-5 text-muted-foreground" /></td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-4 px-6 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-muted-foreground" />
                      E2E encryption
                    </div>
                  </td>
                  <td className="py-4 px-6 bg-wormhole-hunter/5">
                    <Check className="w-5 h-5 text-green-400" />
                  </td>
                  <td className="py-4 px-6"><X className="w-5 h-5 text-muted-foreground" /></td>
                  <td className="py-4 px-6"><X className="w-5 h-5 text-muted-foreground" /></td>
                  <td className="py-4 px-6"><X className="w-5 h-5 text-muted-foreground" /></td>
                  <td className="py-4 px-6"><Check className="w-5 h-5 text-green-400" /></td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-4 px-6 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-muted-foreground" />
                      Works through NAT/firewall
                    </div>
                  </td>
                  <td className="py-4 px-6 bg-wormhole-hunter/5">
                    <Check className="w-5 h-5 text-green-400" />
                  </td>
                  <td className="py-4 px-6"><Check className="w-5 h-5 text-green-400" /></td>
                  <td className="py-4 px-6"><Check className="w-5 h-5 text-green-400" /></td>
                  <td className="py-4 px-6"><Check className="w-5 h-5 text-green-400" /></td>
                  <td className="py-4 px-6"><Check className="w-5 h-5 text-green-400" /></td>
                </tr>
                <tr>
                  <td className="py-4 px-6 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-muted-foreground" />
                      Stream without full download
                    </div>
                  </td>
                  <td className="py-4 px-6 bg-wormhole-hunter/5">
                    <Check className="w-5 h-5 text-green-400" />
                  </td>
                  <td className="py-4 px-6"><X className="w-5 h-5 text-muted-foreground" /></td>
                  <td className="py-4 px-6 text-muted-foreground">Partial</td>
                  <td className="py-4 px-6"><X className="w-5 h-5 text-muted-foreground" /></td>
                  <td className="py-4 px-6"><X className="w-5 h-5 text-muted-foreground" /></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Cost Calculator */}
          <div className="mt-12 p-8 rounded-xl bg-card border border-border">
            <h3 className="text-xl font-semibold text-wormhole-off-white mb-6 text-center">
              Annual Cost Comparison for 1TB Storage
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="p-4 rounded-lg bg-wormhole-hunter/10 border border-wormhole-hunter/30 text-center">
                <div className="text-sm text-wormhole-hunter-light mb-1">Wormhole</div>
                <div className="text-3xl font-bold text-wormhole-off-white">$0</div>
                <div className="text-xs text-muted-foreground">free forever</div>
              </div>
              <div className="p-4 rounded-lg bg-muted text-center">
                <div className="text-sm text-muted-foreground mb-1">Dropbox</div>
                <div className="text-3xl font-bold text-muted-foreground">$180</div>
                <div className="text-xs text-muted-foreground">$15/mo</div>
              </div>
              <div className="p-4 rounded-lg bg-muted text-center">
                <div className="text-sm text-muted-foreground mb-1">Google Drive</div>
                <div className="text-3xl font-bold text-muted-foreground">$120</div>
                <div className="text-xs text-muted-foreground">$10/mo</div>
              </div>
              <div className="p-4 rounded-lg bg-muted text-center">
                <div className="text-sm text-muted-foreground mb-1">Frame.io</div>
                <div className="text-3xl font-bold text-muted-foreground">$300</div>
                <div className="text-xs text-muted-foreground">$25/mo</div>
              </div>
              <div className="p-4 rounded-lg bg-muted text-center">
                <div className="text-sm text-muted-foreground mb-1">Resilio Sync</div>
                <div className="text-3xl font-bold text-muted-foreground">$60</div>
                <div className="text-xs text-muted-foreground">$60/yr</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Technical Performance */}
      <section className="py-24 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-muted text-muted-foreground border-border">
              Under the Hood
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-wormhole-off-white mb-4">
              Enterprise-Grade Technology
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Built with modern protocols and battle-tested encryption.
              Open source, so you can verify everything.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <Card className="bg-card border-border">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-xl bg-wormhole-hunter/20 flex items-center justify-center mb-4">
                  <Gauge className="w-6 h-6 text-wormhole-hunter-light" />
                </div>
                <h3 className="text-lg font-semibold text-wormhole-off-white mb-2">QUIC Protocol</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Same protocol powering HTTP/3 and used by Google, Cloudflare, and Meta.
                  Multiplexed streams, 0-RTT connection resumption, built-in TLS 1.3.
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Connection setup</span>
                    <span className="text-wormhole-hunter-light font-mono">~50ms</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Encryption</span>
                    <span className="text-wormhole-hunter-light font-mono">TLS 1.3</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center mb-4">
                  <Database className="w-6 h-6 text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-wormhole-off-white mb-2">Smart Caching</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Intelligent 128KB chunked transfers with LRU disk cache.
                  Files you access often stay local for offline access.
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Chunk size</span>
                    <span className="text-blue-400 font-mono">128 KB</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Cache location</span>
                    <span className="text-blue-400 font-mono">~/.cache/wormhole</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center mb-4">
                  <Shield className="w-6 h-6 text-green-400" />
                </div>
                <h3 className="text-lg font-semibold text-wormhole-off-white mb-2">PAKE Authentication</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Password-authenticated key exchange. Join codes generate session keys
                  without ever transmitting the password or key.
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Algorithm</span>
                    <span className="text-green-400 font-mono">SPAKE2</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Symmetric cipher</span>
                    <span className="text-green-400 font-mono">AES-256-GCM</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Architecture diagram */}
          <div className="p-8 rounded-xl bg-card border border-border">
            <h4 className="text-lg font-semibold text-wormhole-off-white mb-8 text-center">Data Flow Architecture</h4>
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6">
              <div className="text-center">
                <div className="w-20 h-20 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                  <FolderOpen className="w-8 h-8 text-muted-foreground" />
                </div>
                <div className="text-sm font-medium text-muted-foreground">Your App</div>
                <div className="text-xs text-muted-foreground">Finder, Premiere, etc</div>
              </div>

              <ArrowRight className="w-6 h-6 text-muted-foreground rotate-90 md:rotate-0" />

              <div className="text-center">
                <div className="w-20 h-20 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                  <HardDrive className="w-8 h-8 text-muted-foreground" />
                </div>
                <div className="text-sm font-medium text-muted-foreground">FUSE Mount</div>
                <div className="text-xs text-muted-foreground">/Volumes/wormhole</div>
              </div>

              <ArrowRight className="w-6 h-6 text-muted-foreground rotate-90 md:rotate-0" />

              <div className="text-center">
                <div className="w-20 h-20 rounded-xl bg-wormhole-hunter/20 border border-wormhole-hunter/30 flex items-center justify-center mx-auto mb-3">
                  <Wifi className="w-8 h-8 text-wormhole-hunter-light" />
                </div>
                <div className="text-sm font-medium text-wormhole-hunter-light">QUIC Tunnel</div>
                <div className="text-xs text-wormhole-hunter-light">E2E Encrypted P2P</div>
              </div>

              <ArrowRight className="w-6 h-6 text-muted-foreground rotate-90 md:rotate-0" />

              <div className="text-center">
                <div className="w-20 h-20 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                  <Server className="w-8 h-8 text-muted-foreground" />
                </div>
                <div className="text-sm font-medium text-muted-foreground">Host Machine</div>
                <div className="text-xs text-muted-foreground">actual files</div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-border grid md:grid-cols-3 gap-6 text-center text-sm">
              <div>
                <div className="text-muted-foreground mb-1">Signal Server Role</div>
                <div className="text-muted-foreground">Connection coordination only</div>
                <div className="text-xs text-muted-foreground">Never sees file content</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">NAT Traversal</div>
                <div className="text-muted-foreground">STUN + TURN fallback</div>
                <div className="text-xs text-muted-foreground">Works through firewalls</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Data Path</div>
                <div className="text-muted-foreground">Direct peer-to-peer</div>
                <div className="text-xs text-muted-foreground">No relay by default</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 px-6 border-t border-border bg-card/30">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-muted text-muted-foreground border-border">
              Quick Start
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-wormhole-off-white mb-4">
              Share a Code. That&apos;s It.
            </h2>
            <p className="text-lg text-muted-foreground">
              No accounts. No configuration. No upload wait.
            </p>
          </div>

          <div className="space-y-8">
            {[
              {
                step: "1",
                title: "Host your folder",
                description: "Run wormhole host on any folder. The server starts instantly - no upload required.",
                code: "wormhole host ~/Projects/video-edit",
                output: "Share code: MARS-WIND-BLUE-FISH"
              },
              {
                step: "2",
                title: "Share the code",
                description: "Send the 4-word code to your collaborator via any channel - Slack, text, email.",
                code: "# Easy to remember, easy to type",
                output: "MARS-WIND-BLUE-FISH"
              },
              {
                step: "3",
                title: "Mount and work",
                description: "They run wormhole mount with the code. Files appear as a native drive instantly.",
                code: "wormhole mount MARS-WIND-BLUE-FISH",
                output: "Mounted at /Volumes/wormhole/video-edit"
              },
            ].map((item, i) => (
              <div key={i} className="flex gap-6 items-start">
                <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-gradient-to-br from-[#4B5320] to-[#3d4419] flex items-center justify-center shadow-lg shadow-wormhole-hunter/20">
                  <span className="text-2xl font-bold text-wormhole-off-white">{item.step}</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-wormhole-off-white mb-2">{item.title}</h3>
                  <p className="text-muted-foreground mb-4">{item.description}</p>
                  <div className="rounded-xl bg-card border border-border overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/50">
                      <div className="w-2 h-2 rounded-full bg-muted" />
                      <div className="w-2 h-2 rounded-full bg-muted" />
                      <div className="w-2 h-2 rounded-full bg-muted" />
                    </div>
                    <div className="p-4 font-mono text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-wormhole-hunter-light">❯</span>
                        <span className="text-muted-foreground">{item.code}</span>
                      </div>
                      <div className="text-green-400 mt-2 pl-4">{item.output}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section id="pricing" className="py-24 px-6 border-t border-border">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-green-500/20 text-green-400 border-green-500/40">
              Free During Alpha
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-wormhole-off-white mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Free tier forever. Pro tiers coming after launch for power users and teams.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Free Tier */}
            <Card className="bg-card border-border">
              <CardContent className="p-8">
                <div className="text-sm font-medium text-muted-foreground mb-2">Free</div>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-bold text-wormhole-off-white">$0</span>
                  <span className="text-muted-foreground">/forever</span>
                </div>
                <p className="text-sm text-muted-foreground mb-6">
                  For individuals and hobbyists who want to try P2P file sharing.
                </p>
                <ul className="space-y-3 text-sm mb-8">
                  <li className="flex items-center gap-2 text-muted-foreground">
                    <Check className="w-4 h-4 text-green-400" />
                    Unlimited file sizes
                  </li>
                  <li className="flex items-center gap-2 text-muted-foreground">
                    <Check className="w-4 h-4 text-green-400" />
                    End-to-end encryption
                  </li>
                  <li className="flex items-center gap-2 text-muted-foreground">
                    <Check className="w-4 h-4 text-green-400" />
                    2 simultaneous connections
                  </li>
                  <li className="flex items-center gap-2 text-muted-foreground">
                    <Check className="w-4 h-4 text-green-400" />
                    Community support
                  </li>
                </ul>
                <Button className="w-full bg-muted hover:bg-muted text-wormhole-off-white" render={<a href={mounted ? getPlatformDownloadUrl(platform) : "#download"} />}>
                  Download Free
                </Button>
              </CardContent>
            </Card>

            {/* Pro Tier */}
            <Card className="bg-card border-wormhole-hunter/50 ring-1 ring-wormhole-hunter/20 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-wormhole-hunter text-wormhole-off-white border-0">
                  Coming Soon
                </Badge>
              </div>
              <CardContent className="p-8">
                <div className="text-sm font-medium text-wormhole-hunter-light mb-2">Pro</div>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-bold text-wormhole-off-white">$8</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <p className="text-sm text-muted-foreground mb-6">
                  For freelancers and power users who need more connections.
                </p>
                <ul className="space-y-3 text-sm mb-8">
                  <li className="flex items-center gap-2 text-muted-foreground">
                    <Check className="w-4 h-4 text-wormhole-hunter-light" />
                    Everything in Free
                  </li>
                  <li className="flex items-center gap-2 text-muted-foreground">
                    <Check className="w-4 h-4 text-wormhole-hunter-light" />
                    10 simultaneous connections
                  </li>
                  <li className="flex items-center gap-2 text-muted-foreground">
                    <Check className="w-4 h-4 text-wormhole-hunter-light" />
                    Persistent join codes
                  </li>
                  <li className="flex items-center gap-2 text-muted-foreground">
                    <Check className="w-4 h-4 text-wormhole-hunter-light" />
                    Priority support
                  </li>
                </ul>
                <Button className="w-full bg-wormhole-hunter hover:bg-wormhole-hunter-dark text-wormhole-off-white" disabled>
                  Coming After Launch
                </Button>
              </CardContent>
            </Card>

            {/* Team Tier */}
            <Card className="bg-card border-border">
              <CardContent className="p-8">
                <div className="text-sm font-medium text-muted-foreground mb-2">Team</div>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-bold text-wormhole-off-white">$15</span>
                  <span className="text-muted-foreground">/user/mo</span>
                </div>
                <p className="text-sm text-muted-foreground mb-6">
                  For studios and teams (3-25 people) with collaboration needs.
                </p>
                <ul className="space-y-3 text-sm mb-8">
                  <li className="flex items-center gap-2 text-muted-foreground">
                    <Check className="w-4 h-4 text-green-400" />
                    Everything in Pro
                  </li>
                  <li className="flex items-center gap-2 text-muted-foreground">
                    <Check className="w-4 h-4 text-green-400" />
                    Unlimited connections
                  </li>
                  <li className="flex items-center gap-2 text-muted-foreground">
                    <Check className="w-4 h-4 text-green-400" />
                    Team management
                  </li>
                  <li className="flex items-center gap-2 text-muted-foreground">
                    <Check className="w-4 h-4 text-green-400" />
                    Usage analytics
                  </li>
                </ul>
                <Button className="w-full bg-muted hover:bg-muted text-wormhole-off-white" disabled>
                  Coming After Launch
                </Button>
              </CardContent>
            </Card>
          </div>

          <p className="text-center text-sm text-muted-foreground mt-8">
            Need enterprise features? Custom deployment, SSO, audit logs? <a href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues`} className="text-wormhole-hunter-light hover:underline">Contact us</a>.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 px-6 border-t border-border bg-card/30">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-muted text-muted-foreground border-border">
              FAQ
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-wormhole-off-white mb-4">
              Common Questions
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-card overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-6 text-left hover:bg-muted/50 transition-colors"
                >
                  <span className="font-medium text-wormhole-off-white pr-4">{faq.q}</span>
                  <ChevronDown className={`w-5 h-5 text-muted-foreground flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-6 text-muted-foreground text-sm leading-relaxed">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-24 px-6 border-t border-border">
        <div className="max-w-4xl mx-auto text-center">
          <Badge className="mb-4 bg-muted text-muted-foreground border-border">
            Open Source
          </Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-wormhole-off-white mb-6">
            Built in Public. Free Forever.
          </h2>
          <p className="text-lg text-muted-foreground mb-12 max-w-2xl mx-auto">
            Wormhole is open source under the MIT license. Inspect the code, contribute features,
            or fork it for your own use. The core will always be free.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-8 mb-12">
            <a
              href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-6 py-3 rounded-lg bg-card border border-border hover:border-border transition-colors"
            >
              <Github className="w-6 h-6 text-wormhole-off-white" />
              <div className="text-left">
                <div className="text-sm font-medium text-wormhole-off-white">Star on GitHub</div>
                <div className="text-xs text-muted-foreground">MIT Licensed</div>
              </div>
            </a>
            <a
              href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-6 py-3 rounded-lg bg-card border border-border hover:border-border transition-colors"
            >
              <MessageSquare className="w-6 h-6 text-wormhole-off-white" />
              <div className="text-left">
                <div className="text-sm font-medium text-wormhole-off-white">Report Issues</div>
                <div className="text-xs text-muted-foreground">Bugs & Features</div>
              </div>
            </a>
            <a
              href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}#contributing`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-6 py-3 rounded-lg bg-card border border-border hover:border-border transition-colors"
            >
              <Sparkles className="w-6 h-6 text-wormhole-off-white" />
              <div className="text-left">
                <div className="text-sm font-medium text-wormhole-off-white">Contribute</div>
                <div className="text-xs text-muted-foreground">PRs Welcome</div>
              </div>
            </a>
          </div>

          {/* Tech Stack */}
          <div className="p-6 rounded-xl bg-card border border-border inline-flex flex-wrap items-center justify-center gap-4 text-sm">
            <span className="text-muted-foreground">Built with:</span>
            <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground">Rust</span>
            <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground">QUIC/quinn</span>
            <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground">FUSE</span>
            <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground">Tauri</span>
            <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground">React</span>
          </div>
        </div>
      </section>

      {/* Download CTA Section */}
      <section id="download" className="relative py-32 px-6 border-t border-border/50 overflow-hidden">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-wormhole-hunter/5 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-wormhole-hunter/10 via-transparent to-transparent" />

        <div className="relative max-w-3xl mx-auto text-center">
          {/* Glowing orb decoration */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-wormhole-hunter/20 rounded-full blur-[100px] pointer-events-none" />

          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-wormhole-off-white mb-6 tracking-tight">
            Ready to start?
          </h2>
          <p className="text-xl text-muted-foreground mb-10 max-w-xl mx-auto leading-relaxed">
            Download Wormhole and share your first folder in under a minute. Free forever during alpha.
          </p>

          {mounted && (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
              <Button
                size="lg"
                className="bg-wormhole-hunter hover:bg-wormhole-hunter-dark text-wormhole-off-white h-14 px-8 text-lg shadow-lg shadow-wormhole-hunter/20 hover:shadow-wormhole-hunter/30 transition-all"
                render={<a href={getPlatformDownloadUrl(platform)} className="flex items-center gap-3" />}
              >
                <PlatformIcon platform={platform} />
                <span>{platformLabels[platform]}</span>
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-14 px-8 text-lg border-border text-muted-foreground hover:bg-muted/50 hover:text-wormhole-off-white"
                render={<a href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3" />}
              >
                <Github className="w-5 h-5" aria-hidden="true" />
                <span>View Source</span>
              </Button>
            </div>
          )}

          {/* Platform options */}
          <div id="all-downloads" className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground" role="group" aria-label="Download options for all platforms">
            <a href="/download/macos" className="flex items-center gap-2 hover:text-wormhole-off-white transition-colors">
              <Apple className="w-4 h-4" aria-hidden="true" />
              <span>macOS</span>
            </a>
            <span className="text-muted-foreground">•</span>
            <a href="/download/windows" className="flex items-center gap-2 hover:text-wormhole-off-white transition-colors">
              <Monitor className="w-4 h-4" aria-hidden="true" />
              <span>Windows</span>
            </a>
            <span className="text-muted-foreground">•</span>
            <a href="/download/linux" className="flex items-center gap-2 hover:text-wormhole-off-white transition-colors">
              <Terminal className="w-4 h-4" aria-hidden="true" />
              <span>Linux</span>
            </a>
            {release && (
              <>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">
                  <span className="font-mono text-wormhole-hunter-light">{release.tag_name}</span>
                </span>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-background/50">
        <div className="max-w-6xl mx-auto px-6 py-16">
          {/* Main footer content */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 md:gap-12 mb-12">
            {/* Brand column */}
            <div className="col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-wormhole-hunter flex items-center justify-center">
                  <Share2 className="w-5 h-5 text-wormhole-off-white" aria-hidden="true" />
                </div>
                <span className="font-bold text-xl text-wormhole-off-white">Wormhole</span>
              </div>
              <p className="text-muted-foreground mb-6 max-w-sm leading-relaxed text-sm">
                Mount any folder from any computer. No cloud uploads, no waiting, no monthly fees. Just share a code and connect.
              </p>
              <div className="flex items-center gap-3">
                <a
                  href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-lg bg-muted/50 hover:bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-wormhole-off-white transition-colors"
                  aria-label="Wormhole on GitHub"
                >
                  <Github className="w-4 h-4" aria-hidden="true" />
                </a>
                <a
                  href="https://twitter.com/wormholeapp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-lg bg-muted/50 hover:bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-wormhole-off-white transition-colors"
                  aria-label="Wormhole on Twitter"
                >
                  <Twitter className="w-4 h-4" aria-hidden="true" />
                </a>
                <a
                  href="https://github.com/sponsors/byronwade"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-lg bg-pink-500/10 hover:bg-pink-500/20 flex items-center justify-center text-pink-400 hover:text-pink-300 transition-colors"
                  aria-label="Sponsor on GitHub"
                >
                  <Heart className="w-4 h-4" aria-hidden="true" />
                </a>
              </div>
            </div>

            {/* Product column */}
            <div>
              <h3 className="font-semibold text-wormhole-off-white mb-4 text-sm">Product</h3>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <a href="#how-it-works" className="text-muted-foreground hover:text-wormhole-off-white transition-colors">How it Works</a>
                </li>
                <li>
                  <a href="#use-cases" className="text-muted-foreground hover:text-wormhole-off-white transition-colors">Use Cases</a>
                </li>
                <li>
                  <a href="#compare" className="text-muted-foreground hover:text-wormhole-off-white transition-colors">Compare</a>
                </li>
                <li>
                  <Link href="/pricing" className="text-muted-foreground hover:text-wormhole-off-white transition-colors">Pricing</Link>
                </li>
                <li>
                  <a href="#faq" className="text-muted-foreground hover:text-wormhole-off-white transition-colors">FAQ</a>
                </li>
              </ul>
            </div>

            {/* Resources column */}
            <div>
              <h3 className="font-semibold text-wormhole-off-white mb-4 text-sm">Resources</h3>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <Link href="/docs" className="text-muted-foreground hover:text-wormhole-off-white transition-colors">Documentation</Link>
                </li>
                <li>
                  <Link href="/docs/quickstart" className="text-muted-foreground hover:text-wormhole-off-white transition-colors">Quick Start</Link>
                </li>
                <li>
                  <Link href="/docs/cli" className="text-muted-foreground hover:text-wormhole-off-white transition-colors">CLI Reference</Link>
                </li>
                <li>
                  <Link href="/changelog" className="text-muted-foreground hover:text-wormhole-off-white transition-colors">Changelog</Link>
                </li>
                <li>
                  <a href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-wormhole-off-white transition-colors">Report Issue</a>
                </li>
              </ul>
            </div>

            {/* Company column */}
            <div>
              <h3 className="font-semibold text-wormhole-off-white mb-4 text-sm">Company</h3>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <Link href="/about" className="text-muted-foreground hover:text-wormhole-off-white transition-colors">About</Link>
                </li>
                <li>
                  <a href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-wormhole-off-white transition-colors">Source Code</a>
                </li>
                <li>
                  <a href="https://github.com/sponsors/byronwade" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-wormhole-off-white transition-colors">Sponsor</a>
                </li>
                <li>
                  <a href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/discussions`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-wormhole-off-white transition-colors">Community</a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="pt-8 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Open source under MIT License • Free during alpha
            </p>
            <p className="text-sm text-muted-foreground font-medium">
              Mount Any Folder. Any Computer. No Setup.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
