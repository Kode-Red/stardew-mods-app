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

// A manager should list/organize any real mod, so the parser is deliberately
// tolerant: only Name + UniqueID + Version are required (Version may be a number
// and is coerced to a string). Everything else is read best-effort in normalise
// and can be any shape without rejecting the whole manifest.
const versionLike = z.union([z.string(), z.number()]).transform((v) => String(v));

export const manifestSchema = z
  .object({
    Name: z.string().min(1),
    Version: versionLike,
    UniqueID: z.string().min(1),
    Author: z.unknown().optional(),
    Description: z.unknown().optional(),
    EntryDll: z.unknown().optional(),
    MinimumApiVersion: z.unknown().optional(),
    UpdateKeys: z.unknown().optional(),
    Dependencies: z.unknown().optional(),
    ContentPackFor: z.unknown().optional(),
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

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

function normaliseAuthor(author: unknown): string | null {
  if (typeof author === "string") return author;
  if (Array.isArray(author)) return author.filter((a) => typeof a === "string").join(", ") || null;
  return null;
}

function normaliseUpdateKeys(value: unknown): UpdateKey[] {
  if (!Array.isArray(value)) return [];
  return parseUpdateKeys(value.filter((k): k is string => typeof k === "string"));
}

function normaliseDependencies(value: unknown): ModDependency[] {
  if (!Array.isArray(value)) return [];
  const out: ModDependency[] = [];
  for (const dep of value) {
    if (!dep || typeof dep !== "object") continue;
    const uniqueId = asString((dep as Record<string, unknown>).UniqueID);
    if (!uniqueId) continue;
    const required = (dep as Record<string, unknown>).IsRequired;
    out.push({
      uniqueId,
      minimumVersion: asString((dep as Record<string, unknown>).MinimumVersion),
      required: required !== false, // default true unless explicitly false
    });
  }
  return out;
}

function normaliseContentPackFor(value: unknown): Manifest["contentPackFor"] {
  if (!value || typeof value !== "object") return null;
  const uniqueId = asString((value as Record<string, unknown>).UniqueID);
  if (!uniqueId) return null;
  return { uniqueId, minimumVersion: asString((value as Record<string, unknown>).MinimumVersion) };
}

function normalise(raw: RawManifest): Manifest {
  const contentPackFor = normaliseContentPackFor(raw.ContentPackFor);
  return {
    name: raw.Name,
    author: normaliseAuthor(raw.Author),
    version: raw.Version,
    description: asString(raw.Description),
    uniqueId: raw.UniqueID,
    entryDll: asString(raw.EntryDll),
    minimumApiVersion: asString(raw.MinimumApiVersion),
    updateKeys: normaliseUpdateKeys(raw.UpdateKeys),
    dependencies: normaliseDependencies(raw.Dependencies),
    contentPackFor,
    isContentPack: contentPackFor != null && asString(raw.EntryDll) == null,
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
  const stripped = jsonText.replace(/^﻿/, "");
  let json: unknown;
  try {
    // Parse the raw JSON first so valid files are never touched by comment-stripping.
    json = JSON.parse(stripped);
  } catch {
    try {
      json = JSON.parse(stripJsonComments(stripped));
    } catch (err) {
      throw new ManifestParseError(
        `manifest.json is not valid JSON: ${(err as Error).message}`,
      );
    }
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
