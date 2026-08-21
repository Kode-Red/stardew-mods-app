import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { app } from "electron";
import { farmNameFromFolder, type SaveRef } from "@sdm/core";
import { zipFolder } from "./backup.js";
import { extractZip } from "./archive.js";

const MAX_BACKUPS = 10;

export interface SaveEntry extends SaveRef {
  farmName: string;
}

export interface SaveBackup {
  id: string;
  createdMs: number;
  label: string | null;
  sizeBytes: number;
}

/** Stardew's saves folder (shared across all profiles). */
export function savesFolder(): string {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
    return join(appData, "StardewValley", "Saves");
  }
  // macOS and Linux both use ~/.config/StardewValley.
  return join(homedir(), ".config", "StardewValley", "Saves");
}

function backupsDir(): string {
  return join(app.getPath("userData"), "save-backups");
}

async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** List Stardew saves (each is a folder), newest first. */
export async function listSaves(): Promise<SaveEntry[]> {
  const root = savesFolder();
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return [];
  }
  const saves: SaveEntry[] = [];
  for (const folder of entries) {
    const full = join(root, folder);
    if (folder.startsWith(".") || !(await isDir(full))) continue;
    try {
      const info = await stat(full);
      saves.push({ folder, farmName: farmNameFromFolder(folder), lastModifiedMs: info.mtimeMs });
    } catch {
      /* skip */
    }
  }
  return saves.sort((a, b) => b.lastModifiedMs - a.lastModifiedMs);
}

async function pruneBackups(): Promise<void> {
  const dir = backupsDir();
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".zip")).sort();
  } catch {
    return;
  }
  // Filenames start with an ISO timestamp, so lexical sort == chronological.
  while (files.length > MAX_BACKUPS) {
    const oldest = files.shift();
    if (oldest) await rm(join(dir, oldest), { force: true });
  }
}

/** Zip the saves folder into the backups dir. Returns the backup id, or null if empty. */
export async function backupSaves(label?: string): Promise<string | null> {
  if ((await listSaves()).length === 0) return null;
  const dir = backupsDir();
  await mkdir(dir, { recursive: true });
  const buffer = await zipFolder(savesFolder());
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeLabel = label ? `-${label.replace(/[^a-z0-9-_]/gi, "_")}` : "";
  const id = `saves-${stamp}${safeLabel}.zip`;
  await writeFile(join(dir, id), buffer);
  await pruneBackups();
  return id;
}

export async function listBackups(): Promise<SaveBackup[]> {
  const dir = backupsDir();
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".zip"));
  } catch {
    return [];
  }
  const out: SaveBackup[] = [];
  for (const file of files) {
    try {
      const info = await stat(join(dir, file));
      const label = /saves-[\dTZ-]+-(.+)\.zip$/.exec(file)?.[1] ?? null;
      out.push({ id: file, createdMs: info.mtimeMs, label, sizeBytes: info.size });
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => b.createdMs - a.createdMs);
}

/** Restore a backup zip into the saves folder (merging over existing files). */
export async function restoreBackup(id: string): Promise<void> {
  if (id.includes("/") || id.includes("\\") || !id.endsWith(".zip")) {
    throw new Error("Invalid backup id.");
  }
  const file = join(backupsDir(), id);
  const buffer = new Uint8Array(await readFile(file));
  const entries = extractZip(buffer, id);
  const root = savesFolder();
  await mkdir(root, { recursive: true });
  for (const [rel, data] of entries) {
    const dest = join(root, rel);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, data);
  }
}
