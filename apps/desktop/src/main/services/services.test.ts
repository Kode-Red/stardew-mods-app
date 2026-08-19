import { mkdtemp, mkdir, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanMods } from "./mod-scanner.js";
import { setModEnabled } from "./mod-toggle.js";
import { validateGameFolder } from "./game-locator.js";
import { detectSmapi } from "./smapi.js";

let root: string;

function manifest(name: string, id: string, version = "1.0.0"): string {
  return JSON.stringify({ Name: name, Version: version, UniqueID: id });
}

async function makeMod(modsPath: string, folder: string, content: string): Promise<void> {
  const dir = join(modsPath, folder);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "manifest.json"), content);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "sdm-test-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("scanMods", () => {
  it("finds mods, honours disabled dot-folders, and reports parse errors", async () => {
    const mods = join(root, "Mods");
    await makeMod(mods, "ContentPatcher", manifest("Content Patcher", "Pathoschild.CP"));
    await makeMod(mods, ".DisabledMod", manifest("Disabled Mod", "me.disabled"));
    await makeMod(mods, "Broken", "{ not valid json");
    await mkdir(join(mods, "JustAFolder"), { recursive: true });
    await writeFile(join(mods, "JustAFolder", "readme.txt"), "hi");

    const result = await scanMods(mods);
    expect(result).toHaveLength(3); // JustAFolder ignored (no manifest)

    const cp = result.find((m) => m.folderName === "ContentPatcher");
    expect(cp?.enabled).toBe(true);
    expect(cp?.manifest?.uniqueId).toBe("Pathoschild.CP");
    expect(cp?.displayName).toBe("Content Patcher");

    const disabled = result.find((m) => m.folderName === ".DisabledMod");
    expect(disabled?.enabled).toBe(false);
    expect(disabled?.displayName).toBe("Disabled Mod");

    const broken = result.find((m) => m.folderName === "Broken");
    expect(broken?.manifest).toBeNull();
    expect(broken?.error).toBeTruthy();
  });

  it("does not descend into a mod's own subfolders", async () => {
    const mods = join(root, "Mods");
    await makeMod(mods, "BigMod", manifest("Big Mod", "me.big"));
    await makeMod(mods, join("BigMod", "assets"), manifest("nested", "me.nested"));

    const result = await scanMods(mods);
    expect(result.map((m) => m.folderName)).toEqual(["BigMod"]);
  });
});

describe("setModEnabled", () => {
  it("disables and re-enables a mod by renaming its folder", async () => {
    const mods = join(root, "Mods");
    await makeMod(mods, "ContentPatcher", manifest("Content Patcher", "Pathoschild.CP"));

    await setModEnabled(mods, "ContentPatcher", false);
    expect(await readdir(mods)).toContain(".ContentPatcher");
    expect((await scanMods(mods))[0]!.enabled).toBe(false);

    await setModEnabled(mods, ".ContentPatcher", true);
    expect(await readdir(mods)).toContain("ContentPatcher");
    expect((await scanMods(mods))[0]!.enabled).toBe(true);
  });

  it("is a no-op when already in the desired state", async () => {
    const mods = join(root, "Mods");
    await makeMod(mods, "ContentPatcher", manifest("Content Patcher", "Pathoschild.CP"));
    await setModEnabled(mods, "ContentPatcher", true); // already enabled
    expect(await readdir(mods)).toContain("ContentPatcher");
  });
});

describe("validateGameFolder", () => {
  it("accepts a folder with Content/ and a game executable", async () => {
    await mkdir(join(root, "Content"), { recursive: true });
    await writeFile(join(root, "Stardew Valley.exe"), "");
    expect(await validateGameFolder(root)).toBe(true);
  });

  it("rejects a folder missing the markers", async () => {
    await mkdir(join(root, "Content"), { recursive: true });
    expect(await validateGameFolder(root)).toBe(false);
    expect(await validateGameFolder(join(root, "nope"))).toBe(false);
  });
});

describe("detectSmapi", () => {
  it("reports installed when StardewModdingAPI is present", async () => {
    await writeFile(join(root, "StardewModdingAPI.dll"), "");
    const info = await detectSmapi(root);
    expect(info.installed).toBe(true);
  });

  it("reports not installed otherwise", async () => {
    const info = await detectSmapi(root);
    expect(info.installed).toBe(false);
    expect(info.version).toBeNull();
  });
});
