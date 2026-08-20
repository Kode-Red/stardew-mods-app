import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { zipSync } from "fflate";

/**
 * Zip the *contents* of a folder into a buffer (top-level entries are the
 * folder's children, so a Mods/ backup unzips straight back into Mods/).
 * This is for the user's own backup/migration — not for redistributing mods.
 */
export async function zipFolder(root: string): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const rel = relative(root, full).split(sep).join("/");
        files[rel] = new Uint8Array(await readFile(full));
      }
    }
  }

  await walk(root);
  return zipSync(files);
}
