import { describe, expect, it } from "vitest";
import {
  githubLatestReleaseUrl,
  parseGithubRelease,
  pickSmapiInstallerAsset,
  versionFromTag,
} from "./github.js";

describe("github helpers", () => {
  it("builds the latest-release URL", () => {
    expect(githubLatestReleaseUrl("Pathoschild/SMAPI")).toBe(
      "https://api.github.com/repos/Pathoschild/SMAPI/releases/latest",
    );
  });

  it("parses a release with assets", () => {
    const release = parseGithubRelease({
      tag_name: "4.1.10",
      name: "SMAPI 4.1.10",
      assets: [
        { name: "SMAPI-4.1.10-installer.zip", browser_download_url: "https://x/i.zip", size: 100 },
        { name: "SMAPI-4.1.10-for-developers.zip", browser_download_url: "https://x/d.zip" },
      ],
    });
    expect(release?.tagName).toBe("4.1.10");
    expect(release?.assets).toHaveLength(2);
    expect(release?.assets[1]!.size).toBe(0);
  });

  it("returns null for malformed input", () => {
    expect(parseGithubRelease({ nope: true })).toBeNull();
  });

  it("picks the installer asset", () => {
    const release = {
      tagName: "4.1.10",
      name: null,
      assets: [
        { name: "SMAPI-4.1.10-for-developers.zip", url: "https://x/d.zip", size: 0 },
        { name: "SMAPI-4.1.10-installer.zip", url: "https://x/i.zip", size: 0 },
      ],
    };
    expect(pickSmapiInstallerAsset(release)?.name).toBe("SMAPI-4.1.10-installer.zip");
  });

  it("strips a leading v from a tag", () => {
    expect(versionFromTag("v4.1.10")).toBe("4.1.10");
    expect(versionFromTag("4.1.10")).toBe("4.1.10");
  });
});
