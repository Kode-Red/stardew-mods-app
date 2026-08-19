import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { GameLocation, GameSource } from "../../shared/types.js";

const execFileAsync = promisify(execFile);

/** Stardew's Steam app id, used to find its install under a Steam library. */
const STEAM_APP_DIR = "Stardew Valley";

async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * A folder is a Stardew install if it has a `Content` folder and one of the
 * known game executables/assemblies (varies by platform and store).
 */
export async function validateGameFolder(path: string): Promise<boolean> {
  if (!(await isDir(join(path, "Content")))) return false;
  const markers = [
    "Stardew Valley.exe",
    "StardewValley.exe",
    "StardewValley.dll",
    "StardewValley", // Linux/Mac executable
    "Stardew Valley", // Mac executable
  ];
  for (const marker of markers) {
    if (await fileExists(join(path, marker))) return true;
  }
  return false;
}

async function toLocation(
  path: string,
  source: GameSource,
): Promise<GameLocation | null> {
  if (!(await validateGameFolder(path))) return null;
  return { path, modsPath: join(path, "Mods"), source };
}

/** Read the Steam base folder from the Windows registry (best effort). */
async function windowsSteamBase(): Promise<string | null> {
  const queries = [
    "HKCU\\SOFTWARE\\Valve\\Steam /v SteamPath",
    "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam /v InstallPath",
  ];
  for (const query of queries) {
    try {
      const { stdout } = await execFileAsync("reg", ["query", ...query.split(" ")]);
      const match = /REG_SZ\s+(.+)$/m.exec(stdout);
      if (match?.[1]) return match[1].trim().replace(/\//g, "\\");
    } catch {
      /* registry key absent */
    }
  }
  return null;
}

/** Parse the `path` entries out of Steam's libraryfolders.vdf. */
function parseSteamLibraries(vdf: string): string[] {
  const paths: string[] = [];
  const re = /"path"\s+"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(vdf)) !== null) {
    paths.push(m[1]!.replace(/\\\\/g, "\\"));
  }
  return paths;
}

async function steamLibraries(steamBase: string): Promise<string[]> {
  const libs = new Set<string>([steamBase]);
  for (const rel of [
    join("steamapps", "libraryfolders.vdf"),
    join("config", "libraryfolders.vdf"),
  ]) {
    try {
      const vdf = await readFile(join(steamBase, rel), "utf8");
      for (const p of parseSteamLibraries(vdf)) libs.add(p);
    } catch {
      /* file absent */
    }
  }
  return [...libs];
}

function defaultCandidates(): Array<{ path: string; source: GameSource }> {
  const home = homedir();
  if (process.platform === "win32") {
    return [
      { path: "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Stardew Valley", source: "steam" },
      { path: "C:\\Program Files\\Steam\\steamapps\\common\\Stardew Valley", source: "steam" },
      { path: "C:\\GOG Games\\Stardew Valley", source: "gog" },
      { path: "C:\\Program Files (x86)\\GalaxyClient\\Games\\Stardew Valley", source: "gog" },
    ];
  }
  if (process.platform === "darwin") {
    return [
      {
        path: join(home, "Library/Application Support/Steam/steamapps/common/Stardew Valley/Contents/MacOS"),
        source: "steam",
      },
    ];
  }
  return [
    { path: join(home, ".steam/steam/steamapps/common/Stardew Valley"), source: "steam" },
    { path: join(home, ".local/share/Steam/steamapps/common/Stardew Valley"), source: "steam" },
    { path: join(home, "GOG Games/Stardew Valley/game"), source: "gog" },
  ];
}

/**
 * Try to locate the Stardew Valley install across Steam libraries, GOG, and the
 * platform's common default paths. Returns the first folder that validates.
 */
export async function locateGame(): Promise<GameLocation | null> {
  const candidates: Array<{ path: string; source: GameSource }> = [];

  if (process.platform === "win32") {
    const steamBase = await windowsSteamBase();
    if (steamBase) {
      for (const lib of await steamLibraries(steamBase)) {
        candidates.push({
          path: join(lib, "steamapps", "common", STEAM_APP_DIR),
          source: "steam",
        });
      }
    }
  } else {
    const home = homedir();
    const bases =
      process.platform === "darwin"
        ? [join(home, "Library/Application Support/Steam")]
        : [join(home, ".steam/steam"), join(home, ".local/share/Steam")];
    for (const base of bases) {
      if (!(await isDir(base))) continue;
      for (const lib of await steamLibraries(base)) {
        candidates.push({
          path: join(lib, "steamapps", "common", STEAM_APP_DIR),
          source: "steam",
        });
      }
    }
  }

  candidates.push(...defaultCandidates());

  for (const { path, source } of candidates) {
    const location = await toLocation(path, source);
    if (location) return location;
  }
  return null;
}

/** Validate a user-picked folder and turn it into a GameLocation. */
export async function locationFromFolder(path: string): Promise<GameLocation | null> {
  return toLocation(path, "manual");
}
