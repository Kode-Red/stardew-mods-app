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

  await spawnDetached(exe, gamePath);
}

/**
 * Launch an executable detached from the app.
 *
 * On Windows, SMAPI's `StardewModdingAPI.exe` is a **console** application. A
 * plain detached spawn from a GUI process (Electron) doesn't give it a usable
 * console, so it can exit immediately — which is why "Launch modded" failed
 * while the GUI "Launch without mods" worked. Launching via `cmd /c start`
 * mimics a double-click: the OS gives the process its own console and the
 * correct working directory. On macOS/Linux a direct spawn is fine.
 */
export interface LaunchCommand {
  command: string;
  args: string[];
}

/** Build the platform-specific command that launches `exe` from `cwd`. */
export function buildLaunchCommand(
  exe: string,
  cwd: string,
  platform: NodeJS.Platform = process.platform,
): LaunchCommand {
  if (platform === "win32") {
    // `start "" /d <cwd> <exe>` gives console apps (SMAPI) their own console.
    return { command: "cmd.exe", args: ["/c", "start", "", "/d", cwd, exe] };
  }
  return { command: exe, args: [] };
}

function spawnDetached(exe: string, cwd: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const { command, args } = buildLaunchCommand(exe, cwd);

    const child = spawn(command, args, {
      cwd,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", (err) => reject(new Error(`Couldn't start the game: ${err.message}`)));
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
