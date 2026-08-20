import { describe, expect, it } from "vitest";
import { findInstaller } from "./smapi-installer.js";

const EMPTY = new Uint8Array();

function tree(paths: string[]): Map<string, Uint8Array> {
  return new Map(paths.map((p) => [p, EMPTY]));
}

describe("findInstaller", () => {
  // These assertions assume the test host is Windows (the project's platform).
  const isWin = process.platform === "win32";

  it.runIf(isWin)("picks the Windows installer exe from the internal tree", () => {
    const files = tree([
      "SMAPI 4.1.10 installer/install on Windows.bat",
      "SMAPI 4.1.10 installer/internal/windows/SMAPI.Installer.exe",
      "SMAPI 4.1.10 installer/internal/windows/System.dll",
      "SMAPI 4.1.10 installer/internal/linux/SMAPI.Installer",
    ]);
    expect(findInstaller(files)).toBe(
      "SMAPI 4.1.10 installer/internal/windows/SMAPI.Installer.exe",
    );
  });

  it.runIf(isWin)("prefers an installer-named exe over other exes", () => {
    const files = tree([
      "x/internal/windows/Other.exe",
      "x/internal/windows/StardewModdingAPI.Installer.exe",
    ]);
    expect(findInstaller(files)).toBe("x/internal/windows/StardewModdingAPI.Installer.exe");
  });

  it("returns null when there is no matching installer", () => {
    expect(findInstaller(tree(["readme.txt", "internal/other/thing.dat"]))).toBeNull();
  });
});
