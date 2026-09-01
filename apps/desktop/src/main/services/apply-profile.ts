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
  const failed: string[] = [];
  for (const action of actions) {
    try {
      await setModEnabled(modsPath, action.relativePath, action.enable);
    } catch {
      failed.push(action.relativePath.split("/").pop() ?? action.relativePath);
    }
  }

  if (failed.length > 0) {
    const shown = failed.slice(0, 6).join(", ") + (failed.length > 6 ? "…" : "");
    throw new Error(
      `Applied the profile, but ${failed.length} mod folder(s) couldn't be changed: ${shown}. ` +
        `They're usually locked — close Stardew Valley, SMAPI, and any File Explorer window on your ` +
        `Mods folder (and check antivirus), then switch profiles again. If the game is in Program Files, ` +
        `run as administrator or move it out.`,
    );
  }
}
