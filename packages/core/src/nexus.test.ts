import { describe, expect, it } from "vitest";
import {
  nexusDownloadLinkUrl,
  nexusHeaders,
  nexusModFilesUrl,
  parseNexusDownloadLinks,
  parseNexusFiles,
  parseNexusValidate,
} from "./nexus.js";

describe("nexus request builders", () => {
  it("sets the apikey header", () => {
    expect(nexusHeaders("KEY").apikey).toBe("KEY");
  });

  it("builds the files URL for the Stardew domain by default", () => {
    expect(nexusModFilesUrl(1915)).toBe(
      "https://api.nexusmods.com/v1/games/stardewvalley/mods/1915/files.json",
    );
  });

  it("omits key/expires for premium download links", () => {
    expect(nexusDownloadLinkUrl(1, 2)).toBe(
      "https://api.nexusmods.com/v1/games/stardewvalley/mods/1/files/2/download_link.json",
    );
  });

  it("appends key/expires for non-premium download links", () => {
    const url = nexusDownloadLinkUrl(1, 2, { key: "abc", expires: 1700000000 });
    expect(url).toContain("?key=abc&expires=1700000000");
  });
});

describe("nexus response parsers", () => {
  it("parses a validate response", () => {
    expect(
      parseNexusValidate({ user_id: 42, name: "me", is_premium: true }),
    ).toEqual({ userId: 42, name: "me", isPremium: true });
    expect(parseNexusValidate({ bad: true })).toBeNull();
  });

  it("normalises the files list", () => {
    const files = parseNexusFiles({
      files: [
        { file_id: 5, name: "Main", version: "1.0", category_name: "MAIN", size_kb: 10, is_primary: true },
        { file_id: 6, name: "Old", version: "0.9", category_name: "OLD_VERSION" },
      ],
    });
    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({ fileId: 5, isPrimary: true, category: "MAIN" });
  });

  it("extracts download mirror URIs", () => {
    expect(
      parseNexusDownloadLinks([
        { name: "Nexus CDN", short_name: "Nexus", URI: "https://cdn/x.zip" },
      ]),
    ).toEqual(["https://cdn/x.zip"]);
    expect(parseNexusDownloadLinks({})).toEqual([]);
  });
});
