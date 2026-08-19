import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { SmapiInfo } from "../../shared/types.js";

const execFileAsync = promisify(execFile);

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Read the file's product version via PowerShell (Windows only). */
async function windowsFileVersion(path: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("powershell", [
      "-NoProfile",
      "-Command",
      `(Get-Item -LiteralPath ${JSON.stringify(path)}).VersionInfo.ProductVersion`,
    ]);
    const version = stdout.trim();
    return version || null;
  } catch {
    return null;
  }
}

/**
 * Detect whether SMAPI is installed in the game folder and, on Windows, its
 * version. Non-Windows version detection is best-effort and may return null;
 * the compat checks degrade to "unknown" in that case.
 */
export async function detectSmapi(gamePath: string): Promise<SmapiInfo> {
  const exe = join(gamePath, "StardewModdingAPI.exe");
  const dll = join(gamePath, "StardewModdingAPI.dll");
  const unix = join(gamePath, "StardewModdingAPI");

  const hasExe = await fileExists(exe);
  const installed = hasExe || (await fileExists(dll)) || (await fileExists(unix));
  if (!installed) return { installed: false, version: null };

  let version: string | null = null;
  if (process.platform === "win32" && hasExe) {
    version = await windowsFileVersion(exe);
  }
  return { installed: true, version };
}
