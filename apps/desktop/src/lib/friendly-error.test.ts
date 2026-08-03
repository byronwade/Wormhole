import { describe, expect, it } from "vitest";
import { friendlyError, peerOfflineMessage } from "./friendly-error";

describe("friendlyError", () => {
  it("maps timeouts", () => {
    expect(friendlyError("Timed out waiting for peer handshake", "mount")).toMatch(
      /didn’t answer|didn't answer/i,
    );
  });

  it("maps connection refused", () => {
    expect(friendlyError("Failed to connect: Connection refused", "mount")).toMatch(
      /reach|Wi/i,
    );
  });

  it("avoids dumping anyhow chains", () => {
    const msg = friendlyError("{ kind: Io, source: ... }", "mount");
    expect(msg.length).toBeLessThan(120);
    expect(msg).not.toContain("{");
  });
});

describe("peerOfflineMessage", () => {
  it("names the peer", () => {
    expect(peerOfflineMessage("Jordan")).toContain("Jordan");
  });
});
