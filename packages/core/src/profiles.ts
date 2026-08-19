/**
 * Mod profiles.
 *
 * A profile is a named set of mods that should be enabled. Because we
 * enable/disable mods by renaming their folder (dot prefix = disabled), only one
 * state exists on disk at a time, so switching profiles means *reconciling* the
 * disk to match the profile's desired set. Mods are identified by a canonical
 * key — their folder path with the disable-dots stripped — so identity survives
 * enabling/disabling. Pure and platform-agnostic for unit testing.
 */

import { toEnabledFolderName } from "./mod-folder.js";

export interface ModState {
  relativePath: string;
  enabled: boolean;
}

export interface ProfileAction {
  relativePath: string;
  enable: boolean;
}

/** Stable identity for a mod across enable/disable (dots stripped per segment). */
export function canonicalModKey(relativePath: string): string {
  return relativePath.split("/").map(toEnabledFolderName).join("/");
}

/** Capture the currently-enabled mods as a profile's enabled-key list (sorted). */
export function captureProfileState(mods: readonly ModState[]): string[] {
  return mods
    .filter((mod) => mod.enabled)
    .map((mod) => canonicalModKey(mod.relativePath))
    .sort();
}

/** The enable/disable actions needed to make disk match a profile's enabled set. */
export function computeProfileActions(
  mods: readonly ModState[],
  enabledKeys: readonly string[],
): ProfileAction[] {
  const want = new Set(enabledKeys);
  const actions: ProfileAction[] = [];
  for (const mod of mods) {
    const shouldEnable = want.has(canonicalModKey(mod.relativePath));
    if (shouldEnable !== mod.enabled) {
      actions.push({ relativePath: mod.relativePath, enable: shouldEnable });
    }
  }
  return actions;
}
