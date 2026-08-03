"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Apple, ArrowRight, Monitor, Terminal } from "lucide-react";
import type { DownloadPlatform } from "@/lib/releases";

type PlatformCard = {
  id: DownloadPlatform;
  href: string;
  title: string;
  blurb: string;
  downloadUrl: string;
  downloadLabel: string;
  sizeLabel: string | null;
};

const icons = {
  macos: Apple,
  windows: Monitor,
  linux: Terminal,
} as const;

function detectPlatform(): DownloadPlatform | "unknown" {
  if (typeof window === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "macos";
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

export function DownloadHubClient({
  releaseTag,
  platforms,
}: {
  releaseTag: string;
  platforms: PlatformCard[];
}) {
  const [platform, setPlatform] = useState<DownloadPlatform | "unknown">("unknown");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setMounted(true);
  }, []);

  const primary =
    mounted && platform !== "unknown"
      ? platforms.find((p) => p.id === platform) ?? null
      : null;
  const Icon = primary ? icons[primary.id] : ArrowRight;

  return (
    <div className="dl-actions" style={{ marginBottom: "0.5rem" }}>
      {primary ? (
        <>
          <a href={primary.downloadUrl} className="site-btn" rel="noopener noreferrer">
            <Icon className="size-4" aria-hidden="true" />
            <span>{primary.downloadLabel}</span>
          </a>
          <Link href={primary.href} className="site-btn site-btn--ghost">
            All {primary.title} options
          </Link>
          {primary.sizeLabel && (
            <span className="dl-meta">
              {primary.sizeLabel} · {releaseTag}
            </span>
          )}
        </>
      ) : (
        <Link href="/docs/quickstart" className="site-btn site-btn--ghost">
          Quick start
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
