import { describe, expect, it } from "vitest";
import { isNxmLink, parseNxmLink } from "./nxm.js";

describe("parseNxmLink", () => {
  it("parses a full website download link", () => {
    const link = parseNxmLink(
      "nxm://stardewvalley/mods/1915/files/98765?key=abc123&expires=1700000000&user_id=42",
    );
    expect(link).toEqual({
      game: "stardewvalley",
      modId: 1915,
      fileId: 98765,
      key: "abc123",
      expires: 1700000000,
      userId: 42,
    });
  });

  it("parses a link without query params (premium)", () => {
    const link = parseNxmLink("nxm://stardewvalley/mods/1/files/2");
    expect(link).toMatchObject({ modId: 1, fileId: 2, key: null, expires: null });
  });

  it("lowercases the game domain", () => {
    expect(parseNxmLink("nxm://StardewValley/mods/1/files/2")?.game).toBe(
      "stardewvalley",
    );
  });

  it("rejects malformed links", () => {
    expect(parseNxmLink("https://example.com")).toBeNull();
    expect(parseNxmLink("nxm://stardewvalley/mods/1")).toBeNull();
    expect(parseNxmLink("nxm://stardewvalley/collections/1")).toBeNull();
  });

  it("isNxmLink recognises the scheme", () => {
    expect(isNxmLink("nxm://stardewvalley/mods/1/files/2")).toBe(true);
    expect(isNxmLink("nope")).toBe(false);
  });
});
