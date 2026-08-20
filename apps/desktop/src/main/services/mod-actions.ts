import { rm } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

/**
 * Delete a mod's folder. `relativePath` is the mod folder relative to `Mods/`.
 * Guarded so a malformed path can never delete anything outside the Mods folder.
 */
export async function uninstallMod(modsPath: string, relativePath: string): Promise<void> {
  const root = resolve(modsPath);
  const target = resolve(root, relativePath);
  const rel = relative(root, target);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("Refusing to delete a path outside the Mods folder.");
  }
  await rm(target, { recursive: true, force: true });
}
