import { describe, expect, it } from "vitest";
import { associateSaves, farmNameFromFolder, findSaveProfileMismatch } from "./saves.js";

describe("associateSaves", () => {
  it("tags saves modified at/after the launch with its profile", () => {
    const saves = [
      { folder: "Farm_1", lastModifiedMs: 100 },
      { folder: "Farm_2", lastModifiedMs: 250 },
    ];
    const next = associateSaves(saves, { Farm_1: "old" }, { profileId: "P", at: 200 });
    expect(next).toEqual({ Farm_1: "old", Farm_2: "P" });
  });

  it("no-ops without a launch record", () => {
    const next = associateSaves([{ folder: "A", lastModifiedMs: 1 }], { A: "x" }, null);
    expect(next).toEqual({ A: "x" });
  });
});

describe("findSaveProfileMismatch", () => {
  const saves = [
    { folder: "Old_1", lastModifiedMs: 100 },
    { folder: "Recent_2", lastModifiedMs: 500 },
  ];

  it("flags when the newest save's profile differs from the active one", () => {
    expect(findSaveProfileMismatch(saves, { Recent_2: "expanded" }, "vanilla")).toEqual({
      folder: "Recent_2",
      savedProfileId: "expanded",
    });
  });

  it("returns null when they match or nothing is assigned", () => {
    expect(findSaveProfileMismatch(saves, { Recent_2: "vanilla" }, "vanilla")).toBeNull();
    expect(findSaveProfileMismatch(saves, {}, "vanilla")).toBeNull();
    expect(findSaveProfileMismatch(saves, { Recent_2: "x" }, null)).toBeNull();
  });
});

describe("farmNameFromFolder", () => {
  it("strips the trailing id", () => {
    expect(farmNameFromFolder("Sunnyside_167412345")).toBe("Sunnyside");
    expect(farmNameFromFolder("weird")).toBe("weird");
  });
});
