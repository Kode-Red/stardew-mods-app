/**
 * Shareable profile recipes ("modpacks").
 *
 * A recipe describes *which* mods a profile contains and *where to get them* —
 * never the mod files themselves. Sharing the recipe is legal because no
 * copyrighted files are redistributed; the importer re-downloads each mod from
 * its original source (via its update key), exactly like Nexus Collections.
 */

import { z } from "zod";
import type { Manifest } from "./manifest.js";

export interface RecipeMod {
  uniqueId: string;
  name: string;
  version: string | null;
  /** Raw update-key strings, e.g. "Nexus:1915", "GitHub:owner/repo". */
  updateKeys: string[];
}

export interface ProfileRecipe {
  formatVersion: 1;
  name: string;
  createdAt: string;
  mods: RecipeMod[];
}

const recipeModSchema = z.object({
  uniqueId: z.string().min(1),
  name: z.string(),
  version: z.string().nullish(),
  updateKeys: z.array(z.string()).default([]),
});

const recipeSchema = z.object({
  formatVersion: z.literal(1),
  name: z.string().min(1),
  createdAt: z.string().optional(),
  mods: z.array(recipeModSchema),
});

/** Build a recipe from a profile's *enabled* mods (disabled/invalid ones are skipped). */
export function buildRecipe(
  name: string,
  mods: readonly { manifest: Manifest | null; enabled: boolean }[],
): ProfileRecipe {
  const entries: RecipeMod[] = [];
  for (const mod of mods) {
    if (!mod.enabled || !mod.manifest) continue;
    entries.push({
      uniqueId: mod.manifest.uniqueId,
      name: mod.manifest.name,
      version: mod.manifest.version,
      updateKeys: mod.manifest.updateKeys.map((k) => k.raw),
    });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return { formatVersion: 1, name, createdAt: new Date().toISOString(), mods: entries };
}

export function serializeRecipe(recipe: ProfileRecipe): string {
  return JSON.stringify(recipe, null, 2);
}

/** Parse + validate a recipe file. Throws a friendly error on malformed input. */
export function parseRecipe(json: string): ProfileRecipe {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("That file isn't a valid profile (invalid JSON).");
  }
  const parsed = recipeSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("That file isn't a valid shared profile.");
  }
  return {
    formatVersion: 1,
    name: parsed.data.name,
    createdAt: parsed.data.createdAt ?? new Date().toISOString(),
    mods: parsed.data.mods.map((m) => ({
      uniqueId: m.uniqueId,
      name: m.name,
      version: m.version ?? null,
      updateKeys: m.updateKeys,
    })),
  };
}
