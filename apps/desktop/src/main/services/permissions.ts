import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const RETRIABLE = new Set(["EPERM", "EACCES", "EBUSY", "ENOTEMPTY", "EEXIST"]);

export function isPermissionError(err: unknown): boolean {
  return RETRIABLE.has((err as { code?: string }).code ?? "");
}

/**
 * Turn a raw fs error into an actionable message. On Windows EPERM/EACCES most
 * often means the folder is *in use* (the game/SMAPI running, an open Explorer
 * window, or antivirus scanning) — not necessarily that admin is required — so we
 * lead with that. `name` is the folder we were changing, if known.
 */
export function friendlyFsError(err: unknown, name?: string): string {
  const what = name ? `"${name}"` : "a mod folder";
  if (isPermissionError(err)) {
    return (
      `Couldn't change ${what} — Windows blocked the change. This usually means the folder is open ` +
      `in another program: close Stardew Valley and SMAPI, plus any File Explorer window or antivirus ` +
      `scan on your Mods folder, then try again. If your game is under Program Files, also try running ` +
      `as administrator or moving it to another folder.`
    );
  }
  return err instanceof Error ? err.message : String(err);
}

/** Retry a filesystem op through transient Windows locks (AV/indexer/Explorer). */
export async function retryFs<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isPermissionError(err) || attempt >= attempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, 120 * (attempt + 1)));
    }
  }
}

/** Can we create/delete files in this folder without elevation? */
export async function isWritable(dir: string): Promise<boolean> {
  const probe = join(dir, ".sdm-write-test");
  try {
    await writeFile(probe, "");
    await rm(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}
