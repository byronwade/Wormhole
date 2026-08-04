/** Canonical marketing site URL (custom domain). */
export const SITE_URL = "https://wormhole.byronwade.com";

export const SITE_NAME = "Wormhole";

export const TAGLINE = "Mount Any Folder. Any Computer. No Setup.";

/** Default meta description — niche + pain, under ~160 chars. */
export const DEFAULT_DESCRIPTION =
  "Mount remote project folders as a local drive over P2P. Built for video editors, game developers, and VFX teams who are done waiting on cloud uploads.";

/** Primary SEO keywords for creative + programming niches. */
export const SEO_KEYWORDS = [
  "mount remote folder",
  "P2P file sharing",
  "peer to peer network drive",
  "Syncthing alternative",
  "LocalSend alternative for folders",
  "AirDrop for Windows Linux",
  "Dropbox alternative for video",
  "Frame.io alternative",
  "mount render folder",
  "share large video files",
  "game build sharing",
  "VFX file transfer",
  "encrypted file share",
  "join code file sharing",
  "FUSE network drive",
  "QUIC file transfer",
  "remote project mount for editors",
  "P2P for game developers",
  "self hosted file share",
  "no cloud upload file sharing",
] as const;

export type NicheSlug =
  | "video-editors"
  | "game-developers"
  | "vfx-artists"
  | "developers";

export type NichePage = {
  slug: NicheSlug;
  navLabel: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  headline: string;
  lede: string;
  pains: { title: string; body: string }[];
  wins: { title: string; body: string }[];
  keywords: string[];
};

export const NICHES: NichePage[] = [
  {
    slug: "video-editors",
    navLabel: "Video editors",
    title: "For video editors",
    metaTitle: "Mount Remote Renders Instantly — Wormhole for Video Editors",
    metaDescription:
      "Stop waiting 30 minutes to upload a 50GB render. Mount your render farm or collaborator’s folder as a local drive and edit while files finish.",
    eyebrow: "For editors",
    headline: "Edit the render while it’s still landing.",
    lede: "4K is 20+ GB an hour. Cloud upload turns that into a coffee break. Wormhole mounts the remote folder live—scrub playhead-first, no Frame.io tax, no Drive copy wars.",
    pains: [
      {
        title: "Upload bars eat the day",
        body: "WeTransfer and Dropbox make you wait for a full copy before anyone else can work.",
      },
      {
        title: "Review tools bill per seat",
        body: "Frame.io is great until the invoice shows up. You already own the storage.",
      },
      {
        title: "“Final_v7_REAL” chaos",
        body: "Multiple cloud copies mean nobody knows which timeline is truth.",
      },
    ],
    wins: [
      {
        title: "Mount the farm output",
        body: "Open the render machine’s folder as a drive. Scrub as frames appear.",
      },
      {
        title: "Share a code, not an account",
        body: "Send 7KJM-XBCD. They mount. Done. No email invites.",
      },
      {
        title: "$0 core forever",
        body: "P2P means no cloud storage rent on files that already live on your disks.",
      },
    ],
    keywords: [
      "video editor file sharing",
      "mount render farm folder",
      "DaVinci Resolve remote media",
      "Premiere Pro network drive",
      "share large video files P2P",
      "Frame.io alternative free",
    ],
  },
  {
    slug: "game-developers",
    navLabel: "Game developers",
    title: "For game developers",
    metaTitle: "Share Builds & Assets Instantly — Wormhole for Game Developers",
    metaDescription:
      "Mount build-server output and art drops as a local drive. Cross-platform P2P sharing for indie teams tired of Perforce overhead and Dropbox lag.",
    eyebrow: "For game teams",
    headline: "Mount the build. Test every platform.",
    lede: "Art drops and nightly builds shouldn’t need a cloud detour. Wormhole mounts your build machine or art share as a drive—Mac, Windows, Linux—with a join code.",
    pains: [
      {
        title: "Builds are huge, sync is slow",
        body: "Copying a multi-GB build through the cloud burns CI minutes and patience.",
      },
      {
        title: "Perforce is overkill for assets",
        body: "You want a live share, not a VCS ceremony for texture packs.",
      },
      {
        title: "Cross-platform friction",
        body: "Art on Mac, build on Windows, QA on Linux—cloud folders fight all three.",
      },
    ],
    wins: [
      {
        title: "Mount build output",
        body: "QA mounts the CI artifact folder and runs the binary without a second download.",
      },
      {
        title: "Asset mesh, not zip spam",
        body: "Content-addressed chunks mean peers that already have a blob serve it.",
      },
      {
        title: "CLI + GUI",
        body: "wormhole host / wormhole mount for pipelines; desktop app for artists.",
      },
    ],
    keywords: [
      "game developer file sharing",
      "share game builds P2P",
      "mount build server folder",
      "Perforce alternative assets",
      "indie game asset sync",
      "cross platform game builds",
    ],
  },
  {
    slug: "vfx-artists",
    navLabel: "VFX artists",
    title: "For VFX artists",
    metaTitle: "P2P Project Mount for VFX — Wormhole for Studios & Freelancers",
    metaDescription:
      "Live-mount plates, caches, and comps across machines. Encrypted peer-to-peer for VFX freelancers and small studios who need speed without cloud rent.",
    eyebrow: "For VFX",
    headline: "One live library. Many doorways.",
    lede: "Plates, EXRs, and sim caches don’t belong in a consumer sync folder. Wormhole opens a private tunnel and mounts the job—encrypted, playhead-aware, no third-party disk.",
    pains: [
      {
        title: "Caches don’t fit Dropbox",
        body: "Hundreds of gigs of intermediate data make cloud sync a non-starter.",
      },
      {
        title: "Vendor handoff is painful",
        body: "FTP, Aspera, and “drive links” turn every revision into logistics.",
      },
      {
        title: "Privacy matters",
        body: "Client NDAs don’t love mystery cloud regions.",
      },
    ],
    wins: [
      {
        title: "Mount the shot tree",
        body: "Compers see the same aperture the lighter does—live, not mirrored.",
      },
      {
        title: "E2E encrypted sessions",
        body: "QUIC + PAKE join codes. Files never park on our servers.",
      },
      {
        title: "Studio-friendly free tier",
        body: "Start free. Add Team when you need policies and seats.",
      },
    ],
    keywords: [
      "VFX file transfer",
      "mount EXR sequence",
      "VFX collaboration tool",
      "encrypted media share",
      "Aspera alternative small studio",
      "peer to peer VFX",
    ],
  },
  {
    slug: "developers",
    navLabel: "Developers",
    title: "For developers",
    metaTitle: "Mount Remote Folders over QUIC — Wormhole for Developers",
    metaDescription:
      "Mount prod logs, datasets, and ML outputs as a local path. Open-source P2P network drive with join codes, CLI, and FUSE—no VPN theater.",
    eyebrow: "For developers",
    headline: "A network drive that doesn’t need a VPN.",
    lede: "SSH + rsync scripts get you halfway. Wormhole mounts a remote path over encrypted QUIC with a join code—grep prod logs locally, share model outputs, wire it into CI.",
    pains: [
      {
        title: "SSH tunnels are brittle",
        body: "Port forwards die. SFTP is slow. You just want a path.",
      },
      {
        title: "Syncthing config tax",
        body: "Powerful, but device IDs and folders are a fifteen-step ritual.",
      },
      {
        title: "Don’t put prod in S3",
        body: "Some data should stay on the box that already has it.",
      },
    ],
    wins: [
      {
        title: "Mount /var/log or the dataset",
        body: "Local tooling, remote bytes. Prefetch keeps sequential reads hot.",
      },
      {
        title: "CLI-first, MCP-ready",
        body: "Script host/mount/status. Optional MCP server for agent workflows.",
      },
      {
        title: "Open source MIT",
        body: "Inspect the protocol. Self-host the signal server. No black box.",
      },
    ],
    keywords: [
      "mount remote directory",
      "FUSE network drive",
      "QUIC file transfer",
      "Syncthing alternative developers",
      "P2P mount folder CLI",
      "self hosted peer to peer file share",
    ],
  },
];

export function nicheBySlug(slug: string): NichePage | undefined {
  return NICHES.find((n) => n.slug === slug);
}
