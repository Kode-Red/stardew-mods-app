import { describe, expect, it } from "vitest";
import { normaliseGithubRepo, parseListingsIndex } from "./listings.js";

describe("normaliseGithubRepo", () => {
  it("accepts owner/repo and github URLs", () => {
    expect(normaliseGithubRepo("Pathoschild/StardewMods")).toBe("Pathoschild/StardewMods");
    expect(normaliseGithubRepo("https://github.com/Pathoschild/StardewMods")).toBe("Pathoschild/StardewMods");
    expect(normaliseGithubRepo("https://github.com/Pathoschild/StardewMods.git")).toBe("Pathoschild/StardewMods");
  });
  it("rejects non-repos", () => {
    expect(normaliseGithubRepo("just-a-name")).toBeNull();
    expect(normaliseGithubRepo("")).toBeNull();
  });
});

describe("parseListingsIndex", () => {
  const listing = {
    name: "Content Patcher",
    author: "Pathoschild",
    summary: "Loads content packs.",
    github: "Pathoschild/StardewMods",
    image: "https://x/img.png",
    category: "Framework",
  };

  it("parses a { mods: [...] } index", () => {
    const list = parseListingsIndex({ mods: [listing] });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Content Patcher", githubRepo: "Pathoschild/StardewMods" });
  });

  it("parses a bare array and skips invalid entries", () => {
    const list = parseListingsIndex([listing, { name: "No repo" }, { nope: true }]);
    expect(list).toHaveLength(1);
  });

  it("returns [] for junk input", () => {
    expect(parseListingsIndex(null)).toEqual([]);
    expect(parseListingsIndex(42)).toEqual([]);
  });
});
