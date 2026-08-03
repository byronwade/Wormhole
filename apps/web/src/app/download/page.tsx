import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { DownloadHub } from "@/components/download-hub";

export const metadata: Metadata = {
  title: "Download",
  description: "Get Wormhole for macOS, Windows, or Linux.",
  alternates: { canonical: "/download" },
};

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

        <DownloadHub />

        <p className="docs-muted" style={{ maxWidth: "40rem", marginTop: "2rem" }}>
          Prefer the terminal? See{" "}
          <Link href="/docs/installation">installation</Link> for CLI and source
          builds, or jump to the <Link href="/docs/quickstart">quickstart</Link>.
        </p>
      </section>
    </SiteShell>
  );
}
