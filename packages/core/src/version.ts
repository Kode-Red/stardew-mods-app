/**
 * SMAPI-flavoured semantic versioning.
 *
 * SMAPI accepts standard semver 2.0.0 with two conveniences seen in real
 * `manifest.json` files:
 *   - the patch component is optional (`1.2` is treated as `1.2.0`);
 *   - build metadata (after `+`) is allowed but ignored for precedence.
 *
 * Prerelease precedence follows the semver 2.0.0 spec:
 *   1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-beta < 1.0.0 (release beats prerelease).
 *
 * Reference: https://semver.org and SMAPI's ISemanticVersion.
 */

export interface SemanticVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  /** Dot-separated prerelease tag without the leading `-`, or null. */
  readonly prerelease: string | null;
  /** Build metadata without the leading `+`, or null. Ignored for ordering. */
  readonly build: string | null;
}

const VERSION_PATTERN =
  /^(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z-.]+))?(?:\+([0-9A-Za-z-.]+))?$/;

export class InvalidVersionError extends Error {
  constructor(input: string) {
    super(`"${input}" is not a valid semantic version.`);
    this.name = "InvalidVersionError";
  }
}

/** Parse a version string, throwing {@link InvalidVersionError} on failure. */
export function parseVersion(input: string): SemanticVersion {
  const trimmed = input.trim().replace(/^v/i, "");
  const match = VERSION_PATTERN.exec(trimmed);
  if (!match) throw new InvalidVersionError(input);

  const [, major, minor, patch, prerelease, build] = match;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: patch === undefined ? 0 : Number(patch),
    prerelease: prerelease ?? null,
    build: build ?? null,
  };
}

/** Parse a version string, returning null instead of throwing. */
export function tryParseVersion(input: string): SemanticVersion | null {
  try {
    return parseVersion(input);
  } catch {
    return null;
  }
}

/** True when `input` is a parseable semantic version. */
export function isValidVersion(input: string): boolean {
  return VERSION_PATTERN.test(input.trim().replace(/^v/i, ""));
}

function isNumeric(id: string): boolean {
  return /^\d+$/.test(id);
}

/** Compare prerelease tags per semver rules. Empty tag = release (higher). */
function comparePrerelease(a: string | null, b: string | null): number {
  if (a === b) return 0;
  // A release version has higher precedence than a prerelease version.
  if (a === null) return 1;
  if (b === null) return -1;

  const aParts = a.split(".");
  const bParts = b.split(".");
  const len = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < len; i++) {
    const av = aParts[i];
    const bv = bParts[i];
    // A larger set of fields wins when all preceding are equal.
    if (av === undefined) return -1;
    if (bv === undefined) return 1;
    if (av === bv) continue;

    const aNum = isNumeric(av);
    const bNum = isNumeric(bv);
    if (aNum && bNum) {
      const diff = Number(av) - Number(bv);
      if (diff !== 0) return diff < 0 ? -1 : 1;
    } else if (aNum !== bNum) {
      // Numeric identifiers always have lower precedence than alphanumeric.
      return aNum ? -1 : 1;
    } else {
      return av < bv ? -1 : 1;
    }
  }
  return 0;
}

/** Returns -1, 0, or 1. Accepts strings or parsed versions. */
export function compareVersions(
  a: string | SemanticVersion,
  b: string | SemanticVersion,
): -1 | 0 | 1 {
  const va = typeof a === "string" ? parseVersion(a) : a;
  const vb = typeof b === "string" ? parseVersion(b) : b;

  for (const key of ["major", "minor", "patch"] as const) {
    if (va[key] !== vb[key]) return va[key] < vb[key] ? -1 : 1;
  }
  const pre = comparePrerelease(va.prerelease, vb.prerelease);
  return pre === 0 ? 0 : pre < 0 ? -1 : 1;
}

export const isEqual = (a: string | SemanticVersion, b: string | SemanticVersion) =>
  compareVersions(a, b) === 0;
export const isGreater = (a: string | SemanticVersion, b: string | SemanticVersion) =>
  compareVersions(a, b) === 1;
export const isGreaterOrEqual = (a: string | SemanticVersion, b: string | SemanticVersion) =>
  compareVersions(a, b) >= 0;
export const isLess = (a: string | SemanticVersion, b: string | SemanticVersion) =>
  compareVersions(a, b) === -1;
export const isLessOrEqual = (a: string | SemanticVersion, b: string | SemanticVersion) =>
  compareVersions(a, b) <= 0;

/** True when `version` is at least `minimum` (the SMAPI MinimumApiVersion check). */
export function satisfiesMinimum(
  version: string | SemanticVersion,
  minimum: string | SemanticVersion,
): boolean {
  return isGreaterOrEqual(version, minimum);
}

/** Canonical `major.minor.patch[-prerelease][+build]` string. */
export function formatVersion(v: SemanticVersion): string {
  let out = `${v.major}.${v.minor}.${v.patch}`;
  if (v.prerelease) out += `-${v.prerelease}`;
  if (v.build) out += `+${v.build}`;
  return out;
}
