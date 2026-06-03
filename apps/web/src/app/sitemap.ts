import { MetadataRoute } from "next";

const BASE_URL = "https://wormhole.byronwade.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // Main pages
  const mainPages = [
    { url: "", priority: 1.0, changeFrequency: "weekly" as const },
    { url: "/about", priority: 0.8, changeFrequency: "monthly" as const },
    { url: "/pricing", priority: 0.8, changeFrequency: "monthly" as const },
    { url: "/changelog", priority: 0.7, changeFrequency: "weekly" as const },
  ];

  // Download pages
  const downloadPages = [
    { url: "/download/macos", priority: 0.9, changeFrequency: "weekly" as const },
    { url: "/download/windows", priority: 0.9, changeFrequency: "weekly" as const },
    { url: "/download/linux", priority: 0.9, changeFrequency: "weekly" as const },
  ];

  // Documentation pages
  const docPages = [
    { url: "/docs", priority: 0.9, changeFrequency: "weekly" as const },
    { url: "/docs/quickstart", priority: 0.9, changeFrequency: "monthly" as const },
    { url: "/docs/installation", priority: 0.9, changeFrequency: "monthly" as const },
    { url: "/docs/requirements", priority: 0.7, changeFrequency: "monthly" as const },
    // CLI
    { url: "/docs/cli", priority: 0.8, changeFrequency: "monthly" as const },
    { url: "/docs/cli/host", priority: 0.8, changeFrequency: "monthly" as const },
    { url: "/docs/cli/mount", priority: 0.8, changeFrequency: "monthly" as const },
    { url: "/docs/cli/status", priority: 0.7, changeFrequency: "monthly" as const },
    { url: "/docs/cli/cache", priority: 0.7, changeFrequency: "monthly" as const },
    { url: "/docs/cli/config", priority: 0.7, changeFrequency: "monthly" as const },
    { url: "/docs/cli/peers", priority: 0.7, changeFrequency: "monthly" as const },
    { url: "/docs/cli/sync", priority: 0.6, changeFrequency: "monthly" as const },
    { url: "/docs/cli/signal", priority: 0.7, changeFrequency: "monthly" as const },
    { url: "/docs/cli/all-commands", priority: 0.8, changeFrequency: "monthly" as const },
    // Architecture
    { url: "/docs/architecture", priority: 0.7, changeFrequency: "monthly" as const },
    { url: "/docs/architecture/fuse", priority: 0.6, changeFrequency: "monthly" as const },
    { url: "/docs/architecture/quic", priority: 0.6, changeFrequency: "monthly" as const },
    { url: "/docs/architecture/protocol", priority: 0.6, changeFrequency: "monthly" as const },
    { url: "/docs/architecture/caching", priority: 0.6, changeFrequency: "monthly" as const },
    // Security
    { url: "/docs/security", priority: 0.8, changeFrequency: "monthly" as const },
    { url: "/docs/security/encryption", priority: 0.7, changeFrequency: "monthly" as const },
    { url: "/docs/security/pake", priority: 0.7, changeFrequency: "monthly" as const },
    // Performance
    { url: "/docs/performance", priority: 0.7, changeFrequency: "monthly" as const },
    { url: "/docs/performance/run-benchmarks", priority: 0.6, changeFrequency: "monthly" as const },
    // Other
    { url: "/docs/configuration", priority: 0.7, changeFrequency: "monthly" as const },
    { url: "/docs/self-hosting", priority: 0.7, changeFrequency: "monthly" as const },
    { url: "/docs/troubleshooting", priority: 0.8, changeFrequency: "monthly" as const },
    { url: "/docs/api", priority: 0.6, changeFrequency: "monthly" as const },
  ];

  const allPages = [...mainPages, ...downloadPages, ...docPages];

  return allPages.map((page) => ({
    url: `${BASE_URL}${page.url}`,
    lastModified: now,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
