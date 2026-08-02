import { describe, it, expect } from "vitest";
import {
  filterFreshPeers,
  formatSpeedBps,
  peerFreshnessLabel,
  sessionsFromHistory,
  type NearbyPeer,
} from "./portal";
import type { ConnectionHistoryItem, ShareHistoryItem } from "./history";

describe("portal helpers", () => {
  it("formatSpeedBps formats human labels", () => {
    expect(formatSpeedBps(0)).toBe("—");
    expect(formatSpeedBps(512 * 1024)).toContain("KB/s");
    expect(formatSpeedBps(12 * 1024 * 1024)).toContain("MB/s");
  });

  it("peerFreshnessLabel covers age buckets", () => {
    const now = 1_000_000;
    expect(peerFreshnessLabel(now - 2_000, now)).toBe("just now");
    expect(peerFreshnessLabel(now - 20_000, now)).toBe("20s ago");
    expect(peerFreshnessLabel(now - 120_000, now)).toBe("2m ago");
    expect(peerFreshnessLabel(now - 4_000_000, now)).toBe("a while ago");
  });

  it("filterFreshPeers drops stale remotes but keeps self", () => {
    const now = 1_000_000;
    const peers: NearbyPeer[] = [
      { id: "self", name: "Me", last_seen_ms: now - 100_000, is_self: true },
      { id: "a", name: "Fresh", last_seen_ms: now - 10_000, is_self: false, join_code: "ABC234" },
      { id: "b", name: "Stale", last_seen_ms: now - 60_000, is_self: false, join_code: "XYZ789" },
    ];
    const fresh = filterFreshPeers(peers, 45_000, now);
    expect(fresh.map((p) => p.id)).toEqual(["self", "a"]);
  });

  it("sessionsFromHistory merges shares and mounts with live first", () => {
    const shares: ShareHistoryItem[] = [
      {
        id: "s1",
        name: "Renders",
        path: "/Users/alex/Renders",
        joinCode: "ABC234",
        shareLink: "https://x/j/ABC-234",
        port: 4433,
        status: "inactive",
        createdAt: 1,
        lastActiveAt: 1,
        expirationOption: "forever",
        expiresAt: null,
        shareMode: "drop",
      },
    ];
    const connections: ConnectionHistoryItem[] = [
      {
        id: "c1",
        name: "Live mount",
        joinCode: "XYZ789",
        mountPoint: "/home/preview/Wormhole/XYZ789",
        status: "connected",
        createdAt: 1,
        lastConnectedAt: 1,
        remoteHost: "Studio Box",
      },
    ];
    const sessions = sessionsFromHistory(shares, connections);
    expect(sessions[0]?.kind).toBe("mounted");
    expect(sessions[0]?.status).toBe("live");
    expect(sessions[1]?.shareMode).toBe("drop");
  });
});
