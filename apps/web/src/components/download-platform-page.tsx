import Link from "next/link";
import { Apple, ArrowRight, Monitor, Terminal } from "lucide-react";
import { SiteShell } from "@/components/site-shell";
import { CopyLine } from "@/components/copy-line";
import {
  cliAssets,
  desktopAssets,
  fetchLatestRelease,
  formatBytes,
  primaryDesktopAsset,
  RELEASES_PAGE,
  type DownloadPlatform,
} from "@/lib/releases";

const copy: Record<
  DownloadPlatform,
  {
    title: string;
    icon: typeof Apple;
    install: string[];
    notes: string[];
    other: { label: string; href: string }[];
  }
> = {
  macos: {
    title: "Download for macOS",
    icon: Apple,
    install: [
      "Open the .dmg and drag Wormhole into Applications.",
      "Install macFUSE if prompted (required for mounts): brew install --cask macfuse",
      "Launch Wormhole and share a folder.",
    ],
    notes: [
      "The desktop DMG is the full product on macOS (CLI tarballs are signal-server only in CI).",
      "First launch may require allowing the app in System Settings → Privacy & Security.",
      "If Gatekeeper blocks it: right-click → Open, or run xattr -cr /Applications/Wormhole.app",
    ],
    other: [
      { label: "Windows", href: "/download/windows" },
      { label: "Linux", href: "/download/linux" },
    ],
  },
  windows: {
    title: "Download for Windows",
    icon: Monitor,
    install: [
      "Run the setup.exe installer and follow the prompts.",
      "Install WinFSP if prompted (required for mounts): https://winfsp.dev/rel/",
      "Open Wormhole from the Start menu.",
    ],
    notes: [
      "Prefer setup.exe. MSI is also available below.",
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
    install: [
      "Prefer the AppImage for a quick try, or install the .deb for Debian/Ubuntu.",
      "Ensure FUSE 3 is available (sudo apt install fuse3).",
      "Run Wormhole and share a folder.",
    ],
    notes: [
      "CLI archives include wormhole, wormhole-mount, and wormhole-signal.",
      "Or install with: curl -fsSL https://raw.githubusercontent.com/byronwade/Wormhole/main/scripts/install.sh | bash",
    ],
    other: [
      { label: "macOS", href: "/download/macos" },
      { label: "Windows", href: "/download/windows" },
    ],
  },
};

export async function DownloadPlatformPage({
  platform,
}: {
  platform: DownloadPlatform;
}) {
  const meta = copy[platform];
  const Icon = meta.icon;
  const release = await fetchLatestRelease();
  const desktop = desktopAssets(release, platform);
  const cli = cliAssets(release, platform);
  const primary = primaryDesktopAsset(release, platform);
  const primaryHref = primary?.browser_download_url ?? release.html_url ?? RELEASES_PAGE;

  return (
    <SiteShell>
      <section className="site-section dl-page">
        <div className="site-section__intro">
          <p className="dl-kicker">
            <Icon className="size-4" aria-hidden="true" />
            {platform === "macos" ? "macOS" : platform === "windows" ? "Windows" : "Linux"}
          </p>
          <h1 className="site-for-index__title">{meta.title}</h1>
          <p>
            Direct downloads from GitHub Releases ({release.tag_name}). Real
            installers—not placeholders.
          </p>
        </div>

        <div className="dl-actions">
          <a href={primaryHref} className="site-btn" rel="noopener noreferrer">
            <Icon className="size-4" aria-hidden="true" />
            <span>
              {primary ? `Download ${primary.name}` : `View ${release.tag_name} releases`}
            </span>
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
          {primary && (
            <span className="dl-meta">
              {formatBytes(primary.size)} · {release.tag_name}
            </span>
          )}
        </div>

        {desktop.length > 1 && (
          <div className="dl-asset-list">
            <h2>All desktop packages</h2>
            <ul>
              {desktop.map((a) => (
                <li key={a.name}>
                  <a href={a.browser_download_url} rel="noopener noreferrer">
                    {a.name}
                  </a>
                  <span>{formatBytes(a.size)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {cli.length > 0 && (
          <div className="dl-asset-list">
            <h2>CLI packages</h2>
            <ul>
              {cli.map((a) => (
                <li key={a.name}>
                  <a href={a.browser_download_url} rel="noopener noreferrer">
                    {a.name}
                  </a>
                  <span>{formatBytes(a.size)}</span>
                </li>
              ))}
            </ul>
            {platform === "macos" && (
              <p className="docs-muted">
                macOS CLI archives currently ship the signal server only. Use the
                DMG above for full host/mount.
              </p>
            )}
          </div>
        )}

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
            <h3>Install script</h3>
            <CopyLine value="curl -fsSL https://raw.githubusercontent.com/byronwade/Wormhole/main/scripts/install.sh | bash" />
          </div>
        )}

        <ul className="dl-notes">
          {meta.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
          <li>
            All assets:{" "}
            <a href={release.html_url} rel="noopener noreferrer">
              {release.tag_name} on GitHub
            </a>
          </li>
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
