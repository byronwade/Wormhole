import { describe, expect, it } from "vitest";
import { formatDeviceName } from "./device-name";

describe("formatDeviceName", () => {
  it("humanizes Mac hostnames", () => {
    expect(formatDeviceName("Alexs-MacBook")).toBe("Alex's MacBook");
  });

  it("strips .local", () => {
    expect(formatDeviceName("Studio.local")).toBe("Studio");
  });

  it("handles empty", () => {
    expect(formatDeviceName("")).toBe("");
    expect(formatDeviceName(null)).toBe("");
  });
});
