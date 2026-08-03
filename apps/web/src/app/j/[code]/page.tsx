"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Apple, Check, Copy, Monitor, Terminal } from "lucide-react";
import { SiteShell } from "@/components/site-shell";

type Platform = "mac" | "windows" | "linux" | "unknown";

function detectPlatform(): Platform {
  if (typeof window === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

function normalizeJoinCode(code: string): string {
  let normalized = code.toUpperCase().trim();
  normalized = normalized
    .replace(/^HTTPS?:\/\/[^/]+\/J\//i, "")
    .replace(/[^A-Z0-9]/g, "");
  if (normalized.length === 6 && !normalized.includes("-")) {
    normalized = `${normalized.slice(0, 3)}-${normalized.slice(3)}`;
  }
  return normalized;
}

function isValidJoinCode(code: string): boolean {
  const normalized = code.replace(/-/g, "");
  return /^[A-Z0-9]{6,12}$/i.test(normalized);
}

function downloadPath(platform: Platform): string {
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

export default function JoinPage() {
  const params = useParams();
  const rawCode = params.code as string;
  const joinCode = normalizeJoinCode(decodeURIComponent(rawCode));
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [status, setStatus] = useState<"opening" | "ready">("opening");

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  useEffect(() => {
    if (!isValidJoinCode(joinCode)) return;
    const deepLinkUrl = `wormhole://join/${joinCode}`;
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = deepLinkUrl;
    document.body.appendChild(iframe);
    const timer = window.setTimeout(() => {
      setStatus("ready");
      iframe.remove();
    }, 1400);
    return () => {
      window.clearTimeout(timer);
      iframe.remove();
    };
  }, [joinCode]);

  const copy = async (kind: "code" | "link") => {
    const value =
      kind === "code"
        ? joinCode
        : `${window.location.origin}/j/${joinCode}`;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      /* ignore */
    }
  };

  if (!isValidJoinCode(joinCode)) {
    return (
      <SiteShell>
        <section className="site-section join-page">
          <div className="site-section__intro">
            <h2>Invalid join code</h2>
            <p>
              “{rawCode}” doesn’t look like a Wormhole code. Ask the host to send it
              again.
            </p>
          </div>
          <Link href="/" className="site-btn">
            Back home
          </Link>
        </section>
      </SiteShell>
    );
  }

  return (
    <SiteShell>
      <section className="site-section join-page">
        <div className="site-section__intro">
          <h2>Join a shared folder</h2>
          <p>Someone shared files with you. Open Wormhole or install it, then mount this code.</p>
        </div>

        <div className="join-code" aria-live="polite">
          <p>Join code</p>
          <div className="join-code__row">
            <span className="join-code__value">{joinCode}</span>
            <button
              type="button"
              className="site-link-quiet"
              aria-label={copied === "code" ? "Copied" : "Copy join code"}
              onClick={() => copy("code")}
            >
              {copied === "code" ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
            </button>
          </div>
        </div>

        <p className="docs-muted" role="status" aria-live="polite">
          {status === "opening" ? "Opening the Wormhole app…" : "App didn’t open? Use the buttons below."}
        </p>

        <div className="site-hero__cta">
          <a href={`wormhole://join/${joinCode}`} className="site-btn">
            Open in Wormhole
          </a>
          <button type="button" className="site-btn site-btn--ghost" onClick={() => copy("link")}>
            {copied === "link" ? "Link copied" : "Copy share link"}
          </button>
        </div>

        <div className="join-download">
          <p>Need the app?</p>
          <div className="site-platforms">
            <Link href={downloadPath(platform)}>
              {platform === "windows" ? (
                <Monitor className="size-3.5" aria-hidden="true" />
              ) : platform === "linux" ? (
                <Terminal className="size-3.5" aria-hidden="true" />
              ) : (
                <Apple className="size-3.5" aria-hidden="true" />
              )}
              Download for your device
            </Link>
            <Link href="/download/macos">macOS</Link>
            <Link href="/download/windows">Windows</Link>
            <Link href="/download/linux">Linux</Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
