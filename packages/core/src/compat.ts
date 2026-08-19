/**
 * Version-mismatch logic: comparing what is installed against what is available,
 * and whether the installed SMAPI satisfies a mod's MinimumApiVersion.
 */

import { compareVersions, satisfiesMinimum, tryParseVersion } from "./version.js";
import type { Manifest } from "./manifest.js";

export type UpdateStatus =
  | "up-to-date"
  | "update-available"
  | "ahead" // installed is newer than the latest known (dev/prerelease build)
  | "unknown"; // a version could not be parsed

export interface UpdateCheck {
  status: UpdateStatus;
  installedVersion: string;
  latestVersion: string | null;
}

/** Compare an installed version against the latest known version. */
export function checkForUpdate(
  installedVersion: string,
  latestVersion: string | null,
): UpdateCheck {
  if (latestVersion == null) {
    return { status: "unknown", installedVersion, latestVersion };
  }
  if (!tryParseVersion(installedVersion) || !tryParseVersion(latestVersion)) {
    return { status: "unknown", installedVersion, latestVersion };
  }
  const cmp = compareVersions(installedVersion, latestVersion);
  const status: UpdateStatus =
    cmp === 0 ? "up-to-date" : cmp < 0 ? "update-available" : "ahead";
  return { status, installedVersion, latestVersion };
}

export type ApiCompatibility =
  | "ok"
  | "smapi-too-old"
  | "unknown"; // manifest declares no minimum, or a version is unparseable

/** Does the installed SMAPI meet a mod's MinimumApiVersion? */
export function checkApiCompatibility(
  manifest: Pick<Manifest, "minimumApiVersion">,
  installedSmapiVersion: string | null,
): ApiCompatibility {
  const min = manifest.minimumApiVersion;
  if (!min) return "unknown";
  if (!installedSmapiVersion || !tryParseVersion(installedSmapiVersion)) {
    return "unknown";
  }
  if (!tryParseVersion(min)) return "unknown";
  return satisfiesMinimum(installedSmapiVersion, min) ? "ok" : "smapi-too-old";
}

export interface MissingDependency {
  uniqueId: string;
  reason: "missing" | "outdated";
  minimumVersion: string | null;
  installedVersion: string | null;
}

/**
 * Given a mod and the set of installed mods (by UniqueID -> version), return the
 * required dependencies that are missing or below their MinimumVersion.
 */
export function findMissingDependencies(
  manifest: Pick<Manifest, "dependencies">,
  installed: ReadonlyMap<string, string>,
): MissingDependency[] {
  const problems: MissingDependency[] = [];
  for (const dep of manifest.dependencies) {
    if (!dep.required) continue;
    const installedVersion = installed.get(dep.uniqueId) ?? null;
    if (installedVersion == null) {
      problems.push({
        uniqueId: dep.uniqueId,
        reason: "missing",
        minimumVersion: dep.minimumVersion,
        installedVersion: null,
      });
      continue;
    }
    if (
      dep.minimumVersion &&
      tryParseVersion(installedVersion) &&
      tryParseVersion(dep.minimumVersion) &&
      compareVersions(installedVersion, dep.minimumVersion) < 0
    ) {
      problems.push({
        uniqueId: dep.uniqueId,
        reason: "outdated",
        minimumVersion: dep.minimumVersion,
        installedVersion,
      });
    }
  }
  return problems;
}
