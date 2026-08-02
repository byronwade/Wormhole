import type {
  ConnectionHistoryItem,
  ExpirationOption,
  ShareHistoryItem,
} from "@/types/history";

/** Long-lived mount vs ephemeral drop share. */
export type ShareMode = "mount" | "drop";

export type PortalSessionKind = "sharing" | "mounted";

export interface PortalSession {
  id: string;
  kind: PortalSessionKind;
  title: string;
  subtitle: string;
  joinCode: string;
  path: string;
  status: "live" | "idle" | "connecting" | "error" | "expired";
  peerName?: string;
  shareMode?: ShareMode;
  expirationOption?: ExpirationOption;
  expiresAt?: number | null;
  speedLabel?: string | null;
  errorMessage?: string;
}

export interface NearbyPeer {
  id: string;
  name: string;
  join_code?: string | null;
  port?: number | null;
  last_seen_ms: number;
  is_self: boolean;
}

export function sessionsFromHistory(
  shares: ShareHistoryItem[],
  connections: ConnectionHistoryItem[],
  speedById: Record<string, string | null | undefined> = {},
): PortalSession[] {
  const sharing: PortalSession[] = shares.map((s) => ({
    id: s.id,
    kind: "sharing",
    title: s.name || folderLeaf(s.path),
    subtitle: s.path,
    joinCode: s.joinCode,
    path: s.path,
    status:
      s.status === "active"
        ? "live"
        : s.status === "expired"
          ? "expired"
          : "idle",
    peerName: undefined,
    shareMode: (s as ShareHistoryItem & { shareMode?: ShareMode }).shareMode ?? "mount",
    expirationOption: s.expirationOption,
    expiresAt: s.expiresAt,
    speedLabel: speedById[s.id] ?? null,
  }));

  const mounted: PortalSession[] = connections.map((c) => ({
    id: c.id,
    kind: "mounted",
    title: c.name || c.remoteHost || folderLeaf(c.mountPoint) || "Mounted share",
    subtitle: c.mountPoint,
    joinCode: c.joinCode,
    path: c.mountPoint,
    status:
      c.status === "connected"
        ? "live"
        : c.status === "connecting"
          ? "connecting"
          : c.status === "error"
            ? "error"
            : "idle",
    peerName: c.remoteHost,
    speedLabel: speedById[c.id] ?? null,
    errorMessage: c.errorMessage,
  }));

  // Live sessions first
  const rank = (s: PortalSession) =>
    s.status === "live" || s.status === "connecting" ? 0 : 1;
  return [...sharing, ...mounted].sort((a, b) => rank(a) - rank(b));
}

function folderLeaf(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

export function formatSpeedBps(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return "—";
  const mb = bps / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB/s`;
  const kb = bps / 1024;
  return `${kb.toFixed(0)} KB/s`;
}

/** Freshness label for LAN peers (ms since last_seen_ms epoch). */
export function peerFreshnessLabel(lastSeenMs: number, nowMs = Date.now()): string {
  const age = Math.max(0, nowMs - lastSeenMs);
  if (age < 8_000) return "just now";
  if (age < 60_000) return `${Math.round(age / 1000)}s ago`;
  if (age < 3_600_000) return `${Math.round(age / 60_000)}m ago`;
  return "a while ago";
}

/** Drop peers not seen within maxAgeMs (default 45s). */
export function filterFreshPeers(peers: NearbyPeer[], maxAgeMs = 45_000, nowMs = Date.now()): NearbyPeer[] {
  return peers.filter((p) => p.is_self || nowMs - p.last_seen_ms <= maxAgeMs);
}
