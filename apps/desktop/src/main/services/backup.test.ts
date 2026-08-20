import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { zipFolder } from "./backup.js";
import { extractZip } from "./archive.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "sdm-backup-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("zipFolder", () => {
  it("zips folder contents with relative paths that round-trip", async () => {
    const mods = join(root, "Mods");
    await mkdir(join(mods, "ContentPatcher"), { recursive: true });
    await writeFile(join(mods, "ContentPatcher", "manifest.json"), '{"Name":"CP"}');
    await writeFile(join(mods, "ContentPatcher", "config.json"), "{}");
    await mkdir(join(mods, ".Disabled"), { recursive: true });
    await writeFile(join(mods, ".Disabled", "manifest.json"), '{"Name":"D"}');

    const entries = extractZip(await zipFolder(mods));

    expect([...entries.keys()].sort()).toEqual([
      ".Disabled/manifest.json",
      "ContentPatcher/config.json",
      "ContentPatcher/manifest.json",
    ]);
    expect(new TextDecoder().decode(entries.get("ContentPatcher/manifest.json"))).toBe('{"Name":"CP"}');
  });
});
