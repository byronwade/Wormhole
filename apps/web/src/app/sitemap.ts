import { MetadataRoute } from "next";

const BASE_URL = "https://wormhole.byronwade.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const pages: {
    url: string;
    priority: number;
    changeFrequency: "weekly" | "monthly";
  }[] = [
    { url: "", priority: 1.0, changeFrequency: "weekly" },
    { url: "/about", priority: 0.8, changeFrequency: "monthly" },
    { url: "/pricing", priority: 0.8, changeFrequency: "monthly" },
    { url: "/changelog", priority: 0.7, changeFrequency: "weekly" },
    { url: "/download", priority: 0.95, changeFrequency: "weekly" },
    { url: "/download/macos", priority: 0.9, changeFrequency: "weekly" },
    { url: "/download/windows", priority: 0.9, changeFrequency: "weekly" },
    { url: "/download/linux", priority: 0.9, changeFrequency: "weekly" },
    // Docs hubs
    { url: "/docs", priority: 0.9, changeFrequency: "weekly" },
    { url: "/docs/quickstart", priority: 0.9, changeFrequency: "monthly" },
    { url: "/docs/installation", priority: 0.9, changeFrequency: "monthly" },
    { url: "/docs/requirements", priority: 0.7, changeFrequency: "monthly" },
    // CLI
    { url: "/docs/cli", priority: 0.8, changeFrequency: "monthly" },
    { url: "/docs/cli/host", priority: 0.8, changeFrequency: "monthly" },
    { url: "/docs/cli/mount", priority: 0.8, changeFrequency: "monthly" },
    { url: "/docs/cli/status", priority: 0.7, changeFrequency: "monthly" },
    { url: "/docs/cli/peers", priority: 0.7, changeFrequency: "monthly" },
    { url: "/docs/cli/cache", priority: 0.7, changeFrequency: "monthly" },
    { url: "/docs/cli/config", priority: 0.7, changeFrequency: "monthly" },
    { url: "/docs/cli/doctor", priority: 0.7, changeFrequency: "monthly" },
    { url: "/docs/cli/logs", priority: 0.65, changeFrequency: "monthly" },
    { url: "/docs/cli/mcp", priority: 0.7, changeFrequency: "monthly" },
    { url: "/docs/cli/ctl", priority: 0.6, changeFrequency: "monthly" },
    { url: "/docs/cli/signal", priority: 0.65, changeFrequency: "monthly" },
    { url: "/docs/cli/sync", priority: 0.6, changeFrequency: "monthly" },
    { url: "/docs/cli/update", priority: 0.65, changeFrequency: "monthly" },
    { url: "/docs/cli/completion", priority: 0.6, changeFrequency: "monthly" },
    { url: "/docs/cli/all-commands", priority: 0.8, changeFrequency: "monthly" },
    // Architecture
    { url: "/docs/architecture", priority: 0.7, changeFrequency: "monthly" },
    { url: "/docs/architecture/fuse", priority: 0.6, changeFrequency: "monthly" },
    { url: "/docs/architecture/quic", priority: 0.6, changeFrequency: "monthly" },
    { url: "/docs/architecture/protocol", priority: 0.6, changeFrequency: "monthly" },
    { url: "/docs/architecture/caching", priority: 0.6, changeFrequency: "monthly" },
    { url: "/docs/architecture/signal-server", priority: 0.6, changeFrequency: "monthly" },
    // Security
    { url: "/docs/security", priority: 0.8, changeFrequency: "monthly" },
    { url: "/docs/security/encryption", priority: 0.7, changeFrequency: "monthly" },
    { url: "/docs/security/pake", priority: 0.7, changeFrequency: "monthly" },
    { url: "/docs/security/access-control", priority: 0.65, changeFrequency: "monthly" },
    { url: "/docs/security/threat-model", priority: 0.7, changeFrequency: "monthly" },
    { url: "/docs/security/audit", priority: 0.6, changeFrequency: "monthly" },
    // Performance
    { url: "/docs/performance", priority: 0.7, changeFrequency: "monthly" },
    { url: "/docs/performance/cache", priority: 0.6, changeFrequency: "monthly" },
    { url: "/docs/performance/network", priority: 0.6, changeFrequency: "monthly" },
    { url: "/docs/performance/tuning", priority: 0.6, changeFrequency: "monthly" },
    { url: "/docs/performance/run-benchmarks", priority: 0.6, changeFrequency: "monthly" },
    // Configuration
    { url: "/docs/configuration", priority: 0.7, changeFrequency: "monthly" },
    { url: "/docs/configuration/network", priority: 0.6, changeFrequency: "monthly" },
    { url: "/docs/configuration/cache", priority: 0.6, changeFrequency: "monthly" },
    { url: "/docs/configuration/env", priority: 0.6, changeFrequency: "monthly" },
    { url: "/docs/configuration/examples", priority: 0.6, changeFrequency: "monthly" },
    // Self-hosting
    { url: "/docs/self-hosting", priority: 0.7, changeFrequency: "monthly" },
    { url: "/docs/self-hosting/docker", priority: 0.6, changeFrequency: "monthly" },
    { url: "/docs/self-hosting/production", priority: 0.6, changeFrequency: "monthly" },
    { url: "/docs/self-hosting/monitoring", priority: 0.55, changeFrequency: "monthly" },
    // Troubleshooting
    { url: "/docs/troubleshooting", priority: 0.8, changeFrequency: "monthly" },
    { url: "/docs/troubleshooting/fuse", priority: 0.65, changeFrequency: "monthly" },
    { url: "/docs/troubleshooting/network", priority: 0.65, changeFrequency: "monthly" },
    { url: "/docs/troubleshooting/performance", priority: 0.65, changeFrequency: "monthly" },
    { url: "/docs/troubleshooting/help", priority: 0.6, changeFrequency: "monthly" },
    // API
    { url: "/docs/api", priority: 0.6, changeFrequency: "monthly" },
    { url: "/docs/api/messages", priority: 0.55, changeFrequency: "monthly" },
    { url: "/docs/api/errors", priority: 0.55, changeFrequency: "monthly" },
    { url: "/docs/api/building-clients", priority: 0.55, changeFrequency: "monthly" },
  ];

  return pages.map((page) => ({
    url: `${BASE_URL}${page.url}`,
    lastModified: now,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
