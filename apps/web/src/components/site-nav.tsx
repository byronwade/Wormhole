"use client";

import { useState } from "react";
import Link from "next/link";
import { Github } from "lucide-react";
import { LogoMark } from "@/components/logo-mark";

const NAV_LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/for", label: "Who it’s for" },
  { href: "/docs", label: "Docs", activeKey: "docs" as const },
  { href: "/pricing", label: "Pricing", activeKey: "pricing" as const },
  { href: "/about", label: "About", activeKey: "about" as const },
];

export function SiteNav({
  active,
}: {
  active?: "docs" | "pricing" | "about" | "changelog";
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="site-nav">
      <div className="site-nav__inner">
        <Link href="/" className="site-brand" aria-label="Wormhole home">
          <LogoMark className="size-7 text-ink" />
          <span className="site-brand__name">Wormhole</span>
        </Link>

        <nav className="site-nav__links" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={
                link.activeKey && active === link.activeKey ? "page" : undefined
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="site-nav__actions">
          <a
            href="https://github.com/byronwade/Wormhole"
            className="site-link-quiet site-nav__github"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Github className="size-4" aria-hidden="true" />
            <span className="sr-only">GitHub</span>
          </a>
          <Link href="/download" className="site-btn site-btn--small">
            Download
          </Link>
          <button
            type="button"
            className={`site-nav__menu${menuOpen ? " is-open" : ""}`}
            aria-expanded={menuOpen}
            aria-controls="site-mobile-nav"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div id="site-mobile-nav" className="site-nav__drawer">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={
                link.activeKey && active === link.activeKey ? "page" : undefined
              }
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <Link href="/download" onClick={() => setMenuOpen(false)}>
            Download
          </Link>
          <a
            href="https://github.com/byronwade/Wormhole"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMenuOpen(false)}
          >
            GitHub
          </a>
        </div>
      )}
    </header>
  );
}
