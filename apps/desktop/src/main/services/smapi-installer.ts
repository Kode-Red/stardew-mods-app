import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { shell } from "electron";
import {
  githubLatestReleaseUrl,
  parseGithubRelease,
  pickSmapiInstallerAsset,
  versionFromTag,
} from "@sdm/core";
import { downloadToBuffer, fetchJson } from "./download.js";
import { extractZip } from "./archive.js";
import { detectSmapi } from "./smapi.js";

const SMAPI_REPO = "Pathoschild/SMAPI";
const UA = { "user-agent": "StardewModManager" };

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
  return { version: versionFromTag(release.tagName), url: asset.url, name: asset.name };
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

function runInstaller(exe: string, gamePath: string): void {
  const child = spawn(exe, ["--install", "--game-path", gamePath], {
    cwd: dirname(exe),
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.on("error", () => undefined);
  child.unref();
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

    const installerRel = findInstaller(files);
    let installed = false;
    if (installerRel) {
      runInstaller(join(dir, installerRel), gamePath);
      for (let i = 0; i < 25 && !installed; i++) {
        await delay(1000);
        installed = (await detectSmapi(gamePath)).installed;
      }
    }

    if (!installed) {
      await shell.openPath(dir); // fallback: let the user run the installer
      onProgress({ phase: "done", version, installedVersion: null, openedFolder: true });
      return;
    }

    const info = await detectSmapi(gamePath);
    onProgress({ phase: "done", version, installedVersion: info.version });
  } catch (err) {
    onProgress({ phase: "error", error: (err as Error).message });
  }
}
