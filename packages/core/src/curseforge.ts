/**
 * CurseForge API (v1) — request builders and response parsers.
 *
 * Auth is an `x-api-key` header (a per-developer key from console.curseforge.com,
 * which the user pastes into Settings). Each project can disable third-party
 * distribution (`allowModDistribution`); when it does, the download-url endpoint
 * returns null and we must send the user to the website instead.
 *
 * Pure: builders + parsing here, the network call in the main process.
 * Docs: https://docs.curseforge.com
 */

import { z } from "zod";

export const CURSEFORGE_API_BASE = "https://api.curseforge.com";

/** CurseForge's game id for Stardew Valley. */
export const STARDEW_GAME_ID = 669;

export function curseforgeHeaders(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey,
    accept: "application/json",
  };
}

export function curseforgeSearchUrl(query: string, gameId = STARDEW_GAME_ID): string {
  const params = [
    `gameId=${gameId}`,
    `searchFilter=${encodeURIComponent(query)}`,
    "sortField=2", // Popularity
    "sortOrder=desc",
    "pageSize=30",
  ].join("&");
  return `${CURSEFORGE_API_BASE}/v1/mods/search?${params}`;
}

export function curseforgeModUrl(modId: number): string {
  return `${CURSEFORGE_API_BASE}/v1/mods/${modId}`;
}

export function curseforgeFilesUrl(modId: number): string {
  return `${CURSEFORGE_API_BASE}/v1/mods/${modId}/files`;
}

export function curseforgeDownloadUrl(modId: number, fileId: number): string {
  return `${CURSEFORGE_API_BASE}/v1/mods/${modId}/files/${fileId}/download-url`;
}

const cfFileSchema = z.object({
  id: z.number(),
  fileName: z.string().nullish(),
  displayName: z.string().nullish(),
  releaseType: z.number().nullish(), // 1 = release, 2 = beta, 3 = alpha
  fileLength: z.number().nullish(),
});

const cfModSchema = z.object({
  id: z.number(),
  name: z.string().nullish(),
  summary: z.string().nullish(),
  downloadCount: z.number().nullish(),
  logo: z.object({ thumbnailUrl: z.string().nullish(), url: z.string().nullish() }).nullish(),
  authors: z.array(z.object({ name: z.string() })).nullish(),
  links: z.object({ websiteUrl: z.string().nullish() }).nullish(),
  allowModDistribution: z.boolean().nullish(),
  latestFiles: z.array(cfFileSchema).nullish(),
});

export interface CurseforgeFile {
  fileId: number;
  fileName: string | null;
  displayName: string | null;
  releaseType: number | null;
}

export interface CurseforgeModSummary {
  modId: number;
  name: string;
  summary: string | null;
  author: string | null;
  logoUrl: string | null;
  downloads: number;
  websiteUrl: string | null;
  /** False when the author disabled third-party downloads. Null = unknown. */
  allowDistribution: boolean | null;
  /** The newest file id, if the mod exposes one (used to install directly). */
  primaryFileId: number | null;
}

function toCfSummary(m: z.infer<typeof cfModSchema>): CurseforgeModSummary {
  const files = m.latestFiles ?? [];
  return {
    modId: m.id,
    name: m.name ?? `Mod ${m.id}`,
    summary: m.summary ?? null,
    author: m.authors?.[0]?.name ?? null,
    logoUrl: m.logo?.thumbnailUrl ?? m.logo?.url ?? null,
    downloads: m.downloadCount ?? 0,
    websiteUrl: m.links?.websiteUrl ?? null,
    allowDistribution: m.allowModDistribution ?? null,
    primaryFileId: files[0]?.id ?? null,
  };
}

/** Parse a `/mods/search` response ({ data: [...] }). */
export function parseCurseforgeSearch(raw: unknown): CurseforgeModSummary[] {
  const schema = z.object({ data: z.array(cfModSchema) });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return [];
  return parsed.data.data.map(toCfSummary);
}

/** Parse a single `/mods/{id}` response ({ data: {...} }). */
export function parseCurseforgeMod(raw: unknown): CurseforgeModSummary | null {
  const schema = z.object({ data: cfModSchema });
  const parsed = schema.safeParse(raw);
  return parsed.success ? toCfSummary(parsed.data.data) : null;
}

/** Parse a `/mods/{id}/files` response, newest first. */
export function parseCurseforgeFiles(raw: unknown): CurseforgeFile[] {
  const schema = z.object({ data: z.array(cfFileSchema) });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return [];
  return parsed.data.data.map((f) => ({
    fileId: f.id,
    fileName: f.fileName ?? null,
    displayName: f.displayName ?? null,
    releaseType: f.releaseType ?? null,
  }));
}

/**
 * Parse a `/files/{id}/download-url` response ({ data: "https://..." }).
 * Returns null when the author disabled third-party distribution.
 */
export function parseCurseforgeDownloadUrl(raw: unknown): string | null {
  const schema = z.object({ data: z.string().nullish() });
  const parsed = schema.safeParse(raw);
  return parsed.success ? (parsed.data.data ?? null) : null;
}
