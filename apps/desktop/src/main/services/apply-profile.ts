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
  for (const action of actions) {
    await setModEnabled(modsPath, action.relativePath, action.enable);
  }
}
