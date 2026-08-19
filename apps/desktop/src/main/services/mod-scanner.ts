import { readdir, readFile, stat } from "node:fs/promises";
import { join, posix } from "node:path";
import { isDisabledFolderName, parseManifest, toEnabledFolderName } from "@sdm/core";
import type { ScannedMod } from "../../shared/types.js";

/** Max folder depth to search under Mods/ for a manifest.json. */
const MAX_DEPTH = 4;

async function readManifestIn(dir: string): Promise<string | null> {
  // manifest.json, tolerating case differences (SMAPI is case-insensitive).
  try {
    const entries = await readdir(dir);
    const match = entries.find((e) => e.toLowerCase() === "manifest.json");
    if (!match) return null;
    return await readFile(join(dir, match), "utf8");
  } catch {
    return null;
  }
}

function toScannedMod(relativeParts: string[], json: string): ScannedMod {
  const relativePath = relativeParts.join(posix.sep);
  const folderName = relativeParts[relativeParts.length - 1]!;
  // A mod is disabled if any segment in its path starts with a dot.
  const enabled = !relativeParts.some((p) => isDisabledFolderName(p));

  const base: ScannedMod = {
    relativePath,
    folderName,
    displayName: toEnabledFolderName(folderName),
    enabled,
    manifest: null,
    error: null,
  };

  try {
    base.manifest = parseManifest(json);
    base.displayName = base.manifest.name || base.displayName;
  } catch (err) {
    base.error = (err as Error).message;
  }
  return base;
}

/**
 * Recursively scan `Mods/` for mods. A folder containing a manifest.json is a
 * mod; we do not descend past it (its subfolders belong to that mod).
 */
export async function scanMods(modsPath: string): Promise<ScannedMod[]> {
  const results: ScannedMod[] = [];

  async function walk(dir: string, relativeParts: string[], depth: number): Promise<void> {
    if (depth > MAX_DEPTH) return;

    const json = await readManifestIn(dir);
    if (json !== null && relativeParts.length > 0) {
      results.push(toScannedMod(relativeParts, json));
      return; // don't descend into a mod's own folder
    }

    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      try {
        if (!(await stat(full)).isDirectory()) continue;
      } catch {
        continue;
      }
      await walk(full, [...relativeParts, entry], depth + 1);
    }
  }

  await walk(modsPath, [], 0);
  results.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return results;
}
