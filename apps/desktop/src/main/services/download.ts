export class DownloadError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "DownloadError";
  }
}

/** GET a URL and parse JSON, with optional headers (e.g. a GitHub User-Agent). */
export async function fetchJson(
  url: string,
  headers: Record<string, string> = {},
): Promise<unknown> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new DownloadError(`Request failed (${res.status}).`, res.status);
  return res.json();
}

/** Download a URL into memory, reporting progress via `onProgress(received, total)`. */
export async function downloadToBuffer(
  url: string,
  onProgress?: (received: number, total: number | null) => void,
  headers: Record<string, string> = {},
): Promise<Uint8Array> {
  const res = await fetch(url, { headers });
  if (!res.ok || !res.body) {
    throw new DownloadError(`Download failed (${res.status}).`, res.status);
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
