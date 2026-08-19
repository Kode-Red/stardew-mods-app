import {
  buildUpdateCheckRequest,
  parseUpdateCheckResponse,
  resolveUpdateStatus,
  updateCheckUrl,
  type SmapiPlatform,
  type UpdateCheckModInput,
  type UpdateCheckResult,
} from "@sdm/core";
import type { ScannedMod, SmapiInfo, UpdateInfo } from "../../shared/types.js";

function currentPlatform(): SmapiPlatform {
  switch (process.platform) {
    case "win32":
      return "Windows";
    case "darwin":
      return "Mac";
    default:
      return "Linux";
  }
}

/**
 * Query the SMAPI Web API for the latest version + compatibility of each mod
 * that has a valid manifest, and fold the answer into an UpdateInfo per mod.
 * Network failures resolve every mod to "unknown" rather than throwing.
 */
export async function checkUpdates(
  mods: readonly ScannedMod[],
  smapi: SmapiInfo,
): Promise<UpdateInfo[]> {
  const withManifest = mods.filter((m) => m.manifest !== null);
  if (withManifest.length === 0) return [];

  const inputs: UpdateCheckModInput[] = withManifest.map((m) => ({
    uniqueId: m.manifest!.uniqueId,
    updateKeys: m.manifest!.updateKeys.map((k) => k.raw),
    installedVersion: m.manifest!.version,
    isBroken: false,
  }));

  const body = buildUpdateCheckRequest(inputs, {
    apiVersion: smapi.version,
    platform: currentPlatform(),
    includeExtendedMetadata: true,
  });

  let results: UpdateCheckResult[];
  try {
    const response = await fetch(updateCheckUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "StardewModManager/0.0 (+phase2)",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`SMAPI API responded ${response.status}`);
    results = parseUpdateCheckResponse(await response.json());
  } catch {
    results = [];
  }

  const byId = new Map(results.map((r) => [r.uniqueId.toLowerCase(), r]));

  return withManifest.map((m) => {
    const manifest = m.manifest!;
    const result = byId.get(manifest.uniqueId.toLowerCase());
    const status = resolveUpdateStatus(manifest.version, result);
    return {
      uniqueId: manifest.uniqueId,
      status: status.status,
      installedVersion: manifest.version,
      latestVersion: result?.latestVersion ?? null,
      url: result?.url ?? null,
      compatibilityStatus: result?.compatibilityStatus ?? null,
      errors: result?.errors ?? [],
    } satisfies UpdateInfo;
  });
}
