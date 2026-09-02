import { rename, stat } from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import { toDisabledFolderName, toEnabledFolderName } from "@sdm/core";
import { friendlyFsError, retryFs } from "./permissions.js";

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Enable or disable a mod by renaming its folder. SMAPI ignores folders whose
 * name starts with a dot, so disabling = add a leading dot, enabling = strip it.
 * `relativePath` is the mod folder relative to `Mods/` (posix-style).
 */
export async function setModEnabled(
  modsPath: string,
  relativePath: string,
  enabled: boolean,
): Promise<void> {
  // path.join normalises posix "/" separators to the platform separator.
  const current = join(modsPath, relativePath);
  const leaf = basename(current);
  const parent = dirname(current);

  const newLeaf = enabled ? toEnabledFolderName(leaf) : toDisabledFolderName(leaf);
  if (newLeaf === leaf) return; // already in the desired state

  const target = join(parent, newLeaf);

  // Duplicate: both an enabled and a disabled copy exist, so the rename would
  // collide. This is a data problem, not a lock — tell the user plainly.
  if (await pathExists(target)) {
    throw new Error(
      `"${toEnabledFolderName(leaf)}" has both an enabled and a disabled copy in your Mods folder ` +
        `(a duplicate). Open Mods Library, uninstall the extra copy, then try again.`,
    );
  }

  try {
    await retryFs(() => rename(current, target));
  } catch (err) {
    throw new Error(friendlyFsError(err, leaf));
  }
}
