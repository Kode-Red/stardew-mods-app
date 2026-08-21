/**
 * Community mod listings.
 *
 * A listing is metadata only — never mod files. It points at a mod's GitHub
 * repo, and the app installs from that repo's latest release (reusing the
 * GitHub install path). So a first-party "directory" can be a plain JSON index
 * hosted on GitHub; creators submit a listing by PR. We host listings, GitHub
 * hosts the files — no redistribution.
 */

import { z } from "zod";

export interface ModListing {
  name: string;
  author: string | null;
  summary: string | null;
  /** GitHub "owner/repo" the mod is released from. */
  githubRepo: string;
  imageUrl: string | null;
  category: string | null;
}

const GITHUB_REPO_RE = /(?:github\.com\/)?([\w.-]+\/[\w.-]+?)(?:\.git|\/)?$/i;

/** Normalise a "owner/repo" or a github.com URL to "owner/repo", or null. */
export function normaliseGithubRepo(input: string): string | null {
  const match = GITHUB_REPO_RE.exec(input.trim());
  const repo = match?.[1];
  return repo && repo.includes("/") ? repo : null;
}

const listingSchema = z.object({
  name: z.string().min(1),
  author: z.string().nullish(),
  summary: z.string().nullish(),
  github: z.string().min(1),
  image: z.string().nullish(),
  category: z.string().nullish(),
});

/** Parse a listings index: either `{ mods: [...] }` or a bare array. */
export function parseListingsIndex(raw: unknown): ModListing[] {
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { mods?: unknown }).mods)
      ? (raw as { mods: unknown[] }).mods
      : [];

  const out: ModListing[] = [];
  for (const item of arr) {
    const parsed = listingSchema.safeParse(item);
    if (!parsed.success) continue;
    const repo = normaliseGithubRepo(parsed.data.github);
    if (!repo) continue;
    out.push({
      name: parsed.data.name,
      author: parsed.data.author ?? null,
      summary: parsed.data.summary ?? null,
      githubRepo: repo,
      imageUrl: parsed.data.image ?? null,
      category: parsed.data.category ?? null,
    });
  }
  return out;
}
