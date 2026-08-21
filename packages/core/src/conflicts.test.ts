import { describe, expect, it } from "vitest";
import { conflictCount, detectConflicts, type ConflictMod } from "./conflicts.js";
import { parseManifest, type Manifest } from "./manifest.js";

function mod(name: string, id: string, opts: { version?: string; deps?: { id: string; min?: string }[] } = {}): Manifest {
  return parseManifest(
    JSON.stringify({
      Name: name,
      Version: opts.version ?? "1.0.0",
      UniqueID: id,
      Dependencies: (opts.deps ?? []).map((d) => ({ UniqueID: d.id, MinimumVersion: d.min })),
    }),
  );
}

function entry(manifest: Manifest | null, enabled = true): ConflictMod {
  return { folderName: manifest?.name ?? "x", manifest, enabled };
}

describe("detectConflicts", () => {
  it("flags duplicate UniqueIDs among enabled mods", () => {
    const c = detectConflicts([
      entry(mod("Content Patcher", "Pathoschild.CP")),
      entry(mod("Content Patcher (copy)", "Pathoschild.CP")),
    ]);
    expect(c.duplicateIds).toHaveLength(1);
    expect(c.duplicateIds[0]).toMatchObject({ uniqueId: "Pathoschild.CP" });
    expect(c.duplicateIds[0]!.names).toHaveLength(2);
  });

  it("ignores duplicates when one copy is disabled", () => {
    const c = detectConflicts([
      entry(mod("CP", "Pathoschild.CP")),
      entry(mod("CP copy", "Pathoschild.CP"), false),
    ]);
    expect(c.duplicateIds).toHaveLength(0);
  });

  it("flags a missing required dependency", () => {
    const c = detectConflicts([
      entry(mod("My Mod", "me.mod", { deps: [{ id: "some.lib" }] })),
    ]);
    expect(c.missingDependencies).toEqual([
      { modName: "My Mod", dependencyId: "some.lib", reason: "missing" },
    ]);
  });

  it("flags an outdated dependency", () => {
    const c = detectConflicts([
      entry(mod("My Mod", "me.mod", { deps: [{ id: "some.lib", min: "2.0.0" }] })),
      entry(mod("Lib", "some.lib", { version: "1.0.0" })),
    ]);
    expect(c.missingDependencies[0]).toMatchObject({ dependencyId: "some.lib", reason: "outdated" });
  });

  it("reports no conflicts for a clean set", () => {
    const c = detectConflicts([
      entry(mod("A", "me.a")),
      entry(mod("B", "me.b", { deps: [{ id: "me.a" }] })),
    ]);
    expect(conflictCount(c)).toBe(0);
  });
});
