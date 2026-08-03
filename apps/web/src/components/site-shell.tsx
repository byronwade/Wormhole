import Link from "next/link";
import { Github } from "lucide-react";
import { LogoMark } from "@/components/logo-mark";

export function SiteShell({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: "docs" | "pricing" | "about" | "changelog";
}) {
  return (
    <div className="site">
      <header className="site-nav">
        <div className="site-nav__inner">
          <Link href="/" className="site-brand" aria-label="Wormhole home">
            <LogoMark className="size-7 text-ink" />
            <span className="site-brand__name">Wormhole</span>
          </Link>
          <nav className="site-nav__links" aria-label="Primary">
            <Link href="/#how">How it works</Link>
            <Link href="/docs" aria-current={active === "docs" ? "page" : undefined}>
              Docs
            </Link>
            <Link href="/pricing" aria-current={active === "pricing" ? "page" : undefined}>
              Pricing
            </Link>
            <Link href="/about" aria-current={active === "about" ? "page" : undefined}>
              About
            </Link>
          </nav>
          <div className="site-nav__actions">
            <a
              href="https://github.com/byronwade/Wormhole"
              className="site-link-quiet"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Github className="size-4" aria-hidden="true" />
              <span className="sr-only">GitHub</span>
            </a>
            <Link href="/download" className="site-btn site-btn--small">
              Download
            </Link>
          </div>
        </div>
      </header>
      {children}
      <footer className="site-footer">
        <div className="site-footer__inner">
          <div className="site-footer__brand">
            <LogoMark className="size-6 text-ink" />
            <span>Wormhole</span>
          </div>
          <p className="site-footer__tag">Mount any folder. Any computer. No setup.</p>
          <div className="site-footer__links">
            <Link href="/docs">Docs</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/changelog">Changelog</Link>
            <Link href="/about">About</Link>
            <a
              href="https://github.com/byronwade/Wormhole"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </div>
          <p className="site-footer__legal">Open source · MIT</p>
        </div>
      </footer>
    </div>
  );
}
