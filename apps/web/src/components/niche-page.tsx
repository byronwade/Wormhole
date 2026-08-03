import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteShell } from "@/components/site-shell";
import { JsonLd } from "@/components/json-ld";
import { NICHES, SITE_URL, type NichePage } from "@/lib/site";

export function NicheMarketingPage({ niche }: { niche: NichePage }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: niche.metaTitle,
    description: niche.metaDescription,
    url: `${SITE_URL}/for/${niche.slug}`,
    isPartOf: {
      "@type": "WebSite",
      name: "Wormhole",
      url: SITE_URL,
    },
    about: {
      "@type": "SoftwareApplication",
      name: "Wormhole",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "macOS, Windows, Linux",
    },
  };

  return (
    <SiteShell>
      <JsonLd data={jsonLd} />
      <section className="site-niche-hero">
        <p className="site-niche-hero__eyebrow">{niche.eyebrow}</p>
        <h1>{niche.headline}</h1>
        <p className="site-niche-hero__lede">{niche.lede}</p>
        <div className="site-hero__cta">
          <Link href="/download" className="site-btn">
            Download free
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link href="/docs/quickstart" className="site-btn site-btn--ghost">
            Quick start
          </Link>
        </div>
      </section>

      <section className="site-section">
        <div className="site-section__intro">
          <h2>The pain you already know</h2>
          <p>If this sounds familiar, Wormhole was built for your desk.</p>
        </div>
        <div className="site-niche-grid">
          {niche.pains.map((p) => (
            <article key={p.title} className="site-niche-item site-niche-item--pain">
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="site-section site-section--band">
        <div className="site-section__intro">
          <h2>What changes with Wormhole</h2>
          <p>Share a code. Mount the folder. Keep working.</p>
        </div>
        <div className="site-niche-grid site-section--band-inner">
          {niche.wins.map((w) => (
            <article key={w.title} className="site-niche-item">
              <h3>{w.title}</h3>
              <p>{w.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="site-section">
        <div className="site-section__intro">
          <h2>Also built for</h2>
          <p>Same product. Different desks. Pick your lane.</p>
        </div>
        <ul className="site-audience-list">
          {NICHES.filter((n) => n.slug !== niche.slug).map((n) => (
            <li key={n.slug}>
              <Link href={`/for/${n.slug}`}>
                <span>{n.navLabel}</span>
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="site-section site-cta">
        <h2>Mount the folder. Skip the upload.</h2>
        <p>Free core. Open source. End-to-end encrypted.</p>
        <div className="site-hero__cta">
          <Link href="/download" className="site-btn">
            Download Wormhole
          </Link>
          <Link href="/pricing" className="site-btn site-btn--ghost">
            See pricing
          </Link>
        </div>
      </section>
    </SiteShell>
  );
}
