/**
 * SMAPI Web API — mod update checks.
 *
 * SMAPI hosts a service that, given a mod's UniqueID + UpdateKeys, returns the
 * latest version and community compatibility status across Nexus, CurseForge,
 * ModDrop and GitHub at once. This is the engine behind our version-mismatch
 * feature: it needs no download access to *tell* the user what is outdated.
 *
 *   POST https://smapi.io/api/{version}/mods
 *
 * These helpers are pure: the request body is built here and the response is
 * validated here, while the actual network call lives in the main process.
 *
 * Docs: https://github.com/Pathoschild/SMAPI/blob/develop/docs/technical/web.md
 */

import { z } from "zod";
import { checkForUpdate, type UpdateCheck } from "./compat.js";

export type SmapiPlatform = "Android" | "Linux" | "Mac" | "Windows";

export interface UpdateCheckModInput {
  uniqueId: string;
  updateKeys: readonly string[];
  installedVersion?: string | null;
  isBroken?: boolean;
}

export interface UpdateCheckOptions {
  /** Installed SMAPI version. */
  apiVersion?: string | null;
  /** Installed Stardew Valley version. */
  gameVersion?: string | null;
  platform?: SmapiPlatform | null;
  /** Request the extended `metadata` block (compatibility status, etc.). */
  includeExtendedMetadata?: boolean;
}

interface RequestMod {
  id: string;
  updateKeys: string[];
  installedVersion?: string;
  isBroken?: boolean;
}

export interface UpdateCheckRequestBody {
  mods: RequestMod[];
  apiVersion?: string;
  gameVersion?: string;
  platform?: string;
  includeExtendedMetadata?: boolean;
}

/** Build the POST body for the SMAPI update-check API, omitting empty fields. */
export function buildUpdateCheckRequest(
  mods: readonly UpdateCheckModInput[],
  options: UpdateCheckOptions = {},
): UpdateCheckRequestBody {
  const body: UpdateCheckRequestBody = {
    mods: mods.map((mod) => {
      const entry: RequestMod = {
        id: mod.uniqueId,
        updateKeys: [...mod.updateKeys],
      };
      if (mod.installedVersion) entry.installedVersion = mod.installedVersion;
      if (mod.isBroken) entry.isBroken = true;
      return entry;
    }),
  };
  if (options.apiVersion) body.apiVersion = options.apiVersion;
  if (options.gameVersion) body.gameVersion = options.gameVersion;
  if (options.platform) body.platform = options.platform;
  if (options.includeExtendedMetadata) body.includeExtendedMetadata = true;
  return body;
}

/** Build the endpoint URL. `formatVersion` selects the response schema (SMAPI's own default is 3.0). */
export function updateCheckUrl(formatVersion = "3.0"): string {
  return `https://smapi.io/api/${formatVersion}/mods`;
}

const metadataSchema = z
  .object({
    name: z.string().nullish(),
    compatibilityStatus: z.string().nullish(),
    compatibilitySummary: z.string().nullish(),
  })
  .passthrough();

const rawResultSchema = z.object({
  id: z.string(),
  suggestedUpdate: z
    .object({ version: z.string(), url: z.string().nullish() })
    .nullish(),
  errors: z.array(z.string()).nullish(),
  metadata: metadataSchema.nullish(),
});

export interface UpdateCheckResult {
  uniqueId: string;
  latestVersion: string | null;
  url: string | null;
  errors: string[];
  /** Community compatibility status (e.g. "Ok", "Broken"), when requested. */
  compatibilityStatus: string | null;
  compatibilitySummary: string | null;
}

/** Validate and normalise the SMAPI response array, skipping malformed entries. */
export function parseUpdateCheckResponse(raw: unknown): UpdateCheckResult[] {
  if (!Array.isArray(raw)) return [];
  const results: UpdateCheckResult[] = [];
  for (const item of raw) {
    const parsed = rawResultSchema.safeParse(item);
    if (!parsed.success) continue;
    const r = parsed.data;
    results.push({
      uniqueId: r.id,
      latestVersion: r.suggestedUpdate?.version ?? null,
      url: r.suggestedUpdate?.url ?? null,
      errors: r.errors ?? [],
      compatibilityStatus: r.metadata?.compatibilityStatus ?? null,
      compatibilitySummary: r.metadata?.compatibilitySummary ?? null,
    });
  }
  return results;
}

/** Combine an installed version with a check result into an {@link UpdateCheck}. */
export function resolveUpdateStatus(
  installedVersion: string,
  result: Pick<UpdateCheckResult, "latestVersion"> | undefined,
): UpdateCheck {
  return checkForUpdate(installedVersion, result?.latestVersion ?? null);
}
