import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteShell } from "@/components/site-shell";
import { NICHES, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Built for Creatives & Developers",
  description:
    "Wormhole for video editors, game developers, VFX artists, and engineers—mount remote folders as a local drive over P2P.",
  alternates: { canonical: "/for" },
  openGraph: {
    title: "Wormhole — Built for Creatives & Developers",
    description:
      "Niche landing pages for editors, game teams, VFX, and developers who need live folder mounts—not cloud copies.",
    url: `${SITE_URL}/for`,
  },
};

export default function ForIndexPage() {
  return (
    <SiteShell>
      <section className="site-section">
        <div className="site-section__intro" style={{ maxWidth: "40rem" }}>
          <h1 className="site-for-index__title">Who Wormhole is for</h1>
          <p>
            Not another generic sync app. A live project mount for people who
            move big files and hate waiting on the cloud.
          </p>
        </div>
        <ul className="site-audience-list">
          {NICHES.map((n) => (
            <li key={n.slug}>
              <Link href={`/for/${n.slug}`}>
                <span>
                  <strong>{n.navLabel}</strong>
                  <em>{n.lede}</em>
                </span>
                <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </SiteShell>
  );
}
