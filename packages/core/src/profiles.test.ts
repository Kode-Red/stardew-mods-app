import { describe, expect, it } from "vitest";
import {
  canonicalModKey,
  captureProfileState,
  computeProfileActions,
} from "./profiles.js";

describe("canonicalModKey", () => {
  it("strips disable-dots per segment", () => {
    expect(canonicalModKey("ContentPatcher")).toBe("ContentPatcher");
    expect(canonicalModKey(".ContentPatcher")).toBe("ContentPatcher");
    expect(canonicalModKey("Category/.Mod")).toBe("Category/Mod");
  });
});

describe("captureProfileState", () => {
  it("captures only enabled mods as canonical keys, sorted", () => {
    const keys = captureProfileState([
      { relativePath: "B", enabled: true },
      { relativePath: ".A", enabled: false },
      { relativePath: "C", enabled: true },
    ]);
    expect(keys).toEqual(["B", "C"]);
  });
});

describe("computeProfileActions", () => {
  const mods = [
    { relativePath: "Enabled", enabled: true },
    { relativePath: ".Disabled", enabled: false },
    { relativePath: "AlsoOn", enabled: true },
  ];

  it("enables mods in the profile that are currently off", () => {
    const actions = computeProfileActions(mods, ["Enabled", "Disabled", "AlsoOn"]);
    expect(actions).toEqual([{ relativePath: ".Disabled", enable: true }]);
  });

  it("disables mods not in the profile that are currently on", () => {
    const actions = computeProfileActions(mods, ["Enabled"]);
    expect(actions).toContainEqual({ relativePath: "AlsoOn", enable: false });
    expect(actions).not.toContainEqual({ relativePath: "Enabled", enable: false });
  });

  it("is a no-op when disk already matches the profile", () => {
    expect(computeProfileActions(mods, ["Enabled", "AlsoOn"])).toEqual([]);
  });
});
