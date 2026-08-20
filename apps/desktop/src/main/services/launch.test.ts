import { describe, expect, it } from "vitest";
import { buildLaunchCommand } from "./launch.js";

describe("buildLaunchCommand", () => {
  it("launches Windows console apps via `start` for their own console", () => {
    const { command, args } = buildLaunchCommand(
      "C:\\Games\\Stardew Valley\\StardewModdingAPI.exe",
      "C:\\Games\\Stardew Valley",
      "win32",
    );
    expect(command).toBe("cmd.exe");
    expect(args).toEqual([
      "/c",
      "start",
      "",
      "/d",
      "C:\\Games\\Stardew Valley",
      "C:\\Games\\Stardew Valley\\StardewModdingAPI.exe",
    ]);
  });

  it("runs the executable directly on macOS/Linux", () => {
    expect(buildLaunchCommand("/games/sv/StardewModdingAPI", "/games/sv", "linux")).toEqual({
      command: "/games/sv/StardewModdingAPI",
      args: [],
    });
    expect(buildLaunchCommand("/games/sv/StardewModdingAPI", "/games/sv", "darwin").command).toBe(
      "/games/sv/StardewModdingAPI",
    );
  });
});
