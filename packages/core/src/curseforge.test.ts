import { describe, expect, it } from "vitest";
import {
  curseforgeDownloadUrl,
  curseforgeHeaders,
  curseforgeSearchUrl,
  parseCurseforgeDownloadUrl,
  parseCurseforgeFiles,
  parseCurseforgeMod,
  parseCurseforgeSearch,
} from "./curseforge.js";

describe("curseforge builders", () => {
  it("sets the x-api-key header", () => {
    expect(curseforgeHeaders("KEY")["x-api-key"]).toBe("KEY");
  });

  it("builds a search URL for the Stardew game id", () => {
    const url = curseforgeSearchUrl("content patcher");
    expect(url).toContain("gameId=669");
    expect(url).toContain("searchFilter=content%20patcher");
  });

  it("builds a download-url endpoint", () => {
    expect(curseforgeDownloadUrl(1, 2)).toBe(
      "https://api.curseforge.com/v1/mods/1/files/2/download-url",
    );
  });
});

describe("curseforge parsers", () => {
  it("parses search results into summaries", () => {
    const mods = parseCurseforgeSearch({
      data: [
        {
          id: 300,
          name: "Content Patcher",
          summary: "loads packs",
          downloadCount: 1000,
          logo: { thumbnailUrl: "http://x/t.png" },
          authors: [{ name: "Pathoschild" }],
          links: { websiteUrl: "http://cf/mod" },
          allowModDistribution: true,
          latestFiles: [{ id: 555, fileName: "cp.zip" }],
        },
      ],
    });
    expect(mods).toHaveLength(1);
    expect(mods[0]).toMatchObject({
      modId: 300,
      name: "Content Patcher",
      author: "Pathoschild",
      downloads: 1000,
      allowDistribution: true,
      primaryFileId: 555,
    });
  });

  it("handles missing optional fields", () => {
    const [mod] = parseCurseforgeSearch({ data: [{ id: 9 }] });
    expect(mod).toMatchObject({ name: "Mod 9", author: null, primaryFileId: null, downloads: 0 });
  });

  it("parses a single mod detail", () => {
    expect(parseCurseforgeMod({ data: { id: 5, name: "X" } })?.modId).toBe(5);
    expect(parseCurseforgeMod({ nope: true })).toBeNull();
  });

  it("parses a files list newest-first", () => {
    const files = parseCurseforgeFiles({ data: [{ id: 2, fileName: "b.zip", releaseType: 1 }] });
    expect(files[0]).toMatchObject({ fileId: 2, fileName: "b.zip", releaseType: 1 });
  });

  it("parses a download url, and null when distribution is disabled", () => {
    expect(parseCurseforgeDownloadUrl({ data: "https://cdn/x.zip" })).toBe("https://cdn/x.zip");
    expect(parseCurseforgeDownloadUrl({ data: null })).toBeNull();
  });
});
