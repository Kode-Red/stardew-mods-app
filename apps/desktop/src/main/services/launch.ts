import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { LaunchMode } from "../../shared/types.js";

const MODDED_EXECUTABLES = ["StardewModdingAPI.exe", "StardewModdingAPI"];
const VANILLA_EXECUTABLES = [
  "Stardew Valley.exe",
  "StardewValley.exe",
  "StardewValley",
  "Stardew Valley",
];

async function firstExisting(paths: string[]): Promise<string | null> {
  for (const path of paths) {
    try {
      await stat(path);
      return path;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

/**
 * Launch the game. "modded" runs SMAPI (which loads mods); "vanilla" runs the
 * base game executable directly, bypassing SMAPI so no mods load.
 */
export async function launchGame(gamePath: string, mode: LaunchMode): Promise<void> {
  const names = mode === "modded" ? MODDED_EXECUTABLES : VANILLA_EXECUTABLES;
  const exe = await firstExisting(names.map((name) => join(gamePath, name)));
  if (!exe) {
    throw new Error(
      mode === "modded"
        ? "SMAPI isn't installed in this folder — install SMAPI first."
        : "Couldn't find the Stardew Valley executable.",
    );
  }

  const child = spawn(exe, [], { cwd: gamePath, detached: true, stdio: "ignore" });
  child.unref();
}
