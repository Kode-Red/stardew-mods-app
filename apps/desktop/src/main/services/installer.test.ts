import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installArchive } from "./installer.js";
import { ArchiveError } from "./archive.js";

let modsPath: string;

const manifest = (name: string, id: string, version = "1.0.0"): Uint8Array =>
  strToU8(JSON.stringify({ Name: name, Version: version, UniqueID: id }));

function zip(entries: Record<string, Uint8Array>): Uint8Array {
  return zipSync(entries);
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

beforeEach(async () => {
  modsPath = await mkdtemp(join(tmpdir(), "sdm-install-"));
});

afterEach(async () => {
  await rm(modsPath, { recursive: true, force: true });
});

describe("installArchive", () => {
  it("installs a wrapper-folder mod and reports its manifest", async () => {
    const buffer = zip({
      "ContentPatcher/manifest.json": manifest("Content Patcher", "Pathoschild.CP", "2.0.0"),
      "ContentPatcher/ContentPatcher.dll": strToU8("binary"),
    });

    const installed = await installArchive(buffer, {
      modsPath,
      archiveName: "ContentPatcher-2.0.zip",
    });

    expect(installed).toEqual([
      { installName: "ContentPatcher", uniqueId: "Pathoschild.CP", name: "Content Patcher", version: "2.0.0" },
    ]);
    expect(await exists(join(modsPath, "ContentPatcher", "manifest.json"))).toBe(true);
    expect(await exists(join(modsPath, "ContentPatcher", "ContentPatcher.dll"))).toBe(true);
  });

  it("installs a root-manifest archive using the archive name", async () => {
    const buffer = zip({ "manifest.json": manifest("Cool Mod", "me.cool") });
    const installed = await installArchive(buffer, { modsPath, archiveName: "CoolMod-1.0.zip" });
    expect(installed[0]!.installName).toBe("CoolMod-1.0");
    expect(await exists(join(modsPath, "CoolMod-1.0", "manifest.json"))).toBe(true);
  });

  it("installs a bundle of sibling mods", async () => {
    const buffer = zip({
      "ModA/manifest.json": manifest("Mod A", "me.a"),
      "ModB/manifest.json": manifest("Mod B", "me.b"),
    });
    const installed = await installArchive(buffer, { modsPath, archiveName: "bundle.zip" });
    expect(installed.map((m) => m.installName).sort()).toEqual(["ModA", "ModB"]);
  });

  it("replaces an existing install cleanly", async () => {
    await installArchive(zip({ "Mod/manifest.json": manifest("Mod", "me.mod", "1.0.0"), "Mod/old.txt": strToU8("x") }), {
      modsPath,
      archiveName: "mod.zip",
    });
    await installArchive(zip({ "Mod/manifest.json": manifest("Mod", "me.mod", "2.0.0") }), {
      modsPath,
      archiveName: "mod.zip",
    });
    // Stale file from the first install is gone after the clean replace.
    expect(await exists(join(modsPath, "Mod", "old.txt"))).toBe(false);
    const json = JSON.parse(await readFile(join(modsPath, "Mod", "manifest.json"), "utf8"));
    expect(json.Version).toBe("2.0.0");
  });

  it("guards against zip-slip path traversal", async () => {
    const buffer = zip({
      "Mod/manifest.json": manifest("Mod", "me.mod"),
      "Mod/../../escape.txt": strToU8("evil"),
    });
    await installArchive(buffer, { modsPath, archiveName: "mod.zip" });
    // The traversal entry must not have been written above modsPath.
    expect(await exists(join(modsPath, "..", "escape.txt"))).toBe(false);
  });

  it("throws when the archive contains no SMAPI mod", async () => {
    const buffer = zip({ "readme.txt": strToU8("no mod here") });
    await expect(
      installArchive(buffer, { modsPath, archiveName: "empty.zip" }),
    ).rejects.toBeInstanceOf(ArchiveError);
  });
});
