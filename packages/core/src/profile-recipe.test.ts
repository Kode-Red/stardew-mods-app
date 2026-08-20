import { describe, expect, it } from "vitest";
import { buildRecipe, parseRecipe, serializeRecipe } from "./profile-recipe.js";
import { parseManifest, type Manifest } from "./manifest.js";

function manifest(name: string, id: string, keys: string[] = []): Manifest {
  return parseManifest(
    JSON.stringify({ Name: name, Version: "1.0.0", UniqueID: id, UpdateKeys: keys }),
  );
}

describe("buildRecipe", () => {
  it("includes only enabled mods with a manifest, mapping update keys", () => {
    const recipe = buildRecipe("My Pack", [
      { manifest: manifest("Content Patcher", "Pathoschild.CP", ["Nexus:1915"]), enabled: true },
      { manifest: manifest("Disabled", "me.off"), enabled: false },
      { manifest: null, enabled: true },
    ]);
    expect(recipe.name).toBe("My Pack");
    expect(recipe.formatVersion).toBe(1);
    expect(recipe.mods).toHaveLength(1);
    expect(recipe.mods[0]).toMatchObject({
      uniqueId: "Pathoschild.CP",
      name: "Content Patcher",
      updateKeys: ["Nexus:1915"],
    });
  });
});

describe("parseRecipe", () => {
  it("round-trips a serialized recipe", () => {
    const recipe = buildRecipe("Pack", [
      { manifest: manifest("A", "me.a", ["GitHub:o/r"]), enabled: true },
    ]);
    const parsed = parseRecipe(serializeRecipe(recipe));
    expect(parsed.name).toBe("Pack");
    expect(parsed.mods[0]!.updateKeys).toEqual(["GitHub:o/r"]);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseRecipe("{ not json")).toThrow(/invalid JSON/);
  });

  it("rejects a file that isn't a recipe", () => {
    expect(() => parseRecipe(JSON.stringify({ hello: "world" }))).toThrow(/valid shared profile/);
  });
});
