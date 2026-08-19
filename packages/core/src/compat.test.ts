import { describe, expect, it } from "vitest";
import {
  checkApiCompatibility,
  checkForUpdate,
  findMissingDependencies,
} from "./compat.js";

describe("checkForUpdate", () => {
  it("reports up-to-date", () => {
    expect(checkForUpdate("1.0.0", "1.0.0").status).toBe("up-to-date");
  });
  it("reports an available update", () => {
    expect(checkForUpdate("1.0.0", "1.2.0").status).toBe("update-available");
  });
  it("reports ahead for a newer local build", () => {
    expect(checkForUpdate("1.3.0", "1.2.0").status).toBe("ahead");
  });
  it("reports unknown when latest is missing or unparseable", () => {
    expect(checkForUpdate("1.0.0", null).status).toBe("unknown");
    expect(checkForUpdate("1.0.0", "???").status).toBe("unknown");
  });
});

describe("checkApiCompatibility", () => {
  it("passes when SMAPI meets the minimum", () => {
    expect(
      checkApiCompatibility({ minimumApiVersion: "4.0.0" }, "4.1.0"),
    ).toBe("ok");
  });
  it("flags an outdated SMAPI", () => {
    expect(
      checkApiCompatibility({ minimumApiVersion: "4.0.0" }, "3.18.0"),
    ).toBe("smapi-too-old");
  });
  it("is unknown when no minimum is declared", () => {
    expect(checkApiCompatibility({ minimumApiVersion: null }, "4.0.0")).toBe(
      "unknown",
    );
  });
});

describe("findMissingDependencies", () => {
  const manifest = {
    dependencies: [
      { uniqueId: "a.required", minimumVersion: "1.2.0", required: true },
      { uniqueId: "b.optional", minimumVersion: null, required: false },
      { uniqueId: "c.present", minimumVersion: "1.0.0", required: true },
    ],
  };

  it("flags a missing required dependency", () => {
    const problems = findMissingDependencies(
      manifest,
      new Map([["c.present", "1.0.0"]]),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ uniqueId: "a.required", reason: "missing" });
  });

  it("flags an outdated required dependency", () => {
    const problems = findMissingDependencies(
      manifest,
      new Map([
        ["a.required", "1.1.0"],
        ["c.present", "1.0.0"],
      ]),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ uniqueId: "a.required", reason: "outdated" });
  });

  it("ignores optional dependencies and satisfied ones", () => {
    const problems = findMissingDependencies(
      manifest,
      new Map([
        ["a.required", "1.2.0"],
        ["c.present", "1.5.0"],
      ]),
    );
    expect(problems).toHaveLength(0);
  });
});
