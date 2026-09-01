import { rename } from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import { toDisabledFolderName, toEnabledFolderName } from "@sdm/core";
import { friendlyFsError, retryFs } from "./permissions.js";

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

  try {
    await retryFs(() => rename(current, join(parent, newLeaf)));
  } catch (err) {
    throw new Error(friendlyFsError(err, leaf));
  }
}
