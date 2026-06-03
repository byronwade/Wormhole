"use client";

import { Button } from "@/components/ui/button";
import {
  Monitor,
  Download,
  CheckCircle2,
  ExternalLink,
  AlertTriangle,
  Shield,
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

export default function WindowsDownloadPage() {
  const [release, setRelease] = useState<GitHubRelease | null>(null);
  const [installerAsset, setInstallerAsset] = useState<GitHubRelease["assets"][0] | null>(null);

  useEffect(() => {
    fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: GitHubRelease | null) => {
        if (data) {
          setRelease(data);
          const installer =
            data.assets.find((a) => a.name.toLowerCase().includes("-setup.exe")) ||
            data.assets.find((a) => a.name.toLowerCase().includes(".msi")) ||
            data.assets.find((a) => a.name.toLowerCase().includes(".exe"));
          setInstallerAsset(installer || null);
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
            <span className="text-zinc-400">Download for Windows</span>
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
            <Monitor className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">
            Wormhole for Windows
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
            <a href={installerAsset?.browser_download_url || `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`}>
              <Download className="w-5 h-5 mr-3" />
              Download for Windows
              {installerAsset && (
                <span className="ml-3 text-wormhole-hunter-light text-sm font-normal">
                  {formatBytes(installerAsset.size)}
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
                Download the Installer
              </h3>
              <p className="text-zinc-400">
                Click the download button above to get the Windows installer (.exe).
              </p>
            </div>
          </div>

          {/* Step 2 - SmartScreen */}
          <div className="relative pl-12">
            <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-wormhole-hunter flex items-center justify-center text-white font-bold text-sm">
              2
            </div>
            <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                Handle SmartScreen Warning
              </h3>
              <p className="text-zinc-400 mb-6">
                Windows may show:{" "}
                <span className="text-blue-400 font-medium">
                  &quot;Windows protected your PC&quot;
                </span>
              </p>

              <div className="flex items-center gap-3 mb-4">
                <MousePointerClick className="w-5 h-5 text-blue-400" />
                <span className="font-medium text-white">How to proceed:</span>
              </div>

              <div className="ml-8 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-xs text-blue-400 font-bold">
                    1
                  </div>
                  <div>
                    <p className="text-zinc-300">
                      Click <strong className="text-white">&quot;More info&quot;</strong>
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      This link appears below the warning message
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-xs text-blue-400 font-bold">
                    2
                  </div>
                  <div>
                    <p className="text-zinc-300">
                      Click <strong className="text-white">&quot;Run anyway&quot;</strong>
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      This button appears after clicking &quot;More info&quot;
                    </p>
                  </div>
                </div>
              </div>

              <p className="mt-6 text-xs text-zinc-500">
                SmartScreen warns about new software that isn&apos;t widely downloaded yet. This warning will disappear as more people use Wormhole.
              </p>
            </div>
          </div>

          {/* Step 3 - WinFSP */}
          <div className="relative pl-12">
            <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-wormhole-hunter flex items-center justify-center text-white font-bold text-sm">
              3
            </div>
            <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                Install WinFSP
                <span className="ml-2 text-sm font-normal text-zinc-500">(Required)</span>
              </h3>
              <p className="text-zinc-400 mb-6">
                WinFSP enables Wormhole to mount remote folders as local drives. One-time setup.
              </p>

              <div className="flex flex-wrap items-center gap-3 mb-4">
                <Button className="bg-blue-600 hover:bg-blue-700" asChild>
                  <a href="https://winfsp.dev/rel/" target="_blank" rel="noopener noreferrer">
                    <Download className="w-4 h-4 mr-2" />
                    Download WinFSP
                  </a>
                </Button>
                <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:text-white" asChild>
                  <a href="https://winfsp.dev/" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    WinFSP Website
                  </a>
                </Button>
              </div>

              <p className="text-sm text-zinc-500">
                WinFSP (Windows File System Proxy) is an open-source tool similar to FUSE on Linux. It&apos;s widely used and trusted.
              </p>
            </div>
          </div>

          {/* Step 4 - Run Installer */}
          <div className="relative pl-12">
            <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-wormhole-hunter flex items-center justify-center text-white font-bold text-sm">
              4
            </div>
            <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                Run the Wormhole Installer
              </h3>
              <p className="text-zinc-400">
                Double-click the downloaded installer and follow the prompts. Wormhole will be installed and added to your Start Menu.
              </p>
            </div>
          </div>

          {/* Step 5 - Done */}
          <div className="relative pl-12">
            <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-green-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-white" />
            </div>
            <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                You&apos;re Ready!
              </h3>
              <p className="text-zinc-400">
                Launch Wormhole from the Start Menu. The app will guide you through sharing your first folder or connecting to someone else&apos;s share.
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
                Windows code signing certificates cost <strong className="text-zinc-300">$200-400/year</strong>. As a free, open-source project, we can&apos;t justify that cost. The entire codebase is public and all releases are built by GitHub Actions with full transparency.
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
              <Link href="/download/macos">
                macOS
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
