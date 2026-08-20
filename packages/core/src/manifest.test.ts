import { describe, expect, it } from "vitest";
import {
  ManifestParseError,
  parseManifest,
  tryParseManifest,
} from "./manifest.js";

const CSHARP_MOD = JSON.stringify({
  Name: "Content Patcher",
  Author: "Pathoschild",
  Version: "2.0.0",
  Description: "Loads content packs.",
  UniqueID: "Pathoschild.ContentPatcher",
  EntryDll: "ContentPatcher.dll",
  MinimumApiVersion: "4.0.0",
  UpdateKeys: ["Nexus:1915", "GitHub:Pathoschild/StardewMods"],
  Dependencies: [
    { UniqueID: "Some.Library", MinimumVersion: "1.2.0" },
    { UniqueID: "Optional.Thing", IsRequired: false },
  ],
});

const CONTENT_PACK = JSON.stringify({
  Name: "My Cabin Retexture",
  Version: "1.0",
  UniqueID: "me.cabinretexture",
  ContentPackFor: { UniqueID: "Pathoschild.ContentPatcher", MinimumVersion: "2.0.0" },
});

describe("parseManifest", () => {
  it("parses and normalises a C# mod manifest", () => {
    const m = parseManifest(CSHARP_MOD);
    expect(m.name).toBe("Content Patcher");
    expect(m.uniqueId).toBe("Pathoschild.ContentPatcher");
    expect(m.entryDll).toBe("ContentPatcher.dll");
    expect(m.isContentPack).toBe(false);
    expect(m.updateKeys.map((k) => k.site)).toEqual(["Nexus", "GitHub"]);
  });

  it("marks required vs optional dependencies (defaulting to required)", () => {
    const m = parseManifest(CSHARP_MOD);
    const required = m.dependencies.find((d) => d.uniqueId === "Some.Library");
    const optional = m.dependencies.find((d) => d.uniqueId === "Optional.Thing");
    expect(required?.required).toBe(true);
    expect(required?.minimumVersion).toBe("1.2.0");
    expect(optional?.required).toBe(false);
  });

  it("detects a content pack", () => {
    const m = parseManifest(CONTENT_PACK);
    expect(m.isContentPack).toBe(true);
    expect(m.contentPackFor?.uniqueId).toBe("Pathoschild.ContentPatcher");
  });

  it("tolerates a BOM and comments", () => {
    const withNoise = "﻿{\n  // the mod name\n  \"Name\": \"X\",\n  \"Version\": \"1.0.0\",\n  \"UniqueID\": \"a.b\" /* id */\n}";
    expect(parseManifest(withNoise).name).toBe("X");
  });

  it("does not strip comment-like text inside strings", () => {
    const m = parseManifest(
      '{"Name":"http://x // y","Version":"1.0.0","UniqueID":"a.b"}',
    );
    expect(m.name).toBe("http://x // y");
  });

  it("keeps an odd version string instead of rejecting the manifest", () => {
    // A manager should still list a mod whose version isn't textbook semver.
    const m = parseManifest('{"Name":"X","Version":"1.0.0.0","UniqueID":"a.b"}');
    expect(m.version).toBe("1.0.0.0");
  });

  it("coerces a non-string author", () => {
    const m = parseManifest('{"Name":"X","Version":"1.0.0","UniqueID":"a.b","Author":["A","B"]}');
    expect(m.author).toBe("A, B");
  });

  it("throws when required fields are missing", () => {
    expect(() => parseManifest('{"Name":"X"}')).toThrow(ManifestParseError);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseManifest("{ not json")).toThrow(ManifestParseError);
  });

  it("tryParseManifest reports failure without throwing", () => {
    const r = tryParseManifest("{ not json");
    expect(r.ok).toBe(false);
  });
});
