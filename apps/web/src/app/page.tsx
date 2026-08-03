"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Apple,
  ArrowRight,
  ChevronDown,
  Github,
  Monitor,
  Terminal,
} from "lucide-react";
import { LogoMark } from "@/components/logo-mark";

type Platform = "mac" | "windows" | "linux" | "unknown";

const GITHUB_OWNER = "byronwade";
const GITHUB_REPO = "Wormhole";

function detectPlatform(): Platform {
  if (typeof window === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

function PlatformIcon({ platform }: { platform: Platform }) {
  switch (platform) {
    case "mac":
      return <Apple className="size-4" aria-hidden="true" />;
    case "windows":
      return <Monitor className="size-4" aria-hidden="true" />;
    case "linux":
      return <Terminal className="size-4" aria-hidden="true" />;
    default:
      return <ArrowRight className="size-4" aria-hidden="true" />;
  }
}

function downloadHref(platform: Platform): string {
  switch (platform) {
    case "mac":
      return "/download/macos";
    case "windows":
      return "/download/windows";
    case "linux":
      return "/download/linux";
    default:
      return "/download";
  }
}

const platformLabels: Record<Platform, string> = {
  mac: "Download for macOS",
  windows: "Download for Windows",
  linux: "Download for Linux",
  unknown: "Download",
};

const faqs = [
  {
    q: "How is this different from Dropbox?",
    a: "Cloud tools upload copies to someone else’s servers. Wormhole mounts a live folder over a direct peer-to-peer link—so a 50\u00A0GB project is usable in seconds, not after an upload finishes.",
  },
  {
    q: "What if the host goes offline?",
    a: "The mount disappears, like unplugging a drive. Recently opened files can remain in local cache; everything else waits until the host is back.",
  },
  {
    q: "Is it encrypted?",
    a: "Yes. Sessions use end-to-end encryption over QUIC. Join codes use PAKE so the session key is never sent in the clear. Signaling only helps peers find each other.",
  },
  {
    q: "Will it stay free?",
    a: "Core sharing stays free. Pro and Team tiers are planned for power features after launch; alpha is free across the board.",
  },
];

function HeroVisual() {
  return (
    <div className="site-hero-visual" aria-hidden="true">
      <div className="site-hero-visual__field" />
      <div className="site-hero-visual__aperture" />
      <div className="site-hero-visual__grain" />
    </div>
  );
}

export default function Home() {
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [mounted, setMounted] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    setPlatform(detectPlatform());
  }, []);

  const primaryHref = mounted ? downloadHref(platform) : "#download";
  const primaryLabel = mounted ? platformLabels[platform] : "Download";

  return (
    <div className="site">
      <header className="site-nav">
        <div className="site-nav__inner">
          <Link href="/" className="site-brand" aria-label="Wormhole home">
            <LogoMark className="size-7 text-ink" />
            <span className="site-brand__name">Wormhole</span>
          </Link>

          <nav className="site-nav__links" aria-label="Primary">
            <a href="#how">How it works</a>
            <a href="#why">Why</a>
            <Link href="/docs">Docs</Link>
            <a href="#faq">FAQ</a>
          </nav>

          <div className="site-nav__actions">
            <a
              href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`}
              className="site-link-quiet"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Github className="size-4" aria-hidden="true" />
              <span className="sr-only">GitHub</span>
            </a>
            <a href={primaryHref} className="site-btn site-btn--small">
              {mounted && <PlatformIcon platform={platform} />}
              <span className="hidden sm:inline">{primaryLabel}</span>
              <span className="sm:hidden">Download</span>
            </a>
            <button
              type="button"
              className="site-nav__menu"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span />
              <span />
            </button>
          </div>
        </div>

        {menuOpen && (
          <div id="mobile-nav" className="site-nav__drawer">
            <a href="#how" onClick={() => setMenuOpen(false)}>
              How it works
            </a>
            <a href="#why" onClick={() => setMenuOpen(false)}>
              Why
            </a>
            <Link href="/docs" onClick={() => setMenuOpen(false)}>
              Docs
            </Link>
            <a href="#faq" onClick={() => setMenuOpen(false)}>
              FAQ
            </a>
          </div>
        )}
      </header>

      <section className="site-hero">
        <HeroVisual />
        <div className="site-hero__content">
          <p className="site-hero__brand">Wormhole</p>
          <h1 className="site-hero__title">
            Mount any folder.
            <br />
            Any computer.
          </h1>
          <p className="site-hero__lede">
            Share a code. Connect peer-to-peer. No cloud upload, no accounts, no
            rent on your own files.
          </p>
          <div className="site-hero__cta">
            <a href={primaryHref} className="site-btn">
              {mounted && <PlatformIcon platform={platform} />}
              <span>{primaryLabel}</span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
            <a
              href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`}
              className="site-btn site-btn--ghost"
              target="_blank"
              rel="noopener noreferrer"
            >
              View source
            </a>
          </div>
        </div>
      </section>

      <section id="how" className="site-section">
        <div className="site-section__intro">
          <h2>Share a code. That’s it.</h2>
          <p>Three steps. No setup wizard. No waiting for uploads.</p>
        </div>
        <ol className="site-steps">
          <li>
            <span className="site-steps__n" aria-hidden="true">
              01
            </span>
            <div>
              <h3>Host a folder</h3>
              <p>Point Wormhole at any directory on your machine.</p>
              <code>wormhole host ~/renders</code>
            </div>
          </li>
          <li>
            <span className="site-steps__n" aria-hidden="true">
              02
            </span>
            <div>
              <h3>Send the join code</h3>
              <p>A short code is your invite—Slack, text, whatever.</p>
              <code>7KJM-XBCD-QRST</code>
            </div>
          </li>
          <li>
            <span className="site-steps__n" aria-hidden="true">
              03
            </span>
            <div>
              <h3>Mount and work</h3>
              <p>It appears as a normal drive in Finder or Explorer.</p>
              <code>wormhole mount 7KJM-XBCD-QRST</code>
            </div>
          </li>
        </ol>
      </section>

      <section id="why" className="site-section site-section--band">
        <div className="site-section__intro">
          <h2>Why upload when you can connect?</h2>
          <p>
            Other tools copy your files somewhere else. Wormhole opens a private
            tunnel and mounts the folder live.
          </p>
        </div>
        <dl className="site-diff">
          <div>
            <dt>Time to open 50&nbsp;GB</dt>
            <dd>
              <span className="site-diff__good">Under 10 seconds</span>
              <span className="site-diff__vs">vs hours of cloud upload</span>
            </dd>
          </div>
          <div>
            <dt>Where files live</dt>
            <dd>
              <span className="site-diff__good">On your machines</span>
              <span className="site-diff__vs">never on ours</span>
            </dd>
          </div>
          <div>
            <dt>How it shows up</dt>
            <dd>
              <span className="site-diff__good">Native drive mount</span>
              <span className="site-diff__vs">works with any app</span>
            </dd>
          </div>
          <div>
            <dt>Price to start</dt>
            <dd>
              <span className="site-diff__good">$0</span>
              <span className="site-diff__vs">free core, forever</span>
            </dd>
          </div>
        </dl>
      </section>

      <section id="faq" className="site-section">
        <div className="site-section__intro">
          <h2>Questions</h2>
          <p>Straight answers. No brochure speak.</p>
        </div>
        <div className="site-faq">
          {faqs.map((faq, i) => {
            const open = openFaq === i;
            return (
              <div key={faq.q} className="site-faq__item">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenFaq(open ? null : i)}
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </button>
                {open && <p>{faq.a}</p>}
              </div>
            );
          })}
        </div>
      </section>

      <section id="download" className="site-section site-cta">
        <h2>Ready when you are.</h2>
        <p>Install Wormhole and share a folder in under a minute.</p>
        <div className="site-hero__cta">
          <a href={primaryHref} className="site-btn">
            {mounted && <PlatformIcon platform={platform} />}
            <span>{primaryLabel}</span>
          </a>
          <Link href="/docs/quickstart" className="site-btn site-btn--ghost">
            Quick start
          </Link>
        </div>
        <div className="site-platforms" role="group" aria-label="All platforms">
          <a href="/download/macos">
            <Apple className="size-3.5" aria-hidden="true" /> macOS
          </a>
          <a href="/download/windows">
            <Monitor className="size-3.5" aria-hidden="true" /> Windows
          </a>
          <a href="/download/linux">
            <Terminal className="size-3.5" aria-hidden="true" /> Linux
          </a>
        </div>
      </section>

      <footer className="site-footer">
        <div className="site-footer__inner">
          <div className="site-footer__brand">
            <LogoMark className="size-6 text-ink" />
            <span>Wormhole</span>
          </div>
          <p className="site-footer__tag">
            Mount any folder. Any computer. No setup.
          </p>
          <div className="site-footer__links">
            <Link href="/download">Download</Link>
            <Link href="/docs">Docs</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/changelog">Changelog</Link>
            <Link href="/about">About</Link>
            <a
              href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`}
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
