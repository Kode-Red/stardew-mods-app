import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { shell } from "electron";
import {
  checkForUpdate,
  githubLatestReleaseUrl,
  parseGithubRelease,
  pickSmapiInstallerAsset,
  versionFromTag,
} from "@sdm/core";
import type { SmapiUpdateInfo } from "../../shared/types.js";
import { downloadToBuffer, fetchJson } from "./download.js";
import { extractZip } from "./archive.js";
import { detectSmapi } from "./smapi.js";
import { isWritable } from "./permissions.js";

const execFileAsync = promisify(execFile);

const SMAPI_REPO = "Pathoschild/SMAPI";
const UA = { "user-agent": "StardewModManager" };

/** GitHub's releases API is rate-limited for unauthenticated calls, so cache the lookup. */
const LATEST_CACHE_MS = 60 * 60 * 1000;
let latestCache: { version: string; at: number } | null = null;

/** Strip SMAPI's build metadata (`4.3.2+abcdef`) to a plain, comparable version. */
function cleanVersion(version: string | null): string | null {
  if (!version) return null;
  return (version.split("+")[0] ?? "").trim() || null;
}

export interface SmapiInstallProgress {
  phase: "checking" | "downloading" | "installing" | "done" | "error";
  version?: string;
  received?: number;
  total?: number | null;
  installedVersion?: string | null;
  openedFolder?: boolean;
  error?: string;
}

async function fetchLatest(): Promise<{ version: string; url: string; name: string }> {
  const release = parseGithubRelease(await fetchJson(githubLatestReleaseUrl(SMAPI_REPO), UA));
  if (!release) throw new Error("Couldn't read the latest SMAPI release.");
  const asset = pickSmapiInstallerAsset(release);
  if (!asset) throw new Error("Couldn't find the SMAPI installer download.");
  const version = versionFromTag(release.tagName);
  latestCache = { version, at: Date.now() };
  return { version, url: asset.url, name: asset.name };
}

/** Latest SMAPI version from GitHub, cached for an hour. Returns null on failure. */
async function fetchLatestVersion(): Promise<string | null> {
  if (latestCache && Date.now() - latestCache.at < LATEST_CACHE_MS) return latestCache.version;
  try {
    return (await fetchLatest()).version;
  } catch {
    return null;
  }
}

/**
 * Compare the installed SMAPI against the latest GitHub release so the UI can
 * say "up to date" / "update available" instead of always offering a reinstall.
 * Any lookup failure degrades to `status: "unknown"` rather than throwing.
 */
export async function checkSmapiUpdate(gamePath: string): Promise<SmapiUpdateInfo> {
  const info = await detectSmapi(gamePath);
  const latestVersion = await fetchLatestVersion();
  const installedVersion = cleanVersion(info.version);

  if (!info.installed) {
    return { installed: false, installedVersion: null, latestVersion, status: "unknown" };
  }
  if (!installedVersion || !latestVersion) {
    return { installed: true, installedVersion, latestVersion, status: "unknown" };
  }
  const check = checkForUpdate(installedVersion, latestVersion);
  return { installed: true, installedVersion, latestVersion, status: check.status };
}

async function writeTree(files: Map<string, Uint8Array>, dest: string): Promise<void> {
  for (const [rel, data] of files) {
    const path = join(dest, rel);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }
}

function platformFolder(): string {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "macos";
  return "linux";
}

/** Find the installer executable inside the extracted SMAPI installer tree. */
export function findInstaller(files: Map<string, Uint8Array>): string | null {
  const plat = platformFolder();
  const isWin = process.platform === "win32";
  let best: string | null = null;
  let bestScore = -1;
  for (const key of files.keys()) {
    const lower = key.toLowerCase();
    if (!lower.includes(`internal/${plat}/`)) continue;
    if (isWin && !lower.endsWith(".exe")) continue;
    if (!isWin && lower.endsWith(".exe")) continue;
    let score = 0;
    if (lower.includes("installer")) score += 2;
    if (lower.includes("smapi")) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return best;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Quote a string as a PowerShell single-quoted literal. */
function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Launch the SMAPI installer non-interactively (`--install --game-path`). On
 * Windows we go through `Start-Process` so the console app is set up correctly,
 * and — when the game folder isn't writable (e.g. under Program Files) — with
 * `-Verb RunAs` to elevate via UAC. The previous unelevated, console-less launch
 * is why an "update" could download the installer yet silently change nothing.
 * Throws with an actionable message if the user declines the UAC prompt.
 */
async function runInstaller(exe: string, gamePath: string, elevate: boolean): Promise<void> {
  if (process.platform !== "win32") {
    const child = spawn(exe, ["--install", "--game-path", gamePath], {
      cwd: dirname(exe),
      detached: true,
      stdio: "ignore",
    });
    child.on("error", () => undefined);
    child.unref();
    return;
  }

  const innerArgs = `--install --game-path "${gamePath}"`;
  const verb = elevate ? " -Verb RunAs" : "";
  const command =
    "$ErrorActionPreference='Stop';" +
    `Start-Process -FilePath ${psQuote(exe)} -ArgumentList ${psQuote(innerArgs)} ` +
    `-WorkingDirectory ${psQuote(dirname(exe))}${verb} | Out-Null`;

  try {
    await execFileAsync("powershell", ["-NoProfile", "-Command", command], { windowsHide: true });
  } catch (err) {
    const message = String((err as { stderr?: string }).stderr || (err as Error).message || "");
    if (/cancell?ed by the user|operation was canceled/i.test(message)) {
      throw new Error(
        "SMAPI needs administrator access to update because your game is under Program Files, " +
          "and the Windows permission prompt was declined. Try again and choose Yes, or move " +
          "Stardew Valley out of Program Files.",
      );
    }
    throw new Error(`Couldn't launch the SMAPI installer: ${message}`);
  }
}

/**
 * Download the official SMAPI installer and run it non-interactively
 * (`--install --game-path`). If SMAPI isn't detected shortly after, open the
 * installer folder so the user can finish manually (the supported fallback).
 */
export async function installSmapi(
  gamePath: string,
  onProgress: (progress: SmapiInstallProgress) => void,
): Promise<void> {
  try {
    onProgress({ phase: "checking" });
    const { version, url, name } = await fetchLatest();

    onProgress({ phase: "downloading", version });
    const buffer = await downloadToBuffer(
      url,
      (received, total) => onProgress({ phase: "downloading", version, received, total }),
      UA,
    );

    onProgress({ phase: "installing", version });
    const files = extractZip(buffer, name);
    const dir = await mkdtemp(join(tmpdir(), "smapi-installer-"));
    await writeTree(files, dir);

    // Elevate when we can't write into the game folder (Program Files), otherwise
    // the installer runs but can't replace SMAPI's files — i.e. "downloads, does nothing".
    const elevate = process.platform === "win32" && !(await isWritable(gamePath));
    const before = cleanVersion((await detectSmapi(gamePath)).version);
    const target = cleanVersion(version);

    const installerRel = findInstaller(files);
    let done = false;
    if (installerRel) {
      await runInstaller(join(dir, installerRel), gamePath, elevate);
      // Poll for up to ~40s. For a fresh install any presence means success; for an
      // update SMAPI is already present, so we wait for the version to reach the
      // target (or simply change) — otherwise the installer clearly did nothing.
      for (let i = 0; i < 40 && !done; i++) {
        await delay(1000);
        const cur = await detectSmapi(gamePath);
        if (!cur.installed) continue;
        if (before === null) {
          done = true;
          break;
        }
        const curVersion = cleanVersion(cur.version);
        if ((target && curVersion === target) || (curVersion && curVersion !== before)) {
          done = true;
          break;
        }
      }
    }

    if (!done) {
      await shell.openPath(dir); // fallback: let the user finish in the installer window
      onProgress({ phase: "done", version, installedVersion: null, openedFolder: true });
      return;
    }

    const info = await detectSmapi(gamePath);
    onProgress({ phase: "done", version, installedVersion: info.version });
  } catch (err) {
    onProgress({ phase: "error", error: (err as Error).message });
  }
}
