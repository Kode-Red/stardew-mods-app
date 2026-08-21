import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { app } from "electron";
import type { GameSource, NexusAccount, Profile } from "../../shared/types.js";

export interface Settings {
  gamePath?: string;
  gameSource?: GameSource;
  nexusApiKey?: string;
  nexusUser?: NexusAccount;
  curseForgeApiKey?: string;
  profiles?: Profile[];
  activeProfileId?: string;
  /** Mod UniqueID -> user-assigned folder/category name. */
  modCategories?: Record<string, string>;
  /** User-created folder names (may be empty of mods). */
  modFolders?: string[];
  /** URL of a community listings index (JSON on GitHub). */
  listingsUrl?: string;
  /** Save folder name -> profile id it was last played under. */
  saveProfiles?: Record<string, string>;
  /** The most recent modded launch, used to associate freshly-played saves. */
  lastModdedLaunch?: { profileId: string; at: number };
}

function settingsFile(): string {
  return join(app.getPath("userData"), "settings.json");
}

export async function readSettings(): Promise<Settings> {
  try {
    const text = await readFile(settingsFile(), "utf8");
    return JSON.parse(text) as Settings;
  } catch {
    return {};
  }
}

export async function writeSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await readSettings();
  const next = { ...current, ...patch };
  await writeFile(settingsFile(), JSON.stringify(next, null, 2), "utf8");
  return next;
}
