import { describe, expect, it } from "vitest";
import {
  buildUpdateCheckRequest,
  parseUpdateCheckResponse,
  resolveUpdateStatus,
  updateCheckUrl,
} from "./smapi-api.js";

describe("buildUpdateCheckRequest", () => {
  it("maps mods and omits empty optional fields", () => {
    const body = buildUpdateCheckRequest([
      { uniqueId: "a.b", updateKeys: ["Nexus:1"], installedVersion: "1.0.0" },
      { uniqueId: "c.d", updateKeys: [] },
    ]);
    expect(body.mods).toEqual([
      { id: "a.b", updateKeys: ["Nexus:1"], installedVersion: "1.0.0" },
      { id: "c.d", updateKeys: [] },
    ]);
    expect(body.apiVersion).toBeUndefined();
    expect(body.includeExtendedMetadata).toBeUndefined();
  });

  it("includes options when provided", () => {
    const body = buildUpdateCheckRequest([{ uniqueId: "a.b", updateKeys: [] }], {
      apiVersion: "4.1.10",
      gameVersion: "1.6.15",
      platform: "Windows",
      includeExtendedMetadata: true,
    });
    expect(body.apiVersion).toBe("4.1.10");
    expect(body.gameVersion).toBe("1.6.15");
    expect(body.platform).toBe("Windows");
    expect(body.includeExtendedMetadata).toBe(true);
  });

  it("flags broken mods", () => {
    const body = buildUpdateCheckRequest([
      { uniqueId: "a.b", updateKeys: [], isBroken: true },
    ]);
    expect(body.mods[0]!.isBroken).toBe(true);
  });
});

describe("updateCheckUrl", () => {
  it("defaults to the 3.0 format", () => {
    expect(updateCheckUrl()).toBe("https://smapi.io/api/3.0/mods");
  });
});

describe("parseUpdateCheckResponse", () => {
  it("normalises a well-formed response", () => {
    const results = parseUpdateCheckResponse([
      {
        id: "a.b",
        suggestedUpdate: { version: "2.0.0", url: "https://example.com" },
        errors: [],
        metadata: { compatibilityStatus: "Ok", compatibilitySummary: "Works." },
      },
      { id: "c.d", suggestedUpdate: null, errors: ["no update keys"] },
    ]);
    expect(results[0]).toMatchObject({
      uniqueId: "a.b",
      latestVersion: "2.0.0",
      url: "https://example.com",
      compatibilityStatus: "Ok",
    });
    expect(results[1]).toMatchObject({
      uniqueId: "c.d",
      latestVersion: null,
      errors: ["no update keys"],
    });
  });

  it("skips malformed entries and non-arrays", () => {
    expect(parseUpdateCheckResponse([{ nope: true }, { id: "x.y" }])).toEqual([
      { uniqueId: "x.y", latestVersion: null, url: null, errors: [], compatibilityStatus: null, compatibilitySummary: null },
    ]);
    expect(parseUpdateCheckResponse({})).toEqual([]);
    expect(parseUpdateCheckResponse(null)).toEqual([]);
  });
});

describe("resolveUpdateStatus", () => {
  it("reports an available update from a result", () => {
    const status = resolveUpdateStatus("1.0.0", { latestVersion: "1.2.0" });
    expect(status.status).toBe("update-available");
  });
  it("is unknown when there is no result", () => {
    expect(resolveUpdateStatus("1.0.0", undefined).status).toBe("unknown");
  });
});
