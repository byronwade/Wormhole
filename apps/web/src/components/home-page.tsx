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
import { NICHES } from "@/lib/site";

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
  unknown: "Download free",
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
    q: "Is Wormhole a Dropbox alternative for large media?",
    a: "For editors and game teams moving tens of gigabytes, yes—in the sense that you stop uploading copies. Wormhole mounts a live folder over P2P instead of parking files on a cloud drive.",
  },
  {
    q: "How is this different from Syncthing?",
    a: "Syncthing syncs copies. Wormhole mounts the remote path as a drive with join codes—seconds to connect, no device-ID ritual. You work against one live library, not mirrored folders fighting for truth.",
  },
  {
    q: "Can video editors scrub before media is fully local?",
    a: "Yes. Large seeks arm playhead-first prefetch—landing chunk first, then ahead and a little behind—so DaVinci, Premiere, and friends keep moving while bytes fill in.",
  },
  {
    q: "Does it work for game builds and art drops?",
    a: "That’s a core niche. Mount the build server or art share, pull content-addressed chunks from peers who already have them, and test across Mac/Windows/Linux without a cloud detour.",
  },
  {
    q: "Is it encrypted? Do files touch your servers?",
    a: "Sessions are end-to-end encrypted over QUIC. Join codes use PAKE so the session key isn’t sent in the clear. Payload stays on the peers—signal only helps you find each other.",
  },
  {
    q: "Will the core stay free?",
    a: "Yes. Unlimited core sharing stays free. Pro and Team are for power features after launch; alpha is free across the board.",
  },
];

function HeroVisual() {
  return (
    <div className="site-hero-visual" aria-hidden="true">
      <div className="site-hero-visual__field" />
      <div className="site-hero-visual__orbit" />
      <div className="site-hero-visual__aperture" />
      <div className="site-hero-visual__grain" />
    </div>
  );
}

export function HomePage() {
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [mounted, setMounted] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    setPlatform(detectPlatform());
  }, []);

  const primaryHref = mounted ? downloadHref(platform) : "#download";
  const primaryLabel = mounted ? platformLabels[platform] : "Download free";

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
            <a href="#who">Who it’s for</a>
            <a href="#shift">Why</a>
            <Link href="/docs">Docs</Link>
            <a href="#faq">FAQ</a>
          </nav>

          <div className="site-nav__actions">
            <a
              href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`}
              className="site-link-quiet site-nav__github"
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
              className={`site-nav__menu${menuOpen ? " is-open" : ""}`}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
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
          <div id="mobile-nav" className="site-nav__drawer">
            <a href="#how" onClick={() => setMenuOpen(false)}>
              How it works
            </a>
            <a href="#who" onClick={() => setMenuOpen(false)}>
              Who it’s for
            </a>
            <a href="#shift" onClick={() => setMenuOpen(false)}>
              Why
            </a>
            <Link href="/docs" onClick={() => setMenuOpen(false)}>
              Docs
            </Link>
            <a href="#faq" onClick={() => setMenuOpen(false)}>
              FAQ
            </a>
            <Link href="/download" onClick={() => setMenuOpen(false)}>
              Download
            </Link>
            <a
              href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
            >
              GitHub
            </a>
          </div>
        )}
      </header>

      <section className="site-hero">
        <HeroVisual />
        <div className="site-hero__content">
          <p className="site-hero__brand">Wormhole</p>
          <h1 className="site-hero__title">
            Mount the folder.
            <br />
            Skip the upload.
          </h1>
          <p className="site-hero__lede">
            Peer-to-peer project mounts for video editors, game developers, and
            VFX teams. Share a code, connect encrypted, work on a live drive—no
            cloud copy, no monthly storage rent.
          </p>
          <div className="site-hero__cta">
            <a href={primaryHref} className="site-btn">
              {mounted && <PlatformIcon platform={platform} />}
              <span>{primaryLabel}</span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
            <a href="#who" className="site-btn site-btn--ghost">
              See if it’s for you
            </a>
          </div>
          <p className="site-hero__proof">
            Free core · Open source · E2E encrypted · Mac, Windows, Linux
          </p>
        </div>
      </section>

      <section id="how" className="site-section">
        <div className="site-section__intro">
          <h2>Three steps. No upload bar.</h2>
          <p>
            The project arrives as a drive—not a zip, not a Drive folder, not a
            progress bar that owns your afternoon.
          </p>
        </div>
        <ol className="site-steps">
          <li>
            <span className="site-steps__n" aria-hidden="true">
              01
            </span>
            <div>
              <h3>Point at the folder</h3>
              <p>Render output, art drop, shot tree—whatever already exists.</p>
              <code>wormhole host ~/job-042</code>
            </div>
          </li>
          <li>
            <span className="site-steps__n" aria-hidden="true">
              02
            </span>
            <div>
              <h3>Send a join code</h3>
              <p>Peers mount over an encrypted QUIC link. No accounts.</p>
              <code>→ 7KJM-XBCD-QRST-VWYZ</code>
            </div>
          </li>
          <li>
            <span className="site-steps__n" aria-hidden="true">
              03
            </span>
            <div>
              <h3>Work like it’s local</h3>
              <p>Playhead-first prefetch keeps timelines and greps moving.</p>
              <code>wormhole mount 7KJM-XBCD</code>
            </div>
          </li>
        </ol>
      </section>

      <section id="who" className="site-section site-section--band">
        <div className="site-section__intro">
          <h2>Built for people with huge files and short patience</h2>
          <p>
            Wormhole isn’t trying to be everyone’s cloud. It’s for desks where
            50&nbsp;GB is a Tuesday.
          </p>
        </div>
        <div className="site-audience site-section--band-inner">
          {NICHES.map((n) => (
            <Link key={n.slug} href={`/for/${n.slug}`} className="site-audience__card">
              <span className="site-audience__label">{n.navLabel}</span>
              <strong>{n.headline}</strong>
              <span className="site-audience__more">
                Read more <ArrowRight className="size-3.5" aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section id="shift" className="site-section">
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
          <Link href="/docs/features">How the three pillars work →</Link>
        </p>
      </section>

      <section id="why" className="site-section site-section--band">
        <div className="site-section__intro">
          <h2>Why upload when you can connect?</h2>
          <p>
            Cloud tools rent you a copy of files you already have. Wormhole opens
            a private tunnel and mounts the project live.
          </p>
        </div>
        <dl className="site-diff site-section--band-inner">
          <div>
            <dt>Time to open 50&nbsp;GB</dt>
            <dd>
              <span className="site-diff__good">Under 10 seconds</span>
              <span className="site-diff__vs">vs hours of cloud upload</span>
            </dd>
          </div>
          <div>
            <dt>vs Dropbox / Drive</dt>
            <dd>
              <span className="site-diff__good">Live mount</span>
              <span className="site-diff__vs">not another rented copy</span>
            </dd>
          </div>
          <div>
            <dt>vs Syncthing</dt>
            <dd>
              <span className="site-diff__good">Join code → drive</span>
              <span className="site-diff__vs">not a 15-step peer dance</span>
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
          <h2>Questions people in this niche ask</h2>
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
        <h2>Ready when the render is.</h2>
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
            <Link href="/for">Who it’s for</Link>
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
