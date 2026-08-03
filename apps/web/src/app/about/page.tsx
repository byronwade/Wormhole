import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "About — Open-source P2P folder mounts",
  description:
    "Wormhole is open-source peer-to-peer folder mounting for video editors, game developers, VFX artists, and engineers tired of cloud upload waits.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About Wormhole",
    description:
      "Built for creatives and developers who move huge files. Mount remote folders live—encrypted, free core, open source.",
    url: `${SITE_URL}/about`,
  },
};

export default function AboutPage() {
  return (
    <SiteShell active="about">
      <section className="site-section">
        <div className="site-section__intro" style={{ maxWidth: "40rem" }}>
          <h1 className="site-for-index__title">About Wormhole</h1>
          <p>
            File sharing should not mean uploading a copy of your life’s work to
            a stranger’s hard drive and waiting for the progress bar to finish.
          </p>
        </div>

        <div className="site-prose">
          <p>
            Wormhole mounts a remote folder as a local drive over a direct
            peer-to-peer connection. You share a code. They connect. The files
            stay on the machines that already own them.
          </p>
          <p>
            It’s built for a specific niche: video editors mounting render
            output, game developers sharing builds and art, VFX freelancers
            handing off shot trees, and developers who want a path—not a VPN
            ceremony.
          </p>
          <p>
            The stack is intentional: Rust, FUSE, QUIC, join-code PAKE. The
            project is open source under the MIT license. Inspect it, fork it,
            improve it.
          </p>
          <p>
            We’re not trying to replace every cloud. We’re trying to make “why
            am I uploading this again?” a question you stop asking.
          </p>
        </div>

        <div className="site-hero__cta" style={{ marginTop: "2.5rem" }}>
          <Link href="/download" className="site-btn">
            Download
          </Link>
          <Link href="/for" className="site-btn site-btn--ghost">
            Who it’s for
          </Link>
        </div>
      </section>
    </SiteShell>
  );
}
