import Link from "next/link";
import { Apple, ArrowRight, Monitor, Terminal } from "lucide-react";
import {
  fetchLatestRelease,
  formatBytes,
  primaryDesktopAsset,
  type DownloadPlatform,
} from "@/lib/releases";
import { DownloadHubClient } from "@/components/download-hub-client";

const platforms: {
  id: DownloadPlatform;
  href: string;
  title: string;
  blurb: string;
  Icon: typeof Apple;
}[] = [
  {
    id: "macos",
    href: "/download/macos",
    title: "macOS",
    blurb: "DMG for Apple Silicon. Requires macFUSE for mounts.",
    Icon: Apple,
  },
  {
    id: "windows",
    href: "/download/windows",
    title: "Windows",
    blurb: "setup.exe installer. Requires WinFSP for mounts.",
    Icon: Monitor,
  },
  {
    id: "linux",
    href: "/download/linux",
    title: "Linux",
    blurb: "AppImage or .deb. Needs FUSE 3.",
    Icon: Terminal,
  },
];

export async function DownloadHub() {
  const release = await fetchLatestRelease();
  const primaries = Object.fromEntries(
    platforms.map((p) => [p.id, primaryDesktopAsset(release, p.id)]),
  ) as Record<DownloadPlatform, ReturnType<typeof primaryDesktopAsset>>;

  return (
    <>
      <DownloadHubClient
        releaseTag={release.tag_name}
        platforms={platforms.map((p) => ({
          id: p.id,
          href: p.href,
          title: p.title,
          blurb: p.blurb,
          downloadUrl: primaries[p.id]?.browser_download_url ?? p.href,
          downloadLabel: primaries[p.id]
            ? `Download ${primaries[p.id]!.name}`
            : `Open ${p.title} downloads`,
          sizeLabel: primaries[p.id] ? formatBytes(primaries[p.id]!.size) : null,
        }))}
      />

      <div className="docs-home__grid" style={{ maxWidth: "40rem", marginTop: "1.5rem" }}>
        {platforms.map((p) => {
          const asset = primaries[p.id];
          return (
            <div key={p.href} className="docs-home__card">
              <h2>
                <p.Icon
                  className="size-4"
                  aria-hidden="true"
                  style={{ display: "inline", marginRight: "0.4rem", verticalAlign: "-0.1em" }}
                />
                {p.title}
              </h2>
              <p>{p.blurb}</p>
              {asset ? (
                <p className="dl-card__asset">
                  <a href={asset.browser_download_url} className="dl-card__link">
                    <span>{asset.name}</span>
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </a>
                  <span className="docs-muted dl-card__meta">
                    {formatBytes(asset.size)} · {release.tag_name}
                  </span>
                </p>
              ) : (
                <p className="dl-card__asset">
                  <Link href={p.href} className="dl-card__link">
                    See options
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Link>
                </p>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
