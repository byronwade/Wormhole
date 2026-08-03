import Link from "next/link";
import { SiteShell } from "@/components/site-shell";

export default function NotFound() {
  return (
    <SiteShell>
      <section className="site-section">
        <div className="site-section__intro" style={{ maxWidth: "36rem" }}>
          <p className="dl-kicker">404</p>
          <h2>Page not found</h2>
          <p>
            That URL isn’t on this site. Try the docs, downloads, or head home.
          </p>
        </div>
        <div className="dl-actions">
          <Link href="/" className="site-btn">
            Home
          </Link>
          <Link href="/docs" className="site-btn site-btn--ghost">
            Docs
          </Link>
          <Link href="/download" className="site-link-quiet">
            Downloads
          </Link>
        </div>
      </section>
    </SiteShell>
  );
}
