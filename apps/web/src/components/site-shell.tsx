import Link from "next/link";
import { LogoMark } from "@/components/logo-mark";
import { SiteNav } from "@/components/site-nav";

export function SiteShell({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: "docs" | "pricing" | "about" | "changelog";
}) {
  return (
    <div className="site">
      <SiteNav active={active} />
      {children}
      <footer className="site-footer">
        <div className="site-footer__inner">
          <div className="site-footer__brand">
            <LogoMark className="size-6 text-ink" />
            <span>Wormhole</span>
          </div>
          <p className="site-footer__tag">Mount any folder. Any computer. No setup.</p>
          <div className="site-footer__links">
            <Link href="/download">Download</Link>
            <Link href="/for">Who it’s for</Link>
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
