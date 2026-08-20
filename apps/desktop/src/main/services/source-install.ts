import {
  githubLatestReleaseUrl,
  parseGithubRelease,
  pickReleaseModAsset,
  type UpdateKey,
} from "@sdm/core";
import type { Settings } from "./settings.js";
import { downloadToBuffer, fetchJson } from "./download.js";
import * as curseforge from "./curseforge-client.js";
import { listFiles as nexusListFiles, resolveDownloadUrl as nexusResolveUrl } from "./nexus-client.js";

const GITHUB_UA = { "user-agent": "StardewModManager" };

export type SourceDownload =
  | { kind: "archive"; buffer: Uint8Array; archiveName: string }
  | { kind: "site"; url: string }
  | { kind: "unsupported" };

export type DownloadProgress = (received: number, total: number | null, label: string) => void;

/**
 * Resolve a mod's update keys to a downloadable archive, trying sources in
 * priority order: CurseForge (key) → GitHub release (no key) → Nexus (premium).
 * Free-Nexus-only mods return a `site` result so the caller can open the page.
 * The archive is downloaded but NOT installed — callers decide what to do.
 */
export async function resolveSourceDownload(
  settings: Settings,
  keys: readonly UpdateKey[],
  onProgress?: DownloadProgress,
): Promise<SourceDownload> {
  const cf = keys.find((k) => k.site === "CurseForge");
  const gh = keys.find((k) => k.site === "GitHub");
  const nx = keys.find((k) => k.site === "Nexus");

  if (cf && settings.curseForgeApiKey) {
    const modId = Number(cf.id);
    const files = await curseforge.listFiles(settings.curseForgeApiKey, modId);
    const fileId = files[0]?.fileId;
    if (fileId != null) {
      const url = await curseforge.resolveDownloadUrl(settings.curseForgeApiKey, modId, fileId);
      if (url) {
        const archiveName = url.split("/").pop() ?? `cf-${modId}.zip`;
        const buffer = await downloadToBuffer(url, (r, t) => onProgress?.(r, t, archiveName));
        return { kind: "archive", buffer, archiveName };
      }
    }
  }

  if (gh) {
    const release = parseGithubRelease(await fetchJson(githubLatestReleaseUrl(gh.id), GITHUB_UA));
    const asset = release ? pickReleaseModAsset(release) : null;
    if (asset) {
      const buffer = await downloadToBuffer(asset.url, (r, t) => onProgress?.(r, t, asset.name), GITHUB_UA);
      return { kind: "archive", buffer, archiveName: asset.name };
    }
  }

  if (nx && settings.nexusApiKey && settings.nexusUser?.isPremium) {
    const modId = Number(nx.id);
    const files = await nexusListFiles(settings.nexusApiKey, modId);
    const file = files.find((f) => f.isPrimary) ?? files.find((f) => f.category === "MAIN") ?? files[0];
    if (file) {
      const url = await nexusResolveUrl(settings.nexusApiKey, { modId, fileId: file.fileId });
      const archiveName = file.fileName ?? `nexus-${modId}.zip`;
      const buffer = await downloadToBuffer(url, (r, t) => onProgress?.(r, t, archiveName));
      return { kind: "archive", buffer, archiveName };
    }
  }

  if (nx) return { kind: "site", url: `https://www.nexusmods.com/stardewvalley/mods/${nx.id}` };
  return { kind: "unsupported" };
}
