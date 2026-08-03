"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronRight, Github, Menu, X } from "lucide-react";
import { LogoMark } from "@/components/logo-mark";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  href: string;
  items?: { title: string; href: string; badge?: string }[];
}

const navigation: NavItem[] = [
  {
    title: "Getting Started",
    href: "/docs",
    items: [
      { title: "Introduction", href: "/docs" },
      { title: "Revolutionary features", href: "/docs/features" },
      { title: "Quick Start", href: "/docs/quickstart" },
      { title: "Installation", href: "/docs/installation" },
      { title: "Requirements", href: "/docs/requirements" },
    ],
  },
  {
    title: "CLI",
    href: "/docs/cli",
    items: [
      { title: "Overview", href: "/docs/cli" },
      { title: "host", href: "/docs/cli/host" },
      { title: "mount", href: "/docs/cli/mount" },
      { title: "open", href: "/docs/cli/open" },
      { title: "fetch", href: "/docs/cli/fetch" },
      { title: "playhead", href: "/docs/cli/playhead" },
      { title: "status", href: "/docs/cli/status" },
      { title: "peers", href: "/docs/cli/peers" },
      { title: "cache", href: "/docs/cli/cache" },
      { title: "config", href: "/docs/cli/config" },
      { title: "doctor", href: "/docs/cli/doctor" },
      { title: "logs", href: "/docs/cli/logs" },
      { title: "mcp", href: "/docs/cli/mcp" },
      { title: "ctl", href: "/docs/cli/ctl" },
      { title: "signal", href: "/docs/cli/signal" },
      { title: "sync", href: "/docs/cli/sync" },
      { title: "update", href: "/docs/cli/update" },
      { title: "completion", href: "/docs/cli/completion" },
      { title: "All commands", href: "/docs/cli/all-commands" },
    ],
  },
  {
    title: "Architecture",
    href: "/docs/architecture",
    items: [
      { title: "Overview", href: "/docs/architecture" },
      { title: "FUSE", href: "/docs/architecture/fuse" },
      { title: "QUIC", href: "/docs/architecture/quic" },
      { title: "Protocol", href: "/docs/architecture/protocol" },
      { title: "Caching", href: "/docs/architecture/caching" },
      { title: "Signal server", href: "/docs/architecture/signal-server" },
    ],
  },
  {
    title: "Security",
    href: "/docs/security",
    items: [
      { title: "Overview", href: "/docs/security" },
      { title: "Encryption", href: "/docs/security/encryption" },
      { title: "PAKE", href: "/docs/security/pake" },
      { title: "Access control", href: "/docs/security/access-control" },
      { title: "Threat model", href: "/docs/security/threat-model" },
      { title: "Audit", href: "/docs/security/audit" },
    ],
  },
  {
    title: "More",
    href: "/docs/performance",
    items: [
      { title: "Performance", href: "/docs/performance" },
      { title: "Configuration", href: "/docs/configuration" },
      { title: "Self-hosting", href: "/docs/self-hosting" },
      { title: "Troubleshooting", href: "/docs/troubleshooting" },
      { title: "API", href: "/docs/api" },
    ],
  },
];

function NavSection({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const inSection =
    item.items?.some(
      (sub) =>
        pathname === sub.href ||
        (sub.href !== "/docs" && pathname.startsWith(`${sub.href}/`)),
    ) ||
    (item.href !== "/docs" && pathname.startsWith(`${item.href}/`)) ||
    pathname === item.href;
  const [open, setOpen] = useState(inSection);

  return (
    <div className="docs-nav__section">
      <button
        type="button"
        className="docs-nav__heading"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{item.title}</span>
        <ChevronRight
          className={cn("size-3.5 transition-transform", open && "rotate-90")}
          aria-hidden="true"
        />
      </button>
      {open && (
        <ul className="docs-nav__list">
          {item.items?.map((sub) => {
            const active = pathname === sub.href;
            return (
              <li key={sub.href}>
                <Link
                  href={sub.href}
                  className={cn("docs-nav__link", active && "is-active")}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                >
                  {sub.title}
                  {sub.badge ? <span className="docs-nav__badge">{sub.badge}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DocsSidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="docs-nav" aria-label="Documentation">
      {navigation.map((item) => (
        <NavSection key={item.href} item={item} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="site docs-shell">
      <header className="site-nav">
        <div className="site-nav__inner">
          <div className="docs-top">
            <button
              type="button"
              className="docs-menu-btn"
              aria-expanded={mobileOpen}
              aria-controls="docs-mobile-nav"
              aria-label={mobileOpen ? "Close docs menu" : "Open docs menu"}
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
            <Link href="/" className="site-brand" aria-label="Wormhole home">
              <LogoMark className="size-7 text-ink" />
              <span className="site-brand__name">Wormhole</span>
            </Link>
            <span className="docs-crumb" aria-hidden="true">
              /
            </span>
            <Link href="/docs" className="docs-crumb-link">
              Docs
            </Link>
          </div>
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
        {mobileOpen && (
          <div id="docs-mobile-nav" className="docs-mobile">
            <DocsSidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        )}
      </header>

      <div className="docs-layout">
        <aside className="docs-aside">
          <DocsSidebar />
        </aside>
        <div className="docs-content">{children}</div>
      </div>
    </div>
  );
}
