import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { DownloadHub } from "@/components/download-hub";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Download — Mount folders on Mac, Windows, Linux",
  description:
    "Download Wormhole for macOS, Windows, or Linux. Free P2P folder mounting for video editors, game developers, and VFX teams.",
  alternates: { canonical: "/download" },
  openGraph: {
    title: "Download Wormhole",
    description:
      "Get the app. Share a code. Mount a remote project as a local drive—no cloud upload.",
    url: `${SITE_URL}/download`,
  },
};

export default async function DownloadIndexPage() {
  return (
    <SiteShell>
      <section className="site-section">
        <div className="site-section__intro" style={{ maxWidth: "40rem" }}>
          <h1 className="site-for-index__title">Download Wormhole</h1>
          <p>
            Real installers from GitHub Releases—DMG, setup.exe, AppImage, and
            CLI archives. Share a folder with a code, mount it elsewhere, keep
            working.
          </p>
        </div>

        <DownloadHub />

        <p className="docs-muted" style={{ maxWidth: "40rem", marginTop: "2rem" }}>
          Prefer the terminal? See{" "}
          <Link href="/docs/installation">installation</Link> for CLI and source
          builds, or jump to the <Link href="/docs/quickstart">quickstart</Link>.
          Not sure if it’s for you?{" "}
          <Link href="/for">See who Wormhole is built for</Link>.
        </p>
      </section>
    </SiteShell>
  );
}
