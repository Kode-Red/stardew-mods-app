import { describe, expect, it } from "vitest";
import {
  displayFolderName,
  isDisabledFolderName,
  toDisabledFolderName,
  toEnabledFolderName,
} from "./mod-folder.js";

describe("mod folder naming", () => {
  it("detects disabled folders by a leading dot", () => {
    expect(isDisabledFolderName(".ContentPatcher")).toBe(true);
    expect(isDisabledFolderName("ContentPatcher")).toBe(false);
  });

  it("disables by adding a dot, idempotently", () => {
    expect(toDisabledFolderName("ContentPatcher")).toBe(".ContentPatcher");
    expect(toDisabledFolderName(".ContentPatcher")).toBe(".ContentPatcher");
  });

  it("enables by stripping leading dots", () => {
    expect(toEnabledFolderName(".ContentPatcher")).toBe("ContentPatcher");
    expect(toEnabledFolderName("..Weird")).toBe("Weird");
    expect(toEnabledFolderName("ContentPatcher")).toBe("ContentPatcher");
  });

  it("shows the enabled name regardless of state", () => {
    expect(displayFolderName(".ContentPatcher")).toBe("ContentPatcher");
  });
});
