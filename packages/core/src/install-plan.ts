/**
 * Install planning.
 *
 * A downloaded archive can be laid out several ways once extracted:
 *   - the manifest.json is at the archive root  → the whole archive is one mod;
 *   - a single wrapper folder holds the mod      → install that folder;
 *   - several sibling folders each have a manifest → a bundle of separate mods;
 *   - a mod folder contains nested content packs  → install the top folder only.
 *
 * Given the relative (posix) path of every manifest.json found in the extracted
 * tree, this decides which folders to copy into `Mods/` and what to name them.
 * Pure and platform-agnostic so it can be unit-tested.
 */

export interface PlannedInstall {
  /** Source folder relative to the extraction root ("" = the root itself). */
  sourceDir: string;
  /** Folder name to create under Mods/. */
  installName: string;
}

function posixDirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

function posixBasename(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/** True when `dir` is a strict descendant of `ancestor`. */
function isDescendant(dir: string, ancestor: string): boolean {
  if (ancestor === "") return dir !== "";
  return dir === ancestor ? false : dir.startsWith(`${ancestor}/`);
}

/** Strip a trailing archive extension from a name for use as a folder name. */
export function archiveBaseName(archiveName: string): string {
  return archiveName.replace(/\.(zip|rar|7z|tar|gz)$/i, "").trim() || "Mod";
}

/**
 * Decide which folders to install from an extracted archive.
 * `manifestPaths` are posix-relative paths to each manifest.json.
 */
export function planInstall(
  manifestPaths: readonly string[],
  options: { archiveName: string },
): PlannedInstall[] {
  const dirs = [...new Set(manifestPaths.map(posixDirname))];

  // Keep only the top-most mod folders (drop any nested inside another).
  const topLevel = dirs.filter(
    (dir) => !dirs.some((other) => isDescendant(dir, other)),
  );

  return topLevel
    .map((dir) => ({
      sourceDir: dir,
      installName: dir === "" ? archiveBaseName(options.archiveName) : posixBasename(dir),
    }))
    .sort((a, b) => a.installName.localeCompare(b.installName));
}
