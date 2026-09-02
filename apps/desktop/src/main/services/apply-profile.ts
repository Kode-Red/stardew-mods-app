import { computeProfileActions } from "@sdm/core";
import { scanMods } from "./mod-scanner.js";
import { setModEnabled } from "./mod-toggle.js";

/** Reconcile the mods on disk to match a profile's enabled set. */
export async function applyProfile(
  modsPath: string,
  enabledKeys: readonly string[],
): Promise<void> {
  const mods = await scanMods(modsPath);
  const actions = computeProfileActions(
    mods.map((m) => ({ relativePath: m.relativePath, enabled: m.enabled })),
    enabledKeys,
  );
  // Apply every action independently: one locked/colliding folder shouldn't abort
  // the whole switch. Collect failures and report them together.
  const failed: { name: string; message: string }[] = [];
  for (const action of actions) {
    try {
      await setModEnabled(modsPath, action.relativePath, action.enable);
    } catch (err) {
      failed.push({
        name: action.relativePath.split("/").pop() ?? action.relativePath,
        message: (err as Error).message,
      });
    }
  }

  if (failed.length === 1) {
    // Surface the specific reason (duplicate, lock, etc.).
    throw new Error(failed[0]!.message);
  }
  if (failed.length > 1) {
    const shown = failed.slice(0, 6).map((f) => f.name).join(", ") + (failed.length > 6 ? "…" : "");
    throw new Error(
      `Applied the profile, but ${failed.length} mod folders couldn't be changed: ${shown}. ` +
        `Common causes: duplicate copies of a mod (remove the extra), or the folder being open in ` +
        `Stardew Valley / Explorer / antivirus. Fix those and switch profiles again.`,
    );
  }
}
