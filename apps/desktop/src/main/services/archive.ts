import { unzipSync } from "fflate";

export class ArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveError";
  }
}

/**
 * Extract a zip into a map of posix path -> file bytes (directory entries and
 * anything that would escape the root via `..` are dropped). Non-zip archives
 * (rar/7z) are not supported yet and raise a clear error.
 */
export function extractZip(buffer: Uint8Array, archiveName = ""): Map<string, Uint8Array> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(buffer);
  } catch (err) {
    if (/\.(rar|7z)$/i.test(archiveName)) {
      throw new ArchiveError(
        "This mod is a .rar/.7z archive, which isn't supported yet. Extract it and install the folder instead.",
      );
    }
    throw new ArchiveError(`Could not read the archive: ${(err as Error).message}`);
  }

  const files = new Map<string, Uint8Array>();
  for (const [rawPath, data] of Object.entries(entries)) {
    const path = rawPath.replace(/\\/g, "/");
    if (path.endsWith("/")) continue; // directory entry
    // Zip-slip guard: reject absolute paths or any `..` traversal.
    if (path.startsWith("/") || path.split("/").includes("..")) continue;
    files.set(path, data);
  }
  return files;
}
