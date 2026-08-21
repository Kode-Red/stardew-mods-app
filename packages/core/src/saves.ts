/**
 * Save ↔ profile association (pure logic).
 *
 * Stardew keeps all saves in one shared folder and we can't intercept which save
 * the player loads in-game, so we don't isolate saves. Instead we *associate* a
 * save with the profile that was active when it was last played (any save touched
 * at/after a modded launch is tagged with that launch's profile), and warn before
 * launching if the most-recent save's profile differs from the active one.
 */

export interface SaveRef {
  folder: string;
  lastModifiedMs: number;
}

export interface LaunchRecord {
  profileId: string;
  at: number;
}

export interface SaveMismatch {
  folder: string;
  savedProfileId: string;
}

/** Tag saves modified at/after the last modded launch with that launch's profile. */
export function associateSaves(
  saves: readonly SaveRef[],
  current: Readonly<Record<string, string>>,
  launch: LaunchRecord | null,
): Record<string, string> {
  const next: Record<string, string> = { ...current };
  if (launch) {
    for (const save of saves) {
      if (save.lastModifiedMs >= launch.at) next[save.folder] = launch.profileId;
    }
  }
  return next;
}

/**
 * If the most-recently-played save is associated with a *different* profile than
 * the active one, return the mismatch so the UI can warn before launching.
 */
export function findSaveProfileMismatch(
  saves: readonly SaveRef[],
  saveProfiles: Readonly<Record<string, string>>,
  activeProfileId: string | null,
): SaveMismatch | null {
  if (!activeProfileId || saves.length === 0) return null;
  const mostRecent = [...saves].sort((a, b) => b.lastModifiedMs - a.lastModifiedMs)[0]!;
  const savedProfileId = saveProfiles[mostRecent.folder];
  if (savedProfileId && savedProfileId !== activeProfileId) {
    return { folder: mostRecent.folder, savedProfileId };
  }
  return null;
}

/** Farm name from a Stardew save folder (`FarmName_1234567` → `FarmName`). */
export function farmNameFromFolder(folder: string): string {
  return folder.replace(/_\d+$/, "") || folder;
}
