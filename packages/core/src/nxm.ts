/**
 * `nxm://` link parsing.
 *
 * When a (free or premium) Nexus user clicks "Mod Manager Download" on the
 * website, Nexus fires a link at the registered protocol handler:
 *
 *   nxm://stardewvalley/mods/1915/files/98765?key=abc&expires=1700000000&user_id=42
 *
 * The `key`/`expires` pair is what lets *non-premium* users generate a download
 * link through the API, so capturing this link is the whole point of the desktop
 * protocol handler.
 */

export interface NxmLink {
  /** Nexus game domain, e.g. "stardewvalley". */
  game: string;
  modId: number;
  fileId: number;
  /** One-time download key (present for website-initiated downloads). */
  key: string | null;
  /** Unix timestamp after which `key` is invalid. */
  expires: number | null;
  userId: number | null;
}

const NXM_PATTERN = /^nxm:\/\/([^/]+)\/mods\/(\d+)\/files\/(\d+)(?:\?(.*))?$/i;

/** Minimal query-string parser (avoids a DOM/Node dependency in core). */
function parseQuery(query: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of query.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const key = decodeURIComponent(eq === -1 ? part : part.slice(0, eq));
    const value = eq === -1 ? "" : decodeURIComponent(part.slice(eq + 1));
    map.set(key, value);
  }
  return map;
}

/** Parse an `nxm://` link, or null if it is not a valid mod-file link. */
export function parseNxmLink(input: string): NxmLink | null {
  const match = NXM_PATTERN.exec(input.trim());
  if (!match) return null;
  const [, game, modId, fileId, query] = match;

  const params = parseQuery(query ?? "");
  const numericParam = (name: string): number | null => {
    const raw = params.get(name);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  return {
    game: game!.toLowerCase(),
    modId: Number(modId),
    fileId: Number(fileId),
    key: params.get("key") ?? null,
    expires: numericParam("expires"),
    userId: numericParam("user_id"),
  };
}

/** True when a string looks like an `nxm://` link. */
export function isNxmLink(input: string): boolean {
  return NXM_PATTERN.test(input.trim());
}
