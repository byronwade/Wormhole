"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Apple, ArrowRight, Monitor, Terminal } from "lucide-react";

type Platform = "macos" | "windows" | "linux" | "unknown";

const platforms = [
  {
    id: "macos" as const,
    href: "/download/macos",
    title: "macOS",
    blurb: "DMG for Apple Silicon and Intel. Requires macFUSE for mounts.",
    Icon: Apple,
  },
  {
    id: "windows" as const,
    href: "/download/windows",
    title: "Windows",
    blurb: "Installer build. Requires WinFSP for mounts.",
    Icon: Monitor,
  },
  {
    id: "linux" as const,
    href: "/download/linux",
    title: "Linux",
    blurb: "AppImage, .deb, or .rpm. Needs FUSE 3.",
    Icon: Terminal,
  },
];

function detectPlatform(): Platform {
  if (typeof window === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "macos";
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

export function DownloadHub() {
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setMounted(true);
  }, []);

  const primary =
    platforms.find((p) => p.id === platform) ?? null;

  return (
    <>
      {mounted && primary ? (
        <div className="dl-actions" style={{ marginBottom: "2rem" }}>
          <Link href={primary.href} className="site-btn">
            <primary.Icon className="size-4" aria-hidden="true" />
            <span>Download for {primary.title}</span>
          </Link>
          <Link href="/docs/quickstart" className="site-btn site-btn--ghost">
            Quick start
          </Link>
        </div>
      ) : (
        <div className="dl-actions" style={{ marginBottom: "2rem" }}>
          <Link href="/docs/quickstart" className="site-btn site-btn--ghost">
            Quick start
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      )}

      <div className="docs-home__grid" style={{ maxWidth: "40rem" }}>
        {platforms.map((p) => {
          const highlighted = mounted && platform === p.id;
          return (
            <Link
              key={p.href}
              href={p.href}
              className="docs-home__card"
              aria-current={highlighted ? "true" : undefined}
              style={
                highlighted
                  ? {
                      borderColor: "color-mix(in oklab, var(--ink) 35%, transparent)",
                      background: "color-mix(in oklab, var(--ink) 4%, #fff)",
                    }
                  : undefined
              }
            >
              <h2>
                <p.Icon
                  className="size-4"
                  aria-hidden="true"
                  style={{ display: "inline", marginRight: "0.4rem", verticalAlign: "-0.1em" }}
                />
                {p.title}
                {highlighted ? (
                  <span className="docs-muted" style={{ fontWeight: 400, fontSize: "0.85rem" }}>
                    {" "}
                    · your device
                  </span>
                ) : null}
              </h2>
              <p>{p.blurb}</p>
            </Link>
          );
        })}
      </div>
    </>
  );
}
