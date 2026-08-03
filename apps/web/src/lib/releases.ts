/** GitHub release helpers for download pages and install docs. */

export const GITHUB_OWNER = "byronwade";
export const GITHUB_REPO = "Wormhole";
export const RELEASES_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
export const RELEASES_PAGE = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;

export type ReleaseAsset = {
  name: string;
  browser_download_url: string;
  size: number;
};

export type GitHubRelease = {
  tag_name: string;
  html_url: string;
  assets: ReleaseAsset[];
};

/** Hardcoded fallback so download buttons still work if the GitHub API is rate-limited. */
export const FALLBACK_RELEASE: GitHubRelease = {
  tag_name: "v0.1.0",
  html_url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/v0.1.0`,
  assets: [
    {
      name: "Wormhole_0.1.0_aarch64.dmg",
      browser_download_url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v0.1.0/Wormhole_0.1.0_aarch64.dmg`,
      size: 4834283,
    },
    {
      name: "Wormhole_0.1.0_x64-setup.exe",
      browser_download_url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v0.1.0/Wormhole_0.1.0_x64-setup.exe`,
      size: 4100915,
    },
    {
      name: "Wormhole_0.1.0_x64_en-US.msi",
      browser_download_url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v0.1.0/Wormhole_0.1.0_x64_en-US.msi`,
      size: 5902336,
    },
    {
      name: "Wormhole_0.1.0_amd64.AppImage",
      browser_download_url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v0.1.0/Wormhole_0.1.0_amd64.AppImage`,
      size: 83864056,
    },
    {
      name: "Wormhole_0.1.0_amd64.deb",
      browser_download_url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v0.1.0/Wormhole_0.1.0_amd64.deb`,
      size: 6424798,
    },
    {
      name: "Wormhole-0.1.0-linux-x64.tar.gz",
      browser_download_url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v0.1.0/Wormhole-0.1.0-linux-x64.tar.gz`,
      size: 7408386,
    },
    {
      name: "Wormhole-0.1.0-linux-arm64.tar.gz",
      browser_download_url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v0.1.0/Wormhole-0.1.0-linux-arm64.tar.gz`,
      size: 1910060,
    },
    {
      name: "Wormhole-0.1.0-macos-arm64.tar.gz",
      browser_download_url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v0.1.0/Wormhole-0.1.0-macos-arm64.tar.gz`,
      size: 1761605,
    },
    {
      name: "Wormhole-0.1.0-macos-x64.tar.gz",
      browser_download_url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v0.1.0/Wormhole-0.1.0-macos-x64.tar.gz`,
      size: 1907580,
    },
    {
      name: "Wormhole-0.1.0-windows-x64.zip",
      browser_download_url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v0.1.0/Wormhole-0.1.0-windows-x64.zip`,
      size: 7031496,
    },
  ],
};

export type DownloadPlatform = "macos" | "windows" | "linux";

function lower(name: string): string {
  return name.toLowerCase();
}

/** Desktop installers preferred for the primary CTA. */
export function isDesktopAsset(platform: DownloadPlatform, name: string): boolean {
  const n = lower(name);
  switch (platform) {
    case "macos":
      return n.endsWith(".dmg");
    case "windows":
      return n.includes("-setup.exe") || n.endsWith(".msi") || n.endsWith(".exe");
    case "linux":
      return n.endsWith(".appimage") || n.endsWith(".deb") || n.endsWith(".rpm");
  }
}

/** CLI archives shown as secondary downloads. */
export function isCliAsset(platform: DownloadPlatform, name: string): boolean {
  const n = lower(name);
  switch (platform) {
    case "macos":
      return n.includes("-macos-") && (n.endsWith(".tar.gz") || n.endsWith(".tgz"));
    case "windows":
      return n.includes("-windows-") && n.endsWith(".zip");
    case "linux":
      return n.includes("-linux-") && (n.endsWith(".tar.gz") || n.endsWith(".tgz"));
  }
}

function rankDesktop(platform: DownloadPlatform, name: string): number {
  const n = lower(name);
  if (platform === "windows") {
    if (n.includes("-setup.exe")) return 0;
    if (n.endsWith(".msi")) return 1;
    return 2;
  }
  if (platform === "linux") {
    if (n.endsWith(".appimage")) return 0;
    if (n.endsWith(".deb")) return 1;
    if (n.endsWith(".rpm")) return 2;
    return 3;
  }
  // macOS: prefer aarch64/universal, then any dmg
  if (n.includes("universal")) return 0;
  if (n.includes("aarch64") || n.includes("arm64")) return 1;
  return 2;
}

export function desktopAssets(release: GitHubRelease, platform: DownloadPlatform): ReleaseAsset[] {
  return release.assets
    .filter((a) => isDesktopAsset(platform, a.name))
    .sort((a, b) => rankDesktop(platform, a.name) - rankDesktop(platform, b.name));
}

export function cliAssets(release: GitHubRelease, platform: DownloadPlatform): ReleaseAsset[] {
  return release.assets.filter((a) => isCliAsset(platform, a.name));
}

export function primaryDesktopAsset(
  release: GitHubRelease,
  platform: DownloadPlatform,
): ReleaseAsset | null {
  return desktopAssets(release, platform)[0] ?? null;
}

export async function fetchLatestRelease(): Promise<GitHubRelease> {
  try {
    const res = await fetch(RELEASES_API, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Wormhole-Web",
      },
      next: { revalidate: 300 },
    });
    if (!res.ok) return FALLBACK_RELEASE;
    const data = (await res.json()) as GitHubRelease;
    if (!data?.assets?.length) return FALLBACK_RELEASE;
    return data;
  } catch {
    return FALLBACK_RELEASE;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0\u00A0B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)}\u00A0${sizes[i]}`;
}
