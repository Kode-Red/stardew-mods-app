/**
 * Minimal GitHub Releases helpers — used to fetch the latest SMAPI installer.
 *
 * Pure: builders + response parsing here, the network call in the main process.
 */

import { z } from "zod";

export function githubLatestReleaseUrl(repo: string): string {
  return `https://api.github.com/repos/${repo}/releases/latest`;
}

export interface GithubAsset {
  name: string;
  url: string;
  size: number;
}

export interface GithubRelease {
  tagName: string;
  name: string | null;
  assets: GithubAsset[];
}

const releaseSchema = z.object({
  tag_name: z.string(),
  name: z.string().nullish(),
  assets: z
    .array(
      z.object({
        name: z.string(),
        browser_download_url: z.string(),
        size: z.number().nullish(),
      }),
    )
    .default([]),
});

export function parseGithubRelease(raw: unknown): GithubRelease | null {
  const parsed = releaseSchema.safeParse(raw);
  if (!parsed.success) return null;
  return {
    tagName: parsed.data.tag_name,
    name: parsed.data.name ?? null,
    assets: parsed.data.assets.map((a) => ({
      name: a.name,
      url: a.browser_download_url,
      size: a.size ?? 0,
    })),
  };
}

/** SMAPI's installer asset is named like `SMAPI-4.1.10-installer.zip`. */
export function pickSmapiInstallerAsset(release: GithubRelease): GithubAsset | null {
  return (
    release.assets.find((a) => /installer\.zip$/i.test(a.name)) ??
    release.assets.find((a) => /\.zip$/i.test(a.name)) ??
    null
  );
}

/** Pick the mod archive from a release: prefer a .zip, avoiding source bundles. */
export function pickReleaseModAsset(release: GithubRelease): GithubAsset | null {
  const zips = release.assets.filter((a) => /\.zip$/i.test(a.name));
  return (
    zips.find((a) => !/source|src/i.test(a.name)) ??
    zips[0] ??
    release.assets[0] ??
    null
  );
}

/** Strip a leading `v` from a release tag to get a plain version. */
export function versionFromTag(tag: string): string {
  return tag.replace(/^v/i, "");
}
