import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Download Wormhole",
  description: "Get Wormhole for macOS, Windows, or Linux.",
};

const platforms = [
  {
    href: "/download/macos",
    title: "macOS",
    blurb: "DMG for Apple Silicon and Intel. Requires macFUSE for mounts.",
  },
  {
    href: "/download/windows",
    title: "Windows",
    blurb: "Installer build. Requires WinFSP for mounts.",
  },
  {
    href: "/download/linux",
    title: "Linux",
    blurb: "AppImage, .deb, or .rpm. Needs FUSE 3.",
  },
];

export default function DownloadIndexPage() {
  return (
    <SiteShell>
      <section className="site-section">
        <div className="site-section__intro" style={{ maxWidth: "40rem" }}>
          <h2>Download</h2>
          <p>
            Pick your platform. Same product: share a folder, mount it elsewhere.
          </p>
        </div>

        <div className="docs-home__grid" style={{ maxWidth: "40rem" }}>
          {platforms.map((p) => (
            <Link key={p.href} href={p.href} className="docs-home__card">
              <h2>{p.title}</h2>
              <p>{p.blurb}</p>
            </Link>
          ))}
        </div>

        <p className="docs-muted" style={{ maxWidth: "40rem", marginTop: "2rem" }}>
          Prefer the terminal? See{" "}
          <Link href="/docs/installation">installation</Link> for CLI and source
          builds, or jump to the <Link href="/docs/quickstart">quickstart</Link>.
        </p>
      </section>
    </SiteShell>
  );
}
