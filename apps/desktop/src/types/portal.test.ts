import { describe, it, expect } from "vitest";
import { formatSpeedBps, sessionsFromHistory } from "./portal";
import type { ConnectionHistoryItem, ShareHistoryItem } from "./history";

describe("portal helpers", () => {
  it("formatSpeedBps formats human labels", () => {
    expect(formatSpeedBps(0)).toBe("—");
    expect(formatSpeedBps(512 * 1024)).toContain("KB/s");
    expect(formatSpeedBps(12 * 1024 * 1024)).toContain("MB/s");
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
