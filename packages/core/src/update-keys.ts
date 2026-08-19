/**
 * SMAPI `UpdateKeys` parsing.
 *
 * Update keys tell SMAPI (and us) where a mod is hosted so we can check for a
 * newer version. Format: `<site>:<id>` with an optional `@<subkey>` used to pin
 * a platform- or version-specific entry, e.g.:
 *   "Nexus:1234"
 *   "CurseForge:56789"
 *   "GitHub:Pathoschild/StardewMods"
 *   "Nexus:1234@Linux"
 *
 * Docs: https://stardewvalleywiki.com/Modding:Modder_Guide/APIs/Update_checks
 */

export type ModSite =
  | "Nexus"
  | "CurseForge"
  | "ModDrop"
  | "GitHub"
  | "Chucklefish"
  | "UpdateManifest";

const SITE_ALIASES: Record<string, ModSite> = {
  nexus: "Nexus",
  nexusmods: "Nexus",
  curseforge: "CurseForge",
  curse: "CurseForge",
  moddrop: "ModDrop",
  github: "GitHub",
  chucklefish: "Chucklefish",
  updatemanifest: "UpdateManifest",
};

export interface UpdateKey {
  readonly site: ModSite;
  /** Numeric mod id for most sites, or `owner/repo` for GitHub. */
  readonly id: string;
  /** Optional `@subkey` qualifier (e.g. a platform), or null. */
  readonly subkey: string | null;
  /** The normalised canonical string form. */
  readonly raw: string;
}

/** Parse a single update key, or null if it is malformed / an unknown site. */
export function parseUpdateKey(input: string): UpdateKey | null {
  const trimmed = input.trim();
  const colon = trimmed.indexOf(":");
  if (colon <= 0) return null;

  const siteRaw = trimmed.slice(0, colon).trim().toLowerCase();
  const site = SITE_ALIASES[siteRaw];
  if (!site) return null;

  let rest = trimmed.slice(colon + 1).trim();
  let subkey: string | null = null;
  const at = rest.indexOf("@");
  if (at >= 0) {
    subkey = rest.slice(at + 1).trim() || null;
    rest = rest.slice(0, at).trim();
  }
  if (!rest) return null;

  const raw = `${site}:${rest}${subkey ? `@${subkey}` : ""}`;
  return { site, id: rest, subkey, raw };
}

/** Parse a list of update keys, dropping any that are malformed. */
export function parseUpdateKeys(inputs: readonly string[]): UpdateKey[] {
  const out: UpdateKey[] = [];
  for (const input of inputs) {
    const key = parseUpdateKey(input);
    if (key) out.push(key);
  }
  return out;
}
