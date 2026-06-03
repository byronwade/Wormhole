"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Terminal,
  Download,
  CheckCircle2,
  Copy,
  ExternalLink,
  ArrowRight,
  Github,
  Share2,
  ChevronRight,
  Package,
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

export default function LinuxDownloadPage() {
  const [release, setRelease] = useState<GitHubRelease | null>(null);
  const [appImageAsset, setAppImageAsset] = useState<GitHubRelease["assets"][0] | null>(null);
  const [debAsset, setDebAsset] = useState<GitHubRelease["assets"][0] | null>(null);

  useEffect(() => {
    fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: GitHubRelease | null) => {
        if (data) {
          setRelease(data);
          setAppImageAsset(data.assets.find((a) => a.name.toLowerCase().includes(".appimage")) || null);
          setDebAsset(data.assets.find((a) => a.name.toLowerCase().includes(".deb")) || null);
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
            <span className="text-zinc-400">Download for Linux</span>
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
            <Terminal className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">
            Wormhole for Linux
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

        {/* Download Options */}
        <div className="grid sm:grid-cols-2 gap-4 mb-16">
          <Button
            size="lg"
            className="bg-wormhole-hunter hover:bg-wormhole-hunter-dark text-white h-auto py-6 flex-col gap-2 rounded-xl shadow-lg shadow-wormhole-hunter/20"
            asChild
          >
            <a href={appImageAsset?.browser_download_url || `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`}>
              <Package className="w-6 h-6" />
              <span className="font-medium">Download AppImage</span>
              <span className="text-xs text-wormhole-hunter-light">
                {appImageAsset ? formatBytes(appImageAsset.size) : "Universal • Works on any distro"}
              </span>
            </a>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-auto py-6 flex-col gap-2 rounded-xl"
            asChild
          >
            <a href={debAsset?.browser_download_url || `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`}>
              <Download className="w-6 h-6" />
              <span className="font-medium">Download .deb</span>
              <span className="text-xs text-zinc-500">
                {debAsset ? formatBytes(debAsset.size) : "Debian, Ubuntu, Mint"}
              </span>
            </a>
          </Button>
        </div>

        {/* Installation Steps */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-white mb-8">Installation Steps</h2>

          {/* Step 1 - Install FUSE */}
          <div className="relative pl-12">
            <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-wormhole-hunter flex items-center justify-center text-white font-bold text-sm">
              1
            </div>
            <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                Install FUSE3
                <span className="ml-2 text-sm font-normal text-zinc-500">(Required)</span>
              </h3>
              <p className="text-zinc-400 mb-6">
                FUSE enables Wormhole to mount remote folders as local drives. Install using your package manager:
              </p>

              <div className="space-y-4">
                {/* Debian/Ubuntu */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs">
                      Debian / Ubuntu / Mint
                    </Badge>
                  </div>
                  <CodeBlock code="sudo apt install fuse3" />
                </div>

                {/* Fedora */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">
                      Fedora / RHEL
                    </Badge>
                  </div>
                  <CodeBlock code="sudo dnf install fuse3" />
                </div>

                {/* Arch */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-xs">
                      Arch / Manjaro
                    </Badge>
                  </div>
                  <CodeBlock code="sudo pacman -S fuse3" />
                </div>

                {/* openSUSE */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                      openSUSE
                    </Badge>
                  </div>
                  <CodeBlock code="sudo zypper install fuse3" />
                </div>
              </div>
            </div>
          </div>

          {/* Step 2 - Install Wormhole */}
          <div className="relative pl-12">
            <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-wormhole-hunter flex items-center justify-center text-white font-bold text-sm">
              2
            </div>
            <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                Install Wormhole
              </h3>
              <p className="text-zinc-400 mb-6">
                Choose your preferred installation method:
              </p>

              {/* AppImage */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <Package className="w-5 h-5 text-wormhole-hunter-light" />
                  <span className="font-medium text-white">AppImage</span>
                  <Badge className="bg-wormhole-hunter/20 text-wormhole-hunter-light border-wormhole-hunter/30 text-xs">
                    Recommended
                  </Badge>
                </div>
                <p className="text-zinc-400 text-sm mb-3 ml-8">
                  Works on any Linux distribution. Download, make executable, and run.
                </p>
                <div className="ml-8 space-y-2">
                  <CodeBlock code="chmod +x Wormhole*.AppImage" />
                  <CodeBlock code="./Wormhole*.AppImage" />
                </div>
              </div>

              <div className="border-t border-zinc-800 my-6" />

              {/* .deb */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <Download className="w-5 h-5 text-zinc-400" />
                  <span className="font-medium text-white">.deb Package</span>
                </div>
                <p className="text-zinc-400 text-sm mb-3 ml-8">
                  For Debian-based distributions (Ubuntu, Mint, Pop!_OS, etc.)
                </p>
                <div className="ml-8">
                  <CodeBlock code="sudo dpkg -i Wormhole*.deb" />
                </div>
              </div>
            </div>
          </div>

          {/* Step 3 - Done */}
          <div className="relative pl-12">
            <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-green-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-white" />
            </div>
            <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                You&apos;re Ready!
              </h3>
              <p className="text-zinc-400 mb-4">
                Launch Wormhole from your application menu or run it from the terminal. The app will guide you through sharing your first folder or connecting to someone else&apos;s share.
              </p>
              <p className="text-sm text-zinc-500">
                <strong className="text-zinc-400">CLI users:</strong> The GUI app includes the CLI tools. Run <code className="text-wormhole-hunter-light bg-zinc-800 px-1.5 py-0.5 rounded">wormhole --help</code> after installation.
              </p>
            </div>
          </div>
        </div>

        {/* CLI-Only Installation */}
        <div className="mt-16 p-6 rounded-xl bg-zinc-900/30 border border-zinc-800">
          <div className="flex items-start gap-4">
            <Terminal className="w-6 h-6 text-zinc-500 flex-shrink-0" />
            <div>
              <h3 className="text-base font-semibold text-white mb-2">
                CLI-Only Installation
              </h3>
              <p className="text-zinc-400 text-sm mb-4">
                Prefer command-line tools without the GUI? Download the CLI binaries directly from GitHub releases or build from source.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:text-white" asChild>
                  <a href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`} target="_blank" rel="noopener noreferrer">
                    <Download className="w-4 h-4 mr-2" />
                    CLI Binary
                  </a>
                </Button>
                <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:text-white" asChild>
                  <a href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}#build-from-source`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Build from Source
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
              <Link href="/download/macos">
                macOS
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:text-white" asChild>
              <Link href="/download/windows">
                Windows
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
