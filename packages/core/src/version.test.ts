import { describe, expect, it } from "vitest";
import {
  compareVersions,
  formatVersion,
  InvalidVersionError,
  isValidVersion,
  parseVersion,
  satisfiesMinimum,
  tryParseVersion,
} from "./version.js";

describe("parseVersion", () => {
  it("parses major.minor.patch", () => {
    expect(parseVersion("1.2.3")).toMatchObject({ major: 1, minor: 2, patch: 3 });
  });

  it("defaults an omitted patch to 0", () => {
    expect(parseVersion("1.2")).toMatchObject({ major: 1, minor: 2, patch: 0 });
  });

  it("strips a leading v", () => {
    expect(parseVersion("v2.0.0").major).toBe(2);
  });

  it("captures prerelease and build metadata", () => {
    const v = parseVersion("1.0.0-beta.2+build.5");
    expect(v.prerelease).toBe("beta.2");
    expect(v.build).toBe("build.5");
  });

  it("throws on garbage", () => {
    expect(() => parseVersion("not-a-version")).toThrow(InvalidVersionError);
  });

  it("tryParseVersion returns null instead of throwing", () => {
    expect(tryParseVersion("nope")).toBeNull();
  });
});

describe("isValidVersion", () => {
  it.each(["1.0.0", "1.0", "0.0.1-alpha", "10.20.30+meta"])("accepts %s", (v) => {
    expect(isValidVersion(v)).toBe(true);
  });
  it.each(["", "1", "1.2.3.4", "a.b.c", "1..2"])("rejects %s", (v) => {
    expect(isValidVersion(v)).toBe(false);
  });
});

describe("compareVersions", () => {
  it("orders by major, minor, then patch", () => {
    expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
    expect(compareVersions("1.2.0", "1.1.9")).toBe(1);
    expect(compareVersions("1.0.5", "1.0.5")).toBe(0);
  });

  it("treats 1.2 and 1.2.0 as equal", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
  });

  it("ranks a release above its prerelease", () => {
    expect(compareVersions("1.0.0", "1.0.0-rc.1")).toBe(1);
    expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBe(-1);
  });

  it("follows semver prerelease precedence", () => {
    // 1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-alpha.beta < 1.0.0-beta < 1.0.0-beta.2
    const ordered = [
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0",
    ];
    for (let i = 0; i < ordered.length - 1; i++) {
      expect(compareVersions(ordered[i]!, ordered[i + 1]!)).toBe(-1);
    }
  });

  it("ignores build metadata for precedence", () => {
    expect(compareVersions("1.0.0+a", "1.0.0+b")).toBe(0);
  });
});

describe("satisfiesMinimum", () => {
  it("passes when equal or greater", () => {
    expect(satisfiesMinimum("4.0.0", "4.0.0")).toBe(true);
    expect(satisfiesMinimum("4.1.0", "4.0.0")).toBe(true);
  });
  it("fails when below the minimum", () => {
    expect(satisfiesMinimum("3.18.0", "4.0.0")).toBe(false);
  });
});

describe("formatVersion", () => {
  it("round-trips a full version", () => {
    expect(formatVersion(parseVersion("1.2.3-rc.1+build9"))).toBe("1.2.3-rc.1+build9");
  });
});
