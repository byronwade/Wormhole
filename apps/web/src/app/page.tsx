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

const pillars = [
  {
    id: "playhead",
    title: "Playhead-first",
    lede: "Scrub a remote timeline before the file finishes “downloading.” Seeks prefetch around the playhead—not the whole library.",
    code: "wormhole playhead --inode 1 --offset 1310720",
  },
  {
    id: "aperture",
    title: "Project aperture",
    lede: "A .wormhole project is the job: roots, excludes, mesh policy. Share the aperture—not a zip of yesterday’s exports.",
    code: "wormhole init . && wormhole open .",
  },
  {
    id: "magnet",
    title: "Byte magnet",
    lede: "BLAKE3-addressed chunks. Same hash, same bytes—any peer that already has a chunk can serve it. The room becomes the CDN.",
    code: "wormhole fetch --check blake3:<hash>",
  },
];

const faqs = [
  {
    q: "How is this different from Dropbox?",
    a: "Cloud tools upload copies. Wormhole mounts a live project mesh: playhead-first scrubbing, content-addressed chunks, and a project aperture instead of “which Drive folder is canonical.”",
  },
  {
    q: "Can editors scrub before media is fully local?",
    a: "Yes. Large seeks arm playhead-first prefetch—landing chunk first, then ahead and a little behind—so DaVinci/Premiere can keep moving while bytes fill in.",
  },
  {
    q: "What is a project aperture?",
    a: "A .wormhole/aperture.toml that declares share roots, excludes, and mesh flags (playhead prefetch, content-addressed hosting). wormhole init writes one; wormhole open validates it.",
  },
  {
    q: "What is a byte magnet?",
    a: "A blake3:… or wormhole:magnet:blake3:… address for a chunk. Hosts seed a content store on read, serve BulkChunk by hash, and wormhole fetch --from / peers pulls the same bytes from any mesh node that already has them.",
  },
  {
    q: "Is it encrypted?",
    a: "Yes. Sessions use end-to-end encryption over QUIC. Join codes use PAKE so the session key is never sent in the clear.",
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
            <a href="#how">How</a>
            <a href="#shift">The shift</a>
            <Link href="/docs/features">Features</Link>
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
              How
            </a>
            <a href="#shift" onClick={() => setMenuOpen(false)}>
              The shift
            </a>
            <Link href="/docs/features" onClick={() => setMenuOpen(false)}>
              Features
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
            The project lives
            <br />
            everywhere at once.
          </h1>
          <p className="site-hero__lede">
            Not another sync folder. A peer-to-peer project mesh—scrub remote
            media, open an aperture, pull bytes by hash. No cloud upload.
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
          <h2>Open an aperture. Scrub. Done.</h2>
          <p>Three steps. No upload bar. The project arrives as a drive.</p>
        </div>
        <ol className="site-steps">
          <li>
            <span className="site-steps__n" aria-hidden="true">
              01
            </span>
            <div>
              <h3>Init the project</h3>
              <p>Write a .wormhole aperture for roots and mesh policy.</p>
              <code>wormhole init ~/job-042</code>
            </div>
          </li>
          <li>
            <span className="site-steps__n" aria-hidden="true">
              02
            </span>
            <div>
              <h3>Host and send a code</h3>
              <p>Peers mount the aperture over an encrypted QUIC link.</p>
              <code>wormhole host . → 7KJM-XBCD</code>
            </div>
          </li>
          <li>
            <span className="site-steps__n" aria-hidden="true">
              03
            </span>
            <div>
              <h3>Scrub and work</h3>
              <p>Playhead-first prefetch keeps the timeline moving.</p>
              <code>wormhole mount 7KJM-XBCD</code>
            </div>
          </li>
        </ol>
      </section>

      <section id="shift" className="site-section site-section--band">
        <div className="site-section__intro">
          <h2>Not a better pipe. A different object.</h2>
          <p>
            Sync copies fight over who has the truth. Wormhole treats the job as
            one live library with many doorways.
          </p>
        </div>
        <div className="site-pillars">
          {pillars.map((p) => (
            <article key={p.id} id={p.id} className="site-pillar">
              <h3>{p.title}</h3>
              <p>{p.lede}</p>
              <code>{p.code}</code>
            </article>
          ))}
        </div>
        <p className="site-pillars__more">
          <Link href="/docs/features">Read how the three pillars work →</Link>
        </p>
      </section>

      <section id="why" className="site-section">
        <div className="site-section__intro">
          <h2>Why upload when you can connect?</h2>
          <p>
            Other tools copy your files somewhere else. Wormhole opens a private
            tunnel and mounts the project live.
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
            <dt>Scrub remote media</dt>
            <dd>
              <span className="site-diff__good">Playhead-first</span>
              <span className="site-diff__vs">not wait-then-edit</span>
            </dd>
          </div>
          <div>
            <dt>Where bytes come from</dt>
            <dd>
              <span className="site-diff__good">Any peer with the hash</span>
              <span className="site-diff__vs">not a rented CDN</span>
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
