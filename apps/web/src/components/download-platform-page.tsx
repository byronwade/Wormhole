"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Apple, ArrowRight, Check, Copy, Monitor, Terminal } from "lucide-react";
import { SiteShell } from "@/components/site-shell";

type Platform = "macos" | "windows" | "linux";

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  assets: {
    name: string;
    browser_download_url: string;
    size: number;
  }[];
}

const GITHUB = "https://api.github.com/repos/byronwade/Wormhole/releases/latest";

const copy: Record<
  Platform,
  {
    title: string;
    icon: typeof Apple;
    match: (name: string) => boolean;
    install: string[];
    notes: string[];
    other: { label: string; href: string }[];
  }
> = {
  macos: {
    title: "Download for macOS",
    icon: Apple,
    match: (n) => n.includes(".dmg"),
    install: [
      "Open the .dmg and drag Wormhole into Applications.",
      "Install macFUSE if prompted (required for mounts).",
      "Launch Wormhole and share a folder.",
    ],
    notes: [
      "Apple Silicon and Intel builds ship as a universal DMG when available.",
      "First launch may require allowing the app in System Settings → Privacy & Security.",
    ],
    other: [
      { label: "Windows", href: "/download/windows" },
      { label: "Linux", href: "/download/linux" },
    ],
  },
  windows: {
    title: "Download for Windows",
    icon: Monitor,
    match: (n) => n.includes("-setup.exe") || n.endsWith(".msi") || n.endsWith(".exe"),
    install: [
      "Run the installer and follow the prompts.",
      "Install WinFSP if prompted (required for mounts).",
      "Open Wormhole from the Start menu.",
    ],
    notes: [
      "Prefer the setup.exe when available.",
      "Windows Defender may scan the first run; that’s expected for new binaries.",
    ],
    other: [
      { label: "macOS", href: "/download/macos" },
      { label: "Linux", href: "/download/linux" },
    ],
  },
  linux: {
    title: "Download for Linux",
    icon: Terminal,
    match: (n) =>
      n.includes(".appimage") || n.endsWith(".deb") || n.endsWith(".rpm"),
    install: [
      "Prefer the AppImage for a quick try, or install the .deb / .rpm for your distro.",
      "Ensure FUSE 3 is available (`libfuse3`).",
      "Run Wormhole and share a folder.",
    ],
    notes: [
      "CLI users can also build from source with Cargo.",
      "See docs for distribution-specific notes.",
    ],
    other: [
      { label: "macOS", href: "/download/macos" },
      { label: "Windows", href: "/download/windows" },
    ],
  },
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0\u00A0B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)}\u00A0${sizes[i]}`;
}

function CopyLine({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="dl-copy">
      <code>{value}</code>
      <button
        type="button"
        aria-label={copied ? "Copied" : "Copy"}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            /* ignore */
          }
        }}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

export function DownloadPlatformPage({ platform }: { platform: Platform }) {
  const meta = copy[platform];
  const Icon = meta.icon;
  const [release, setRelease] = useState<GitHubRelease | null>(null);
  const [asset, setAsset] = useState<GitHubRelease["assets"][0] | null>(null);

  useEffect(() => {
    const match = copy[platform].match;
    fetch(GITHUB)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: GitHubRelease | null) => {
        if (!data) return;
        setRelease(data);
        const found = data.assets.find((a) => match(a.name.toLowerCase())) ?? null;
        setAsset(found);
      })
      .catch(() => {});
  }, [platform]);

  const href =
    asset?.browser_download_url ??
    release?.html_url ??
    "https://github.com/byronwade/Wormhole/releases";

  return (
    <SiteShell>
      <section className="site-section dl-page">
        <div className="site-section__intro">
          <p className="dl-kicker">
            <Icon className="size-4" aria-hidden="true" />
            {platform === "macos" ? "macOS" : platform === "windows" ? "Windows" : "Linux"}
          </p>
          <h2>{meta.title}</h2>
          <p>Get the desktop app, share a folder, send a code.</p>
        </div>

        <div className="dl-actions">
          <a href={href} className="site-btn" target="_blank" rel="noopener noreferrer">
            <Icon className="size-4" aria-hidden="true" />
            <span>
              {asset
                ? `Download ${asset.name}`
                : release
                  ? `Get ${release.tag_name}`
                  : "View releases"}
            </span>
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
          {asset && (
            <span className="dl-meta">
              {formatBytes(asset.size)}
              {release ? ` · ${release.tag_name}` : ""}
            </span>
          )}
        </div>

        <ol className="site-steps dl-steps">
          {meta.install.map((step, i) => (
            <li key={step}>
              <span className="site-steps__n" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3>Step {i + 1}</h3>
                <p>{step}</p>
              </div>
            </li>
          ))}
        </ol>

        {platform === "linux" && (
          <div className="dl-cli">
            <h3>From source</h3>
            <CopyLine value="cargo install --git https://github.com/byronwade/Wormhole teleport-daemon" />
          </div>
        )}

        <ul className="dl-notes">
          {meta.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>

        <p className="dl-others">
          Also available for{" "}
          {meta.other.map((o, i) => (
            <span key={o.href}>
              {i > 0 ? (i === meta.other.length - 1 ? ", and " : ", ") : ""}
              <Link href={o.href}>{o.label}</Link>
            </span>
          ))}
          . Need help? See the{" "}
          <Link href="/docs/installation">installation docs</Link>.
        </p>
      </section>
    </SiteShell>
  );
}
