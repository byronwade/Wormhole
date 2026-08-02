import { describe, it, expect, vi, beforeEach } from "vitest";
import { folderDisplayName, mountLabelFromCode, resolveDefaultMountPath } from "./paths";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string, args?: { label?: string }) => {
    if (cmd === "default_mount_path") {
      return Promise.resolve(`/home/test/Wormhole/${args?.label ?? "mount"}`);
    }
    return Promise.resolve(null);
  }),
}));

import { invoke } from "@tauri-apps/api/core";

describe("paths helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("folderDisplayName returns last segment", () => {
    expect(folderDisplayName("/Users/alex/Renders")).toBe("Renders");
    expect(folderDisplayName("C:\\Users\\alex\\Renders")).toBe("Renders");
  });

  it("mountLabelFromCode formats join code", () => {
    expect(mountLabelFromCode("ABC234")).toBe("Share-ABC-234");
  });

  it("resolveDefaultMountPath invokes Tauri command", async () => {
    const path = await resolveDefaultMountPath("ABC-234");
    expect(invoke).toHaveBeenCalledWith("default_mount_path", { label: "ABC234" });
    expect(path).toContain("Wormhole");
  });
});
