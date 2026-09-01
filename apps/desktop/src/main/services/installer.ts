import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { planInstall, tryParseManifest } from "@sdm/core";
import { extractZip, ArchiveError } from "./archive.js";
import { isPermissionError, friendlyFsError } from "./permissions.js";

export interface InstalledMod {
  installName: string;
  uniqueId: string | null;
  name: string | null;
  version: string | null;
}

/** Strip Windows-illegal characters and any leading dot (which disables the mod). */
function sanitizeFolderName(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*]/g, "_").replace(/^\.+/, "").trim();
  return cleaned || "Mod";
}

function isManifestPath(path: string): boolean {
  return path.slice(path.lastIndexOf("/") + 1).toLowerCase() === "manifest.json";
}

const decoder = new TextDecoder("utf-8");

/**
 * Install every SMAPI mod contained in a zip buffer into `modsPath`. Existing
 * target folders are replaced. Returns what was installed.
 */
export async function installArchive(
  buffer: Uint8Array,
  options: { modsPath: string; archiveName: string },
): Promise<InstalledMod[]> {
  const files = extractZip(buffer, options.archiveName);
  const manifestPaths = [...files.keys()].filter(isManifestPath);

  const plan = planInstall(manifestPaths, { archiveName: options.archiveName });
  if (plan.length === 0) {
    throw new ArchiveError("No SMAPI mod found in this archive (no manifest.json).");
  }

  try {
    return await writePlan(files, plan, options.modsPath);
  } catch (err) {
    if (isPermissionError(err)) throw new ArchiveError(friendlyFsError(err));
    throw err;
  }
}

async function writePlan(
  files: Map<string, Uint8Array>,
  plan: { sourceDir: string; installName: string }[],
  modsPath: string,
): Promise<InstalledMod[]> {
  const installed: InstalledMod[] = [];
  for (const item of plan) {
    const folderName = sanitizeFolderName(item.installName);
    const targetDir = join(modsPath, folderName);
    const prefix = item.sourceDir === "" ? "" : `${item.sourceDir}/`;

    // Clean replace: remove any existing install of this folder first.
    await rm(targetDir, { recursive: true, force: true });

    let manifestJson: string | null = null;
    for (const [path, data] of files) {
      if (prefix && !path.startsWith(prefix)) continue;
      const rel = path.slice(prefix.length);
      if (!rel) continue;
      const dest = join(targetDir, rel);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, data);
      if (isManifestPath(rel) && !rel.includes("/")) {
        manifestJson = decoder.decode(data);
      }
    }

    const parsed = manifestJson ? tryParseManifest(manifestJson) : null;
    installed.push({
      installName: folderName,
      uniqueId: parsed?.ok ? parsed.manifest.uniqueId : null,
      name: parsed?.ok ? parsed.manifest.name : null,
      version: parsed?.ok ? parsed.manifest.version : null,
    });
  }
  return installed;
}

/** Install from a local archive file on disk. */
export async function installFromFile(
  filePath: string,
  modsPath: string,
): Promise<InstalledMod[]> {
  const buffer = await readFile(filePath);
  const slash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  const archiveName = filePath.slice(slash + 1);
  return installArchive(new Uint8Array(buffer), { modsPath, archiveName });
}
