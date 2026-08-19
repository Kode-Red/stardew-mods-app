import { describe, expect, it } from "vitest";
import { archiveBaseName, planInstall } from "./install-plan.js";

describe("planInstall", () => {
  it("treats a root manifest as the whole archive, named from the file", () => {
    expect(planInstall(["manifest.json"], { archiveName: "CoolMod-1.2.3.zip" })).toEqual([
      { sourceDir: "", installName: "CoolMod-1.2.3" },
    ]);
  });

  it("installs a single wrapper folder by its name", () => {
    expect(
      planInstall(["ContentPatcher/manifest.json"], { archiveName: "cp.zip" }),
    ).toEqual([{ sourceDir: "ContentPatcher", installName: "ContentPatcher" }]);
  });

  it("keeps only the top folder when content packs are nested inside", () => {
    const plan = planInstall(
      ["BigMod/manifest.json", "BigMod/assets/manifest.json"],
      { archiveName: "big.zip" },
    );
    expect(plan).toEqual([{ sourceDir: "BigMod", installName: "BigMod" }]);
  });

  it("installs sibling mods as separate folders (a bundle)", () => {
    const plan = planInstall(
      ["ModA/manifest.json", "ModB/manifest.json"],
      { archiveName: "bundle.zip" },
    );
    expect(plan).toEqual([
      { sourceDir: "ModA", installName: "ModA" },
      { sourceDir: "ModB", installName: "ModB" },
    ]);
  });

  it("returns nothing when the archive has no manifest", () => {
    expect(planInstall([], { archiveName: "empty.zip" })).toEqual([]);
  });
});

describe("archiveBaseName", () => {
  it("strips known archive extensions", () => {
    expect(archiveBaseName("Mod.zip")).toBe("Mod");
    expect(archiveBaseName("Mod.7z")).toBe("Mod");
    expect(archiveBaseName("Mod")).toBe("Mod");
  });
  it("falls back when empty", () => {
    expect(archiveBaseName(".zip")).toBe("Mod");
  });
});
