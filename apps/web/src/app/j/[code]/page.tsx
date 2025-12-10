"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Share2,
  Apple,
  Monitor,
  Terminal,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  ArrowRight,
  Download,
} from "lucide-react";

type Platform = "mac" | "windows" | "linux" | "unknown";

interface GitHubRelease {
  tag_name: string;
  assets: {
    name: string;
    browser_download_url: string;
  }[];
}

const GITHUB_OWNER = "byronwade";
const GITHUB_REPO = "wormhole";

// Base URL for wormhole links
const WORMHOLE_BASE_URL = "https://wormhole.byronwade.com";

function detectPlatform(): Platform {
  if (typeof window === "undefined") return "unknown";
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("mac")) return "mac";
  if (userAgent.includes("win")) return "windows";
  if (userAgent.includes("linux")) return "linux";
  return "unknown";
}

function getAssetForPlatform(assets: GitHubRelease["assets"], platform: Platform): GitHubRelease["assets"][0] | null {
  const patterns: Record<Platform, string[][]> = {
    mac: [[".dmg"], ["macos", "darwin", "aarch64", "arm64"]],
    windows: [["-setup.exe", ".msi"], [".exe"]],
    linux: [[".appimage"], [".deb"], [".rpm"]],
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

function normalizeJoinCode(code: string): string {
  // Remove any URL prefix if present
  let normalized = code.toUpperCase().trim();

  // Handle various formats
  normalized = normalized
    .replace(/^HTTPS?:\/\/[^/]+\/J\//i, "")
    .replace(/[^A-Z0-9]/g, "");

  // Insert dash if needed (format: XXX-XXX or similar)
  if (normalized.length === 6 && !normalized.includes("-")) {
    normalized = `${normalized.slice(0, 3)}-${normalized.slice(3)}`;
  }

  return normalized;
}

function isValidJoinCode(code: string): boolean {
  // Valid formats: ABC-123, ABCDEF, ABC123
  const normalized = code.replace(/-/g, "");
  return /^[A-Z0-9]{6,12}$/i.test(normalized);
}

export default function JoinPage() {
  const params = useParams();
  const rawCode = params.code as string;
  const joinCode = normalizeJoinCode(decodeURIComponent(rawCode));

  const [platform, setPlatform] = useState<Platform>("unknown");
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [attemptedDeepLink, setAttemptedDeepLink] = useState(false);
  const [deepLinkFailed, setDeepLinkFailed] = useState(false);
  const [release, setRelease] = useState<GitHubRelease | null>(null);

  useEffect(() => {
    setMounted(true);
    setPlatform(detectPlatform());

    // Fetch latest release for download links
    fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`)
      .then(res => res.ok ? res.json() : null)
      .then(data => setRelease(data))
      .catch(() => {});
  }, []);

  // Attempt to open the app via deep link
  useEffect(() => {
    if (!mounted || attemptedDeepLink) return;

    const deepLinkUrl = `wormhole://join/${joinCode}`;

    // Try to open the deep link
    const tryDeepLink = () => {
      setAttemptedDeepLink(true);

      // Create a hidden iframe to try the deep link
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = deepLinkUrl;
      document.body.appendChild(iframe);

      // Also try window.location as fallback
      const startTime = Date.now();

      // Check if we're still on the page after a delay
      // If we are, the deep link probably didn't work
      setTimeout(() => {
        if (document.hasFocus() && Date.now() - startTime < 2000) {
          setDeepLinkFailed(true);
        }
        // Clean up iframe
        document.body.removeChild(iframe);
      }, 1500);
    };

    // Small delay to let the page render first
    const timeout = setTimeout(tryDeepLink, 500);
    return () => clearTimeout(timeout);
  }, [mounted, attemptedDeepLink, joinCode]);

  const handleOpenApp = () => {
    window.location.href = `wormhole://join/${joinCode}`;
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${WORMHOLE_BASE_URL}/j/${joinCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getDownloadUrl = (targetPlatform: Platform): string => {
    if (release?.assets) {
      const asset = getAssetForPlatform(release.assets, targetPlatform);
      if (asset) return asset.browser_download_url;
    }
    return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
  };

  const isValid = isValidJoinCode(joinCode);

  if (!isValid) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
        <Card className="max-w-md w-full bg-zinc-900 border-zinc-800">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-6">
              <Share2 className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Invalid Join Code</h1>
            <p className="text-zinc-400 mb-6">
              The join code &quot;{rawCode}&quot; doesn&apos;t appear to be valid.
            </p>
            <Button asChild className="bg-wormhole-hunter hover:bg-wormhole-hunter-dark">
              <Link href="/">Go to Homepage</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Navigation */}
      <nav className="border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3" aria-label="Wormhole Home">
            <div className="w-8 h-8 rounded-lg bg-wormhole-hunter flex items-center justify-center" aria-hidden="true">
              <Share2 className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg text-white">Wormhole</span>
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 text-xs font-medium">
              ALPHA
            </Badge>
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex items-center justify-center min-h-[calc(100vh-64px)] p-6">
        <div className="max-w-lg w-full">
          {/* Join Code Card */}
          <Card className="bg-zinc-900 border-zinc-800 mb-6">
            <CardContent className="p-8">
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-full bg-wormhole-hunter/20 flex items-center justify-center mx-auto mb-6" aria-hidden="true">
                  <Share2 className="w-8 h-8 text-wormhole-hunter-light" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">
                  Join Shared Folder
                </h1>
                <p className="text-zinc-400">
                  Someone is sharing files with you via Wormhole
                </p>
              </div>

              {/* Join Code Display */}
              <div className="bg-wormhole-hunter/10 border border-wormhole-hunter/30 rounded-xl p-6 mb-6">
                <div className="text-center">
                  <p className="text-sm text-zinc-400 mb-2">Join Code</p>
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-4xl font-mono font-bold tracking-wider text-white tabular-nums">
                      {joinCode}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleCopyCode}
                      className="bg-zinc-800 hover:bg-zinc-700"
                      aria-label={copied ? "Copied!" : "Copy join code"}
                    >
                      {copied ? (
                        <Check className="w-5 h-5 text-green-400" aria-hidden="true" />
                      ) : (
                        <Copy className="w-5 h-5 text-zinc-400" aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Status Message - AGENTS.md: Use polite aria-live for status */}
              {!deepLinkFailed && mounted && (
                <div className="flex items-center justify-center gap-2 text-sm text-zinc-400 mb-6" role="status" aria-live="polite">
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Opening Wormhole app…</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-3">
                <Button
                  onClick={handleOpenApp}
                  className="w-full bg-wormhole-hunter hover:bg-wormhole-hunter-dark h-12"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open in Wormhole App
                </Button>

                <Button
                  variant="outline"
                  onClick={handleCopyLink}
                  className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-12"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Share Link
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Download Section */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold text-white mb-4 text-center">
                Don&apos;t have Wormhole installed?
              </h2>

              {/* Primary download for detected platform */}
              {platform !== "unknown" && (
                <Button
                  className="w-full mb-4 bg-wormhole-hunter hover:bg-wormhole-hunter-dark h-12"
                  asChild
                >
                  <a href={getDownloadUrl(platform)}>
                    <Download className="w-4 h-4 mr-2" />
                    Download for {platform === "mac" ? "macOS" : platform === "windows" ? "Windows" : "Linux"}
                  </a>
                </Button>
              )}

              <div className="grid grid-cols-3 gap-3 mb-4">
                <Button
                  variant="outline"
                  className={`h-auto py-4 flex-col gap-2 ${
                    platform === "mac"
                      ? "border-wormhole-hunter bg-wormhole-hunter/10 text-white"
                      : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  }`}
                  asChild
                >
                  <a href={getDownloadUrl("mac")}>
                    <Apple className="w-6 h-6" />
                    <span className="text-xs">macOS</span>
                  </a>
                </Button>
                <Button
                  variant="outline"
                  className={`h-auto py-4 flex-col gap-2 ${
                    platform === "windows"
                      ? "border-wormhole-hunter bg-wormhole-hunter/10 text-white"
                      : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  }`}
                  asChild
                >
                  <a href={getDownloadUrl("windows")}>
                    <Monitor className="w-6 h-6" />
                    <span className="text-xs">Windows</span>
                  </a>
                </Button>
                <Button
                  variant="outline"
                  className={`h-auto py-4 flex-col gap-2 ${
                    platform === "linux"
                      ? "border-wormhole-hunter bg-wormhole-hunter/10 text-white"
                      : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  }`}
                  asChild
                >
                  <a href={getDownloadUrl("linux")}>
                    <Terminal className="w-6 h-6" />
                    <span className="text-xs">Linux</span>
                  </a>
                </Button>
              </div>

              {/* CLI Alternative */}
              <div className="text-center">
                <p className="text-xs text-zinc-500 mb-2">Or use the CLI:</p>
                <code className="text-xs bg-zinc-800 px-3 py-1.5 rounded text-zinc-300 font-mono">
                  wormhole mount {joinCode}
                </code>
              </div>
            </CardContent>
          </Card>

          {/* How it works */}
          <div className="mt-8 text-center">
            <p className="text-sm text-zinc-500 mb-4">How it works</p>
            <div className="flex items-center justify-center gap-4 text-xs text-zinc-400">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-wormhole-hunter-light font-bold">
                  1
                </div>
                <span>Install Wormhole</span>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-600" />
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-wormhole-hunter-light font-bold">
                  2
                </div>
                <span>Click link</span>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-600" />
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-wormhole-hunter-light font-bold">
                  3
                </div>
                <span>Access files</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
