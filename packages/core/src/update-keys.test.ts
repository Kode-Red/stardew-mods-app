import { describe, expect, it } from "vitest";
import { parseUpdateKey, parseUpdateKeys } from "./update-keys.js";

describe("parseUpdateKey", () => {
  it("parses a Nexus key", () => {
    expect(parseUpdateKey("Nexus:1234")).toMatchObject({
      site: "Nexus",
      id: "1234",
      subkey: null,
    });
  });

  it("normalises site casing and aliases", () => {
    expect(parseUpdateKey("nexusmods:5")?.site).toBe("Nexus");
    expect(parseUpdateKey("CURSE:9")?.site).toBe("CurseForge");
  });

  it("keeps GitHub owner/repo ids intact", () => {
    expect(parseUpdateKey("GitHub:Pathoschild/StardewMods")?.id).toBe(
      "Pathoschild/StardewMods",
    );
  });

  it("extracts an @subkey qualifier", () => {
    expect(parseUpdateKey("Nexus:1234@Linux")).toMatchObject({
      id: "1234",
      subkey: "Linux",
    });
  });

  it("produces a normalised raw form", () => {
    expect(parseUpdateKey("  moddrop : 42 ")?.raw).toBe("ModDrop:42");
  });

  it("rejects unknown sites and malformed keys", () => {
    expect(parseUpdateKey("Steam:1")).toBeNull();
    expect(parseUpdateKey("Nexus")).toBeNull();
    expect(parseUpdateKey(":1234")).toBeNull();
    expect(parseUpdateKey("Nexus:")).toBeNull();
  });
});

describe("parseUpdateKeys", () => {
  it("drops malformed keys and keeps the rest", () => {
    const keys = parseUpdateKeys(["Nexus:1", "garbage", "GitHub:a/b"]);
    expect(keys.map((k) => k.site)).toEqual(["Nexus", "GitHub"]);
  });
});
