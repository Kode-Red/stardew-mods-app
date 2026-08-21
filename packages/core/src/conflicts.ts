/**
 * Mod conflict detection.
 *
 * The two conflicts SMAPI itself flags that we can detect from manifests alone:
 *   - **Duplicate UniqueID**: two *enabled* mods share a UniqueID, so SMAPI
 *     skips one. Usually means a mod got installed twice.
 *   - **Missing required dependency**: an enabled mod requires another mod that
 *     isn't installed/enabled (or is below its MinimumVersion).
 *
 * Pure and testable; content-level clashes (two packs editing the same asset)
 * need deeper parsing and are out of scope here.
 */

import { findMissingDependencies } from "./compat.js";
import type { Manifest } from "./manifest.js";

export interface ConflictMod {
  folderName: string;
  manifest: Manifest | null;
  enabled: boolean;
}

export interface DuplicateIdConflict {
  uniqueId: string;
  names: string[];
}

export interface MissingDepConflict {
  modName: string;
  dependencyId: string;
  reason: "missing" | "outdated";
}

export interface ModConflicts {
  duplicateIds: DuplicateIdConflict[];
  missingDependencies: MissingDepConflict[];
}

export function detectConflicts(mods: readonly ConflictMod[]): ModConflicts {
  const enabled = mods.filter((m): m is ConflictMod & { manifest: Manifest } => m.enabled && !!m.manifest);

  // Duplicate UniqueIDs among enabled mods.
  const byId = new Map<string, string[]>();
  for (const mod of enabled) {
    const id = mod.manifest.uniqueId;
    const list = byId.get(id) ?? byId.set(id, []).get(id)!;
    list.push(mod.manifest.name);
  }
  const duplicateIds = [...byId.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([uniqueId, names]) => ({ uniqueId, names: [...names].sort() }))
    .sort((a, b) => a.uniqueId.localeCompare(b.uniqueId));

  // Missing/outdated required dependencies (installed = enabled mods only).
  const installed = new Map<string, string>();
  for (const mod of enabled) installed.set(mod.manifest.uniqueId, mod.manifest.version);

  const missingDependencies: MissingDepConflict[] = [];
  for (const mod of enabled) {
    for (const problem of findMissingDependencies(mod.manifest, installed)) {
      missingDependencies.push({
        modName: mod.manifest.name,
        dependencyId: problem.uniqueId,
        reason: problem.reason,
      });
    }
  }

  return { duplicateIds, missingDependencies };
}

export function conflictCount(conflicts: ModConflicts): number {
  return conflicts.duplicateIds.length + conflicts.missingDependencies.length;
}
