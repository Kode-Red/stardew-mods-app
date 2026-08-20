/**
 * Nexus Mods public API (v1) — request builders and response parsers.
 *
 * Auth is a personal API key sent in the `apikey` header. Non-premium users can
 * only generate a download link when they supply the `key`+`expires` pair from
 * an nxm:// link (see {@link ./nxm.ts}); premium users can omit it.
 *
 * These helpers are pure; the network call lives in the main process.
 * Docs: https://app.swaggerhub.com/apis-docs/NexusMods/nexus-mods_public_api_params_in_form_data
 */

import { z } from "zod";

export const NEXUS_API_BASE = "https://api.nexusmods.com";

/** Stardew Valley's Nexus game domain. */
export const STARDEW_DOMAIN = "stardewvalley";

export function nexusHeaders(apiKey: string): Record<string, string> {
  return {
    apikey: apiKey,
    accept: "application/json",
    "user-agent": "StardewModManager/0.0",
  };
}

export function nexusValidateUrl(): string {
  return `${NEXUS_API_BASE}/v1/users/validate.json`;
}

export function nexusModUrl(modId: number, game = STARDEW_DOMAIN): string {
  return `${NEXUS_API_BASE}/v1/games/${game}/mods/${modId}.json`;
}

export type NexusBrowseKind = "trending" | "latest_added" | "latest_updated";

export function nexusBrowseUrl(kind: NexusBrowseKind, game = STARDEW_DOMAIN): string {
  return `${NEXUS_API_BASE}/v1/games/${game}/mods/${kind}.json`;
}

export function nexusModFilesUrl(modId: number, game = STARDEW_DOMAIN): string {
  return `${NEXUS_API_BASE}/v1/games/${game}/mods/${modId}/files.json`;
}

/**
 * Download-link endpoint. Supply `key`+`expires` (from an nxm:// link) for
 * non-premium users; premium users may omit them.
 */
export function nexusDownloadLinkUrl(
  modId: number,
  fileId: number,
  options: { key?: string | null; expires?: number | null; game?: string } = {},
): string {
  const game = options.game ?? STARDEW_DOMAIN;
  const base = `${NEXUS_API_BASE}/v1/games/${game}/mods/${modId}/files/${fileId}/download_link.json`;
  if (options.key && options.expires != null) {
    return `${base}?key=${encodeURIComponent(options.key)}&expires=${options.expires}`;
  }
  return base;
}

// --- response parsing ---

const validateSchema = z.object({
  user_id: z.number(),
  name: z.string(),
  is_premium: z.boolean().optional(),
});

export interface NexusUser {
  userId: number;
  name: string;
  isPremium: boolean;
}

export function parseNexusValidate(raw: unknown): NexusUser | null {
  const parsed = validateSchema.safeParse(raw);
  if (!parsed.success) return null;
  return {
    userId: parsed.data.user_id,
    name: parsed.data.name,
    isPremium: parsed.data.is_premium ?? false,
  };
}

const fileSchema = z.object({
  file_id: z.number(),
  name: z.string(),
  version: z.string().nullish(),
  category_name: z.string().nullish(),
  size_kb: z.number().nullish(),
  file_name: z.string().nullish(),
  is_primary: z.boolean().nullish(),
});

export interface NexusFile {
  fileId: number;
  name: string;
  version: string | null;
  category: string | null;
  sizeKb: number | null;
  fileName: string | null;
  isPrimary: boolean;
}

export function parseNexusFiles(raw: unknown): NexusFile[] {
  const schema = z.object({ files: z.array(fileSchema) });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return [];
  return parsed.data.files.map((f) => ({
    fileId: f.file_id,
    name: f.name,
    version: f.version ?? null,
    category: f.category_name ?? null,
    sizeKb: f.size_kb ?? null,
    fileName: f.file_name ?? null,
    isPrimary: f.is_primary ?? false,
  }));
}

const downloadLinkSchema = z.array(z.object({ URI: z.string() }));

/** Extract the CDN download URLs (mirrors) from a download_link.json response. */
export function parseNexusDownloadLinks(raw: unknown): string[] {
  const parsed = downloadLinkSchema.safeParse(raw);
  if (!parsed.success) return [];
  return parsed.data.map((m) => m.URI);
}

const modSummarySchema = z.object({
  mod_id: z.number(),
  name: z.string().nullish(),
  summary: z.string().nullish(),
  version: z.string().nullish(),
  author: z.string().nullish(),
  uploaded_by: z.string().nullish(),
  picture_url: z.string().nullish(),
  endorsement_count: z.number().nullish(),
  created_timestamp: z.number().nullish(),
  updated_timestamp: z.number().nullish(),
  available: z.boolean().nullish(),
});

export interface NexusModSummary {
  modId: number;
  name: string;
  summary: string | null;
  version: string | null;
  author: string | null;
  pictureUrl: string | null;
  endorsements: number;
  updatedTimestamp: number | null;
}

function toSummary(m: z.infer<typeof modSummarySchema>): NexusModSummary {
  return {
    modId: m.mod_id,
    name: m.name ?? `Mod ${m.mod_id}`,
    summary: m.summary ?? null,
    version: m.version ?? null,
    author: m.author ?? m.uploaded_by ?? null,
    pictureUrl: m.picture_url ?? null,
    endorsements: m.endorsement_count ?? 0,
    updatedTimestamp: m.updated_timestamp ?? null,
  };
}

/** Parse a browse list (trending / latest), dropping malformed and unavailable mods. */
export function parseNexusModSummaries(raw: unknown): NexusModSummary[] {
  if (!Array.isArray(raw)) return [];
  const out: NexusModSummary[] = [];
  for (const item of raw) {
    const parsed = modSummarySchema.safeParse(item);
    if (!parsed.success) continue;
    if (parsed.data.available === false) continue;
    out.push(toSummary(parsed.data));
  }
  return out;
}

export interface NexusModDetail extends NexusModSummary {
  description: string | null;
  createdTimestamp: number | null;
}

const modDetailSchema = modSummarySchema.extend({
  description: z.string().nullish(),
});

/** Parse a single mod's detail response. */
export function parseNexusModDetail(raw: unknown): NexusModDetail | null {
  const parsed = modDetailSchema.safeParse(raw);
  if (!parsed.success) return null;
  return {
    ...toSummary(parsed.data),
    description: parsed.data.description ?? null,
    createdTimestamp: parsed.data.created_timestamp ?? null,
  };
}
