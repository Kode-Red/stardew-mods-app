import {
  nexusBrowseUrl,
  nexusDownloadLinkUrl,
  nexusHeaders,
  nexusModFilesUrl,
  nexusModUrl,
  nexusValidateUrl,
  parseNexusDownloadLinks,
  parseNexusFiles,
  parseNexusModDetail,
  parseNexusModSummaries,
  parseNexusValidate,
  type NexusBrowseKind,
  type NexusFile,
  type NexusModDetail,
  type NexusModSummary,
  type NexusUser,
} from "@sdm/core";

import { downloadToBuffer } from "./download.js";

export { downloadToBuffer };

export class NexusError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "NexusError";
  }
}

async function getJson(url: string, apiKey: string): Promise<unknown> {
  const res = await fetch(url, { headers: nexusHeaders(apiKey) });
  if (res.status === 401) throw new NexusError("Invalid Nexus API key.", 401);
  if (res.status === 403) {
    throw new NexusError(
      "Nexus refused the download. Free accounts must start downloads from the website (nxm links).",
      403,
    );
  }
  if (!res.ok) throw new NexusError(`Nexus API error ${res.status}.`, res.status);
  return res.json();
}

/** Validate an API key and return the user, or null if the key is rejected. */
export async function validateKey(apiKey: string): Promise<NexusUser | null> {
  try {
    return parseNexusValidate(await getJson(nexusValidateUrl(), apiKey));
  } catch (err) {
    if (err instanceof NexusError && err.status === 401) return null;
    throw err;
  }
}

export async function listFiles(apiKey: string, modId: number): Promise<NexusFile[]> {
  return parseNexusFiles(await getJson(nexusModFilesUrl(modId), apiKey));
}

export async function browseMods(
  apiKey: string,
  kind: NexusBrowseKind,
): Promise<NexusModSummary[]> {
  return parseNexusModSummaries(await getJson(nexusBrowseUrl(kind), apiKey));
}

export async function getModDetail(
  apiKey: string,
  modId: number,
): Promise<NexusModDetail | null> {
  return parseNexusModDetail(await getJson(nexusModUrl(modId), apiKey));
}

/** Resolve a direct CDN download URL for a mod file. */
export async function resolveDownloadUrl(
  apiKey: string,
  args: { modId: number; fileId: number; key?: string | null; expires?: number | null },
): Promise<string> {
  const url = nexusDownloadLinkUrl(args.modId, args.fileId, {
    key: args.key,
    expires: args.expires,
  });
  const mirrors = parseNexusDownloadLinks(await getJson(url, apiKey));
  if (mirrors.length === 0) {
    throw new NexusError("Nexus returned no download links for this file.");
  }
  return mirrors[0]!;
}
