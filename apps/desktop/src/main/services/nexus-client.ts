import {
  nexusDownloadLinkUrl,
  nexusHeaders,
  nexusModFilesUrl,
  nexusValidateUrl,
  parseNexusDownloadLinks,
  parseNexusFiles,
  parseNexusValidate,
  type NexusFile,
  type NexusUser,
} from "@sdm/core";

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

/** Download a URL into memory, reporting progress via `onProgress(received, total)`. */
export async function downloadToBuffer(
  url: string,
  onProgress?: (received: number, total: number | null) => void,
): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new NexusError(`Download failed (${res.status}).`, res.status);
  }
  const totalHeader = res.headers.get("content-length");
  const total = totalHeader ? Number(totalHeader) : null;

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      onProgress?.(received, total);
    }
  }

  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
