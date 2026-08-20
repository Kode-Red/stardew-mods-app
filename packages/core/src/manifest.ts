/**
 * SMAPI `manifest.json` schema and parsing.
 *
 * Every SMAPI mod ships a `manifest.json` in its folder. Content packs use the
 * same file with a `ContentPackFor` field instead of an `EntryDll`. Fields use
 * PascalCase. SMAPI's own JSON reader is lenient (BOM, comments), so we strip a
 * BOM and tolerate `// line` and `/* block *\/` comments before validating.
 *
 * Docs: https://stardewvalleywiki.com/Modding:Modder_Guide/APIs/Manifest
 */

import { z } from "zod";
import { parseUpdateKeys, type UpdateKey } from "./update-keys.js";

// Versions are kept lenient on purpose: a manager should still list and organize
// a mod whose version string isn't textbook semver. Version *comparisons* handle
// unparseable values gracefully (they resolve to "unknown"), so we only require a
// non-empty string here rather than rejecting the whole manifest.
const versionString = z.string().min(1);

const dependencySchema = z.object({
  UniqueID: z.string().min(1),
  MinimumVersion: z.string().optional(),
  IsRequired: z.boolean().optional(),
});

const contentPackForSchema = z.object({
  UniqueID: z.string().min(1),
  MinimumVersion: z.string().optional(),
});

// Author can be a string or (rarely) an array/object in the wild; coerce loosely.
const authorSchema = z.union([z.string(), z.array(z.string()), z.record(z.unknown())]);

export const manifestSchema = z
  .object({
    Name: z.string().min(1),
    Author: authorSchema.optional(),
    Version: versionString,
    Description: z.string().optional(),
    UniqueID: z.string().min(1),
    EntryDll: z.string().optional(),
    MinimumApiVersion: z.string().optional(),
    UpdateKeys: z.array(z.string()).optional(),
    Dependencies: z.array(dependencySchema).optional(),
    ContentPackFor: contentPackForSchema.optional(),
  })
  .passthrough();

export type RawManifest = z.infer<typeof manifestSchema>;

export interface ModDependency {
  uniqueId: string;
  minimumVersion: string | null;
  required: boolean;
}

/** A validated, normalised manifest with camelCase fields for app use. */
export interface Manifest {
  name: string;
  author: string | null;
  version: string;
  description: string | null;
  uniqueId: string;
  entryDll: string | null;
  minimumApiVersion: string | null;
  updateKeys: UpdateKey[];
  dependencies: ModDependency[];
  contentPackFor: { uniqueId: string; minimumVersion: string | null } | null;
  /** True for content packs (no EntryDll, has ContentPackFor). */
  isContentPack: boolean;
  /** The original parsed object, including unknown passthrough fields. */
  raw: RawManifest;
}

export class ManifestParseError extends Error {
  constructor(
    message: string,
    readonly issues?: z.ZodIssue[],
  ) {
    super(message);
    this.name = "ManifestParseError";
  }
}

function stripJsonComments(input: string): string {
  // Remove a UTF-8 BOM and JSON comments, preserving anything inside strings.
  let out = "";
  let inString = false;
  let escaped = false;
  const src = input.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    const next = src[i + 1];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      out += "\n";
    } else if (ch === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i++; // skip the closing slash on the next loop increment
    } else {
      out += ch;
    }
  }
  return out;
}

function normaliseAuthor(author: RawManifest["Author"]): string | null {
  if (typeof author === "string") return author;
  if (Array.isArray(author)) return author.join(", ");
  return null;
}

function normalise(raw: RawManifest): Manifest {
  return {
    name: raw.Name,
    author: normaliseAuthor(raw.Author),
    version: raw.Version,
    description: raw.Description ?? null,
    uniqueId: raw.UniqueID,
    entryDll: raw.EntryDll ?? null,
    minimumApiVersion: raw.MinimumApiVersion ?? null,
    updateKeys: parseUpdateKeys(raw.UpdateKeys ?? []),
    dependencies: (raw.Dependencies ?? []).map((d) => ({
      uniqueId: d.UniqueID,
      minimumVersion: d.MinimumVersion ?? null,
      required: d.IsRequired ?? true,
    })),
    contentPackFor: raw.ContentPackFor
      ? {
          uniqueId: raw.ContentPackFor.UniqueID,
          minimumVersion: raw.ContentPackFor.MinimumVersion ?? null,
        }
      : null,
    isContentPack: raw.ContentPackFor != null && raw.EntryDll == null,
    raw,
  };
}

/** Validate an already-parsed manifest object. Throws {@link ManifestParseError}. */
export function parseManifestObject(value: unknown): Manifest {
  const result = manifestSchema.safeParse(value);
  if (!result.success) {
    throw new ManifestParseError(
      "manifest.json failed validation",
      result.error.issues,
    );
  }
  return normalise(result.data);
}

/** Parse manifest.json text (tolerating BOM/comments). Throws on failure. */
export function parseManifest(jsonText: string): Manifest {
  let json: unknown;
  try {
    json = JSON.parse(stripJsonComments(jsonText));
  } catch (err) {
    throw new ManifestParseError(
      `manifest.json is not valid JSON: ${(err as Error).message}`,
    );
  }
  return parseManifestObject(json);
}

/** Non-throwing variant returning a discriminated result. */
export function tryParseManifest(
  jsonText: string,
): { ok: true; manifest: Manifest } | { ok: false; error: ManifestParseError } {
  try {
    return { ok: true, manifest: parseManifest(jsonText) };
  } catch (err) {
    return { ok: false, error: err as ManifestParseError };
  }
}
