import { describe, expect, it } from "vitest";
import {
  extractJoinCode,
  formatJoinCode,
  isValidJoinCode,
  joinCodeQrPayload,
  normalizeJoinCode,
} from "./join-code";

describe("join-code", () => {
  it("normalizes and formats", () => {
    expect(normalizeJoinCode("abc-123")).toBe("ABC123");
    expect(formatJoinCode("ABC123")).toBe("ABC-123");
  });

  it("validates unambiguous alphabet", () => {
    expect(isValidJoinCode("ABC-234")).toBe(true);
    expect(isValidJoinCode("ABC10I")).toBe(false); // 1 and I ambiguous
  });

  it("extracts from urls and deep links", () => {
    expect(extractJoinCode("wormhole://join/ABC-234")).toBe("ABC234");
    expect(extractJoinCode("https://wormhole.byronwade.com/j/ABC-234")).toBe(
      "ABC234",
    );
    expect(extractJoinCode("not-a-code")).toBeNull();
  });

  it("builds qr payload", () => {
    expect(joinCodeQrPayload("ABC234")).toBe("wormhole://join/ABC-234");
  });
});
