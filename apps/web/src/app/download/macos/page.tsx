"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Apple,
  Download,
  CheckCircle2,
  Copy,
  ExternalLink,
  AlertTriangle,
  Shield,
  Terminal,
  ArrowRight,
  Github,
  Share2,
  ChevronRight,
  MousePointerClick,
} from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";

const GITHUB_OWNER = "byronwade";
const GITHUB_REPO = "wormhole";

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  assets: {
    name: string;
    browser_download_url: string;
    size: number;
  }[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="p-2 rounded hover:bg-zinc-700 transition-colors text-zinc-400 hover:text-white"
      title="Copy to clipboard"
    >
      {copied ? (
        <CheckCircle2 className="w-4 h-4 text-green-400" />
      ) : (
        <Copy className="w-4 h-4" />
      )}
    </button>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="flex items-center justify-between bg-black/50 rounded-lg border border-zinc-800 px-4 py-3">
      <code className="text-green-400 font-mono text-sm">{code}</code>
      <CopyButton text={code} />
    </div>
  );
}

export default function MacOSDownloadPage() {
  const [release, setRelease] = useState<GitHubRelease | null>(null);
  const [dmgAsset, setDmgAsset] = useState<GitHubRelease["assets"][0] | null>(null);

  useEffect(() => {
    fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: GitHubRelease | null) => {
        if (data) {
          setRelease(data);
          const dmg = data.assets.find(
            (a) =>
              a.name.toLowerCase().includes(".dmg") &&
              (a.name.toLowerCase().includes("universal") ||
                a.name.toLowerCase().includes("aarch64") ||
                a.name.toLowerCase().includes("arm64"))
          ) || data.assets.find((a) => a.name.toLowerCase().includes(".dmg"));
          setDmgAsset(dmg || null);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Navigation */}
      <nav className="border-b border-white/10 sticky top-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-wormhole-hunter flex items-center justify-center">
                <Share2 className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-lg text-white">Wormhole</span>
            </Link>
            <ChevronRight className="w-4 h-4 text-zinc-600" />
            <span className="text-zinc-400">Download for macOS</span>
          </div>
          <a
            href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <Github className="w-5 h-5" />
          </a>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-zinc-700 to-zinc-800 mb-6 shadow-lg">
            <Apple className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">
            Wormhole for macOS
          </h1>
          <p className="text-lg text-zinc-400 max-w-lg mx-auto">
            Mount remote folders as local drives. Share files instantly without uploads.
          </p>
          {release && (
            <p className="text-sm text-zinc-500 mt-4">
              Version{" "}
              <span className="text-wormhole-hunter-light font-mono">{release.tag_name}</span>
            </p>
          )}
        </div>

        {/* Download Button */}
        <div className="flex justify-center mb-16">
          <Button
            size="lg"
            className="bg-wormhole-hunter hover:bg-wormhole-hunter-dark text-white px-8 py-6 text-lg h-auto rounded-xl shadow-lg shadow-wormhole-hunter/20"
            asChild
          >
            <a href={dmgAsset?.browser_download_url || `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`}>
              <Download className="w-5 h-5 mr-3" />
              Download for macOS
              {dmgAsset && (
                <span className="ml-3 text-wormhole-hunter-light text-sm font-normal">
                  {formatBytes(dmgAsset.size)}
                </span>
              )}
            </a>
          </Button>
        </div>

        {/* Installation Steps */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-white mb-8">Installation Steps</h2>

          {/* Step 1 */}
          <div className="relative pl-12">
            <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-wormhole-hunter flex items-center justify-center text-white font-bold text-sm">
              1
            </div>
            <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                Download and Install
              </h3>
              <p className="text-zinc-400">
                Download the .dmg file above, open it, and drag Wormhole to your Applications folder.
              </p>
            </div>
          </div>

          {/* Step 2 - Security Warning */}
          <div className="relative pl-12">
            <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-wormhole-hunter flex items-center justify-center text-white font-bold text-sm">
              2
            </div>
            <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                Bypass the Security Warning
              </h3>
              <p className="text-zinc-400 mb-6">
                macOS will show:{" "}
                <span className="text-amber-400 font-medium">
                  &quot;Wormhole can&apos;t be opened because it is from an unidentified developer&quot;
                </span>
              </p>

              {/* Option A */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <MousePointerClick className="w-5 h-5 text-green-400" />
                  <span className="font-medium text-white">Option A: Right-click to Open</span>
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                    Easiest
                  </Badge>
                </div>
                <div className="ml-8 space-y-2 text-zinc-400 text-sm">
                  <p>1. <strong className="text-zinc-200">Right-click</strong> (or Control+click) on Wormhole in Applications</p>
                  <p>2. Click <strong className="text-zinc-200">&quot;Open&quot;</strong> from the context menu</p>
                  <p>3. Click <strong className="text-zinc-200">&quot;Open&quot;</strong> again in the dialog</p>
                </div>
                <p className="ml-8 mt-3 text-xs text-zinc-500">
                  Only needed once. After that, the app opens normally.
                </p>
              </div>

              <div className="border-t border-zinc-800 my-6" />

              {/* Option B */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <Terminal className="w-5 h-5 text-zinc-400" />
                  <span className="font-medium text-white">Option B: Terminal Command</span>
                </div>
                <div className="ml-8">
                  <p className="text-zinc-400 text-sm mb-3">
                    Remove the quarantine flag with this command:
                  </p>
                  <CodeBlock code="xattr -cr /Applications/Wormhole.app" />
                </div>
              </div>

              <div className="border-t border-zinc-800 my-6" />

              {/* Option C */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <Terminal className="w-5 h-5 text-zinc-400" />
                  <span className="font-medium text-white">Option C: Run Our Fix Script</span>
                </div>
                <div className="ml-8">
                  <p className="text-zinc-400 text-sm mb-3">
                    Guided fix that finds and fixes the app automatically:
                  </p>
                  <CodeBlock code="curl -fsSL https://raw.githubusercontent.com/byronwade/Wormhole/main/scripts/macos-fix-gatekeeper.sh | bash" />
                </div>
              </div>
            </div>
          </div>

          {/* Step 3 - macFUSE */}
          <div className="relative pl-12">
            <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-wormhole-hunter flex items-center justify-center text-white font-bold text-sm">
              3
            </div>
            <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                Install macFUSE
                <span className="ml-2 text-sm font-normal text-zinc-500">(Required)</span>
              </h3>
              <p className="text-zinc-400 mb-6">
                macFUSE enables Wormhole to mount remote folders as local drives. One-time setup.
              </p>

              <p className="text-zinc-400 text-sm mb-3">Install via Homebrew:</p>
              <CodeBlock code="brew install --cask macfuse" />

              <div className="flex items-center gap-4 mt-4">
                <span className="text-zinc-500 text-sm">Or download from:</span>
                <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:text-white" asChild>
                  <a href="https://osxfuse.github.io/" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    macFUSE Website
                  </a>
                </Button>
              </div>

              <div className="mt-6 flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-200/80">
                  After installing, go to <strong>System Settings → Privacy & Security</strong> and click <strong>&quot;Allow&quot;</strong> for the kernel extension. A restart may be required.
                </p>
              </div>
            </div>
          </div>

          {/* Step 4 - Done */}
          <div className="relative pl-12">
            <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-green-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-white" />
            </div>
            <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                You&apos;re Ready!
              </h3>
              <p className="text-zinc-400">
                Open Wormhole from Applications. The app will guide you through sharing your first folder or connecting to someone else&apos;s share.
              </p>
            </div>
          </div>
        </div>

        {/* Why No Signing */}
        <div className="mt-16 p-6 rounded-xl bg-zinc-900/30 border border-zinc-800">
          <div className="flex items-start gap-4">
            <Shield className="w-6 h-6 text-zinc-500 flex-shrink-0" />
            <div>
              <h3 className="text-base font-semibold text-white mb-2">
                Why isn&apos;t Wormhole signed?
              </h3>
              <p className="text-zinc-400 text-sm mb-4">
                Apple charges <strong className="text-zinc-300">$99/year</strong> for code signing. As a free, open-source project, we can&apos;t justify that cost. The entire codebase is public and all releases are built by GitHub Actions with full transparency.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:text-white" asChild>
                  <a href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`} target="_blank" rel="noopener noreferrer">
                    <Github className="w-4 h-4 mr-2" />
                    View Source
                  </a>
                </Button>
                <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:text-white" asChild>
                  <a href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/actions`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Build Logs
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Other Platforms */}
        <div className="mt-12 text-center">
          <p className="text-zinc-500 mb-4">Looking for a different platform?</p>
          <div className="flex justify-center gap-3">
            <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:text-white" asChild>
              <Link href="/download/windows">
                Windows
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:text-white" asChild>
              <Link href="/download/linux">
                Linux
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-8 px-6 mt-16">
        <div className="max-w-3xl mx-auto text-center text-sm text-zinc-600">
          <p>Open source under MIT License. Free during alpha.</p>
        </div>
      </footer>
    </div>
  );
}
