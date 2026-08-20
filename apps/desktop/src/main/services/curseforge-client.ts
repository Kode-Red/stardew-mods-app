import {
  CURSEFORGE_API_BASE,
  curseforgeDownloadUrl,
  curseforgeFilesUrl,
  curseforgeHeaders,
  curseforgeSearchUrl,
  parseCurseforgeDownloadUrl,
  parseCurseforgeFiles,
  parseCurseforgeSearch,
  type CurseforgeFile,
  type CurseforgeModSummary,
} from "@sdm/core";
import { fetchJson } from "./download.js";

export class CurseforgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CurseforgeError";
  }
}

async function cfGet(url: string, apiKey: string): Promise<unknown> {
  try {
    return await fetchJson(url, curseforgeHeaders(apiKey));
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) {
      throw new CurseforgeError("Invalid CurseForge API key.");
    }
    throw new CurseforgeError((err as Error).message);
  }
}

/** Validate a key by pinging the Stardew game endpoint. */
export async function validateKey(apiKey: string): Promise<boolean> {
  try {
    await fetchJson(`${CURSEFORGE_API_BASE}/v1/games/669`, curseforgeHeaders(apiKey));
    return true;
  } catch {
    return false;
  }
}

export async function searchMods(
  apiKey: string,
  query: string,
): Promise<CurseforgeModSummary[]> {
  return parseCurseforgeSearch(await cfGet(curseforgeSearchUrl(query), apiKey));
}

export async function listFiles(apiKey: string, modId: number): Promise<CurseforgeFile[]> {
  return parseCurseforgeFiles(await cfGet(curseforgeFilesUrl(modId), apiKey));
}

/** Resolve a file's download URL, or null when the author disabled distribution. */
export async function resolveDownloadUrl(
  apiKey: string,
  modId: number,
  fileId: number,
): Promise<string | null> {
  return parseCurseforgeDownloadUrl(await cfGet(curseforgeDownloadUrl(modId, fileId), apiKey));
}
