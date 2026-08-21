import { join } from "node:path";
import { writeFile, readFile } from "node:fs/promises";
import {
  associateSaves,
  buildRecipe,
  canonicalModKey,
  captureProfileState,
  findSaveProfileMismatch,
  parseListingsIndex,
  parseRecipe,
  parseUpdateKeys,
  serializeRecipe,
  type NxmLink,
} from "@sdm/core";
import { fetchJson } from "./services/download.js";
import { BrowserWindow, dialog, ipcMain, app, shell } from "electron";
import type {
  AppInfo,
  AppSettings,
  GameLocation,
  InstallProgress,
  LaunchMode,
  LaunchWarning,
  ProfilesState,
  SavesState,
  ScanResult,
  UpdateInfo,
} from "../shared/types.js";
import { readSettings, writeSettings } from "./services/settings.js";
import { locateGame, locationFromFolder } from "./services/game-locator.js";
import { detectSmapi } from "./services/smapi.js";
import { scanMods } from "./services/mod-scanner.js";
import { setModEnabled } from "./services/mod-toggle.js";
import { checkUpdates } from "./services/update-check.js";
import { installArchive, installFromFile } from "./services/installer.js";
import {
  browseMods,
  downloadToBuffer,
  getModDetail,
  listFiles,
  resolveDownloadUrl,
  validateKey,
} from "./services/nexus-client.js";
import type { NexusBrowseKind, NexusFile } from "@sdm/core";
import {
  createProfile,
  deleteProfile,
  getProfiles,
  renameProfile,
  setActiveProfile,
  setProfileEnabled,
} from "./services/profiles-store.js";
import { applyProfile } from "./services/apply-profile.js";
import { uninstallMod } from "./services/mod-actions.js";
import { launchGame } from "./services/launch.js";
import { installSmapi } from "./services/smapi-installer.js";
import { resolveSourceDownload } from "./services/source-install.js";
import { zipFolder } from "./services/backup.js";
import { backupSaves, listBackups, listSaves, restoreBackup, savesFolder } from "./services/saves.js";
import * as curseforge from "./services/curseforge-client.js";

type GetWindow = () => BrowserWindow | null;

let getWindow: GetWindow = () => null;

function emitProgress(progress: InstallProgress): void {
  getWindow()?.webContents.send("install:progress", progress);
}

/** Resolve the active game location: saved path first, else auto-detect + save. */
async function resolveGame(): Promise<GameLocation | null> {
  const settings = await readSettings();
  if (settings.gamePath) {
    const fromSaved = await locationFromFolder(settings.gamePath);
    if (fromSaved) return { ...fromSaved, source: settings.gameSource ?? "manual" };
  }
  const detected = await locateGame();
  if (detected) await writeSettings({ gamePath: detected.path, gameSource: detected.source });
  return detected;
}

async function scan(): Promise<ScanResult> {
  const game = await resolveGame();
  if (!game) return { game: null, smapi: { installed: false, version: null }, mods: [] };
  const [smapi, mods] = await Promise.all([
    detectSmapi(game.path),
    scanMods(game.modsPath),
  ]);
  return { game, smapi, mods };
}

/** Keep the active profile's enabled set in sync with what is currently on disk. */
async function syncActiveProfile(modsPath: string): Promise<void> {
  const { activeId } = await getProfiles();
  if (!activeId) return;
  const mods = await scanMods(modsPath);
  await setProfileEnabled(
    activeId,
    captureProfileState(mods.map((m) => ({ relativePath: m.relativePath, enabled: m.enabled }))),
  );
}

/** Install an already-downloaded archive: emit progress, sync the active profile. */
async function installBuffer(
  modsPath: string,
  buffer: Uint8Array,
  archiveName: string,
): Promise<void> {
  emitProgress({ phase: "installing", label: archiveName });
  const installed = await installArchive(buffer, { modsPath, archiveName });
  await syncActiveProfile(modsPath);
  emitProgress({
    phase: "done",
    installed: installed.map((m) => ({ installName: m.installName, name: m.name, version: m.version })),
  });
}

/** Choose which file to install: the marked primary, else a MAIN file, else the first. */
function pickPrimaryFile(files: NexusFile[]): NexusFile | null {
  return (
    files.find((f) => f.isPrimary) ??
    files.find((f) => f.category === "MAIN") ??
    files[0] ??
    null
  );
}

/** Build the saves view, refreshing (and persisting) save↔profile associations. */
async function savesState(): Promise<SavesState> {
  const settings = await readSettings();
  const saves = await listSaves();
  const current = settings.saveProfiles ?? {};
  const associated = associateSaves(saves, current, settings.lastModdedLaunch ?? null);
  if (JSON.stringify(associated) !== JSON.stringify(current)) {
    await writeSettings({ saveProfiles: associated });
  }
  return {
    savesPath: savesFolder(),
    saves: saves.map((s) => ({
      folder: s.folder,
      farmName: s.farmName,
      lastModifiedMs: s.lastModifiedMs,
      profileId: associated[s.folder] ?? null,
    })),
    backups: await listBackups(),
  };
}

async function toAppSettings(): Promise<AppSettings> {
  const settings = await readSettings();
  return {
    hasNexusApiKey: !!settings.nexusApiKey,
    nexusUser: settings.nexusUser ?? null,
    hasCurseForgeApiKey: !!settings.curseForgeApiKey,
    modCategories: settings.modCategories ?? {},
    modFolders: settings.modFolders ?? [],
    listingsUrl: settings.listingsUrl ?? "",
  };
}

/** Full download → install flow for an nxm:// link. Emits progress throughout. */
export async function handleNxmLink(link: NxmLink): Promise<void> {
  getWindow()?.focus();
  emitProgress({ phase: "resolving", label: `mod ${link.modId}` });

  const settings = await readSettings();
  if (!settings.nexusApiKey) {
    emitProgress({ phase: "error", error: "Add your Nexus API key in Settings first." });
    return;
  }
  const game = await resolveGame();
  if (!game) {
    emitProgress({ phase: "error", error: "Locate your Stardew Valley folder first." });
    return;
  }

  try {
    const url = await resolveDownloadUrl(settings.nexusApiKey, {
      modId: link.modId,
      fileId: link.fileId,
      key: link.key,
      expires: link.expires,
    });

    let archiveName = `mod-${link.modId}.zip`;
    try {
      const files = await listFiles(settings.nexusApiKey, link.modId);
      const file = files.find((f) => f.fileId === link.fileId);
      if (file?.fileName) archiveName = file.fileName;
    } catch {
      /* filename is a nicety; fall back to a default */
    }

    const buffer = await downloadToBuffer(url, (receivedBytes, totalBytes) =>
      emitProgress({ phase: "downloading", label: archiveName, receivedBytes, totalBytes }),
    );

    emitProgress({ phase: "installing", label: archiveName });
    const installed = await installArchive(buffer, {
      modsPath: game.modsPath,
      archiveName,
    });
    await syncActiveProfile(game.modsPath);
    emitProgress({
      phase: "done",
      installed: installed.map((m) => ({
        installName: m.installName,
        name: m.name,
        version: m.version,
      })),
    });
  } catch (err) {
    emitProgress({ phase: "error", error: (err as Error).message });
  }
}

export function registerIpc(windowGetter: GetWindow): void {
  getWindow = windowGetter;

  ipcMain.handle("app:info", (): AppInfo => ({
    appVersion: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    platform: process.platform,
  }));

  ipcMain.handle("game:locate", (): Promise<GameLocation | null> => resolveGame());

  ipcMain.handle("game:pickFolder", async (event): Promise<GameLocation | null> => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const result = window
      ? await dialog.showOpenDialog(window, { properties: ["openDirectory"] })
      : await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled || result.filePaths.length === 0) return null;

    const location = await locationFromFolder(result.filePaths[0]!);
    if (location) await writeSettings({ gamePath: location.path, gameSource: "manual" });
    return location;
  });

  ipcMain.handle("mods:scan", (): Promise<ScanResult> => scan());

  ipcMain.handle(
    "mods:setEnabled",
    async (_event, relativePath: string, enabled: boolean): Promise<ScanResult> => {
      const game = await resolveGame();
      if (game) {
        await setModEnabled(game.modsPath, relativePath, enabled);
        await syncActiveProfile(game.modsPath);
      }
      return scan();
    },
  );

  ipcMain.handle("mods:checkUpdates", async (): Promise<UpdateInfo[]> => {
    const { mods, smapi } = await scan();
    return checkUpdates(mods, smapi);
  });

  ipcMain.handle("mods:update", async (_event, uniqueId: string): Promise<ScanResult> => {
    const game = await resolveGame();
    if (!game) throw new Error("Locate your Stardew Valley folder first.");
    const mod = (await scanMods(game.modsPath)).find((m) => m.manifest?.uniqueId === uniqueId);
    if (!mod?.manifest) throw new Error("Mod not found.");

    const settings = await readSettings();
    emitProgress({ phase: "resolving", label: mod.manifest.name });
    try {
      const result = await resolveSourceDownload(settings, mod.manifest.updateKeys, (r, t, label) =>
        emitProgress({ phase: "downloading", label, receivedBytes: r, totalBytes: t }),
      );
      if (result.kind === "archive") {
        await installBuffer(game.modsPath, result.buffer, result.archiveName);
      } else if (result.kind === "site") {
        void shell.openExternal(result.url);
        emitProgress({
          phase: "error",
          error: "Free Nexus downloads start on the website — opened the mod page; click Mod Manager Download.",
        });
      } else {
        throw new Error("No supported update source (needs a CurseForge/GitHub key, or Nexus Premium).");
      }
    } catch (err) {
      emitProgress({ phase: "error", error: (err as Error).message });
    }
    return scan();
  });

  ipcMain.handle("mods:uninstall", async (_event, relativePath: string): Promise<ScanResult> => {
    const game = await resolveGame();
    if (game) {
      await uninstallMod(game.modsPath, relativePath);
      await syncActiveProfile(game.modsPath);
    }
    return scan();
  });

  ipcMain.handle("mods:reveal", async (_event, relativePath: string): Promise<void> => {
    const game = await resolveGame();
    if (game) shell.showItemInFolder(join(game.modsPath, relativePath));
  });

  ipcMain.handle("mods:openFolder", async (): Promise<void> => {
    const game = await resolveGame();
    if (game) await shell.openPath(game.modsPath);
  });

  ipcMain.handle("mods:setCategory", async (_event, uniqueId: string, category: string): Promise<AppSettings> => {
    const settings = await readSettings();
    const map = { ...(settings.modCategories ?? {}) };
    const trimmed = category.trim();
    if (trimmed) map[uniqueId] = trimmed;
    else delete map[uniqueId];
    // Ensure a folder mods are dropped into is remembered even if later emptied.
    const folders = trimmed
      ? [...new Set([...(settings.modFolders ?? []), trimmed])]
      : settings.modFolders ?? [];
    await writeSettings({ modCategories: map, modFolders: folders });
    return toAppSettings();
  });

  ipcMain.handle("mods:createFolder", async (_event, name: string): Promise<AppSettings> => {
    const settings = await readSettings();
    const n = name.trim();
    if (n) await writeSettings({ modFolders: [...new Set([...(settings.modFolders ?? []), n])] });
    return toAppSettings();
  });

  ipcMain.handle("mods:renameFolder", async (_event, oldName: string, newName: string): Promise<AppSettings> => {
    const settings = await readSettings();
    const nn = newName.trim();
    if (!nn) return toAppSettings();
    const folders = [...new Set((settings.modFolders ?? []).map((f) => (f === oldName ? nn : f)))];
    const cats = { ...(settings.modCategories ?? {}) };
    for (const id of Object.keys(cats)) if (cats[id] === oldName) cats[id] = nn;
    await writeSettings({ modFolders: folders, modCategories: cats });
    return toAppSettings();
  });

  ipcMain.handle("mods:deleteFolder", async (_event, name: string): Promise<AppSettings> => {
    const settings = await readSettings();
    const folders = (settings.modFolders ?? []).filter((f) => f !== name);
    const cats = { ...(settings.modCategories ?? {}) };
    for (const id of Object.keys(cats)) if (cats[id] === name) delete cats[id];
    await writeSettings({ modFolders: folders, modCategories: cats });
    return toAppSettings();
  });

  ipcMain.handle("settings:get", (): Promise<AppSettings> => toAppSettings());

  ipcMain.handle("settings:setNexusApiKey", async (_event, key: string): Promise<AppSettings> => {
    const trimmed = key.trim();
    const user = trimmed ? await validateKey(trimmed) : null;
    if (trimmed && !user) {
      throw new Error("That Nexus API key was rejected. Check it and try again.");
    }
    await writeSettings({
      nexusApiKey: trimmed || undefined,
      nexusUser: user ?? undefined,
    });
    return toAppSettings();
  });

  ipcMain.handle("settings:setCurseForgeApiKey", async (_event, key: string): Promise<AppSettings> => {
    const trimmed = key.trim();
    // Only block on a genuine auth rejection; save on "unknown" (network/endpoint hiccup).
    if (trimmed && (await curseforge.validateKey(trimmed)) === "invalid") {
      throw new Error("That CurseForge API key was rejected. Check it and try again.");
    }
    await writeSettings({ curseForgeApiKey: trimmed || undefined });
    return toAppSettings();
  });

  ipcMain.handle("store:search", async (_event, query: string) => {
    const { curseForgeApiKey } = await readSettings();
    if (!curseForgeApiKey) throw new Error("Add your CurseForge API key in Settings to search.");
    return curseforge.searchMods(curseForgeApiKey, query);
  });

  ipcMain.handle(
    "store:installCurseforge",
    async (_event, modId: number, fileId: number | null): Promise<ScanResult> => {
      const { curseForgeApiKey } = await readSettings();
      if (!curseForgeApiKey) throw new Error("Add your CurseForge API key in Settings first.");
      const game = await resolveGame();
      if (!game) throw new Error("Locate your Stardew Valley folder first.");

      emitProgress({ phase: "resolving", label: `mod ${modId}` });
      try {
        let resolvedFileId = fileId;
        if (resolvedFileId == null) {
          const files = await curseforge.listFiles(curseForgeApiKey, modId);
          resolvedFileId = files[0]?.fileId ?? null;
        }
        if (resolvedFileId == null) throw new Error("This mod has no downloadable file.");

        const url = await curseforge.resolveDownloadUrl(curseForgeApiKey, modId, resolvedFileId);
        if (!url) {
          throw new Error(
            "The author disabled third-party downloads for this mod. Open it on CurseForge instead.",
          );
        }
        const archiveName = url.split("/").pop() ?? `mod-${modId}.zip`;
        const buffer = await downloadToBuffer(url, (receivedBytes, totalBytes) =>
          emitProgress({ phase: "downloading", label: archiveName, receivedBytes, totalBytes }),
        );

        emitProgress({ phase: "installing", label: archiveName });
        const installed = await installArchive(buffer, { modsPath: game.modsPath, archiveName });
        await syncActiveProfile(game.modsPath);
        emitProgress({
          phase: "done",
          installed: installed.map((m) => ({ installName: m.installName, name: m.name, version: m.version })),
        });
      } catch (err) {
        emitProgress({ phase: "error", error: (err as Error).message });
      }
      return scan();
    },
  );

  ipcMain.handle("mods:installFromFile", async (event): Promise<ScanResult> => {
    const game = await resolveGame();
    if (!game) throw new Error("Locate your Stardew Valley folder first.");

    const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const picker: Electron.OpenDialogOptions = {
      properties: ["openFile"],
      filters: [{ name: "Mod archive", extensions: ["zip"] }],
    };
    const result = window
      ? await dialog.showOpenDialog(window, picker)
      : await dialog.showOpenDialog(picker);
    if (result.canceled || result.filePaths.length === 0) return scan();

    emitProgress({ phase: "installing", label: result.filePaths[0]! });
    try {
      const installed = await installFromFile(result.filePaths[0]!, game.modsPath);
      await syncActiveProfile(game.modsPath);
      emitProgress({
        phase: "done",
        installed: installed.map((m) => ({
          installName: m.installName,
          name: m.name,
          version: m.version,
        })),
      });
    } catch (err) {
      emitProgress({ phase: "error", error: (err as Error).message });
    }
    return scan();
  });

  ipcMain.handle("profiles:list", (): Promise<ProfilesState> => getProfiles());

  ipcMain.handle("profiles:create", async (_event, name: string): Promise<ProfilesState> => {
    const game = await resolveGame();
    const enabled = game
      ? captureProfileState(
          (await scanMods(game.modsPath)).map((m) => ({
            relativePath: m.relativePath,
            enabled: m.enabled,
          })),
        )
      : [];
    return createProfile(name, enabled);
  });

  ipcMain.handle("profiles:rename", (_event, id: string, name: string): Promise<ProfilesState> =>
    renameProfile(id, name),
  );

  ipcMain.handle("profiles:delete", (_event, id: string): Promise<ProfilesState> =>
    deleteProfile(id),
  );

  ipcMain.handle("profiles:activate", async (_event, id: string): Promise<ScanResult> => {
    const state = await setActiveProfile(id);
    const profile = state.profiles.find((p) => p.id === id);
    const game = await resolveGame();
    if (game && profile) await applyProfile(game.modsPath, profile.enabled);
    return scan();
  });

  ipcMain.handle("game:launch", async (_event, mode: LaunchMode): Promise<void> => {
    const game = await resolveGame();
    if (!game) throw new Error("Locate your Stardew Valley folder first.");
    if (mode === "modded") {
      // Safety net: back up saves before a modded launch, and remember the
      // active profile so saves played now get associated with it.
      try {
        await backupSaves("before-launch");
      } catch {
        /* backup is best-effort; never block launch */
      }
      const { activeId } = await getProfiles();
      if (activeId) await writeSettings({ lastModdedLaunch: { profileId: activeId, at: Date.now() } });
    }
    await launchGame(game.path, mode);
  });

  ipcMain.handle("saves:get", (): Promise<SavesState> => savesState());

  ipcMain.handle("saves:setProfile", async (_event, folder: string, profileId: string): Promise<SavesState> => {
    const settings = await readSettings();
    const map = { ...(settings.saveProfiles ?? {}) };
    if (profileId) map[folder] = profileId;
    else delete map[folder];
    await writeSettings({ saveProfiles: map });
    return savesState();
  });

  ipcMain.handle("saves:backup", async (): Promise<SavesState> => {
    await backupSaves("manual");
    return savesState();
  });

  ipcMain.handle("saves:restore", async (_event, id: string): Promise<SavesState> => {
    await restoreBackup(id);
    return savesState();
  });

  ipcMain.handle("launch:warning", async (): Promise<LaunchWarning | null> => {
    const settings = await readSettings();
    const { profiles, activeId } = await getProfiles();
    const saves = await listSaves();
    const mismatch = findSaveProfileMismatch(
      saves.map((s) => ({ folder: s.folder, lastModifiedMs: s.lastModifiedMs })),
      settings.saveProfiles ?? {},
      activeId,
    );
    if (!mismatch) return null;
    const save = saves.find((s) => s.folder === mismatch.folder);
    return {
      saveFarmName: save?.farmName ?? mismatch.folder,
      savedProfileName: profiles.find((p) => p.id === mismatch.savedProfileId)?.name ?? "another profile",
      activeProfileName: profiles.find((p) => p.id === activeId)?.name ?? "the active profile",
    };
  });

  ipcMain.handle("profile:export", async (event): Promise<void> => {
    const game = await resolveGame();
    const mods = game ? await scanMods(game.modsPath) : [];
    const { profiles, activeId } = await getProfiles();
    const active = profiles.find((p) => p.id === activeId);
    const recipe = buildRecipe(
      active?.name ?? "Profile",
      mods.map((m) => ({ manifest: m.manifest, enabled: m.enabled })),
    );

    const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const safeName = (active?.name ?? "profile").replace(/[^a-z0-9-_ ]/gi, "_");
    const options: Electron.SaveDialogOptions = {
      defaultPath: `${safeName}.sdmprofile.json`,
      filters: [{ name: "Shared profile", extensions: ["json"] }],
    };
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return;
    await writeFile(result.filePath, serializeRecipe(recipe), "utf8");
  });

  ipcMain.handle("mods:backup", async (event): Promise<void> => {
    const game = await resolveGame();
    if (!game) throw new Error("Locate your Stardew Valley folder first.");

    const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const stamp = new Date().toISOString().slice(0, 10);
    const options: Electron.SaveDialogOptions = {
      defaultPath: `stardew-mods-backup-${stamp}.zip`,
      filters: [{ name: "Zip archive", extensions: ["zip"] }],
    };
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return;

    emitProgress({ phase: "installing", label: "Zipping your Mods folder…" });
    try {
      const buffer = await zipFolder(game.modsPath);
      await writeFile(result.filePath, buffer);
      shell.showItemInFolder(result.filePath); // reveal the saved zip
      emitProgress({
        phase: "done",
        installed: [{ installName: "Backup", name: `Saved to ${result.filePath}`, version: null }],
      });
    } catch (err) {
      emitProgress({ phase: "error", error: (err as Error).message });
    }
  });

  ipcMain.handle("profile:import", async (event): Promise<ScanResult> => {
    const game = await resolveGame();
    if (!game) throw new Error("Locate your Stardew Valley folder first.");

    const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const options: Electron.OpenDialogOptions = {
      properties: ["openFile"],
      filters: [{ name: "Shared profile", extensions: ["json"] }],
    };
    const picked = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    if (picked.canceled || picked.filePaths.length === 0) return scan();

    let recipe;
    try {
      recipe = parseRecipe(await readFile(picked.filePaths[0]!, "utf8"));
    } catch (err) {
      emitProgress({ phase: "error", error: (err as Error).message });
      return scan();
    }

    const settings = await readSettings();
    const installedIds = new Set(
      (await scanMods(game.modsPath))
        .map((m) => m.manifest?.uniqueId)
        .filter((id): id is string => !!id),
    );

    const failures: string[] = [];
    for (const recipeMod of recipe.mods) {
      if (installedIds.has(recipeMod.uniqueId)) continue;
      emitProgress({ phase: "resolving", label: recipeMod.name });
      try {
        const result = await resolveSourceDownload(
          settings,
          parseUpdateKeys(recipeMod.updateKeys),
          (r, t, label) => emitProgress({ phase: "downloading", label, receivedBytes: r, totalBytes: t }),
        );
        if (result.kind === "archive") {
          emitProgress({ phase: "installing", label: recipeMod.name });
          await installArchive(result.buffer, { modsPath: game.modsPath, archiveName: result.archiveName });
        } else {
          failures.push(recipeMod.name);
        }
      } catch {
        failures.push(recipeMod.name);
      }
    }

    // Build the new profile's enabled set from the recipe, matching by UniqueID.
    const fresh = await scanMods(game.modsPath);
    const wantIds = new Set(recipe.mods.map((m) => m.uniqueId));
    const enabledKeys = fresh
      .filter((m) => m.manifest && wantIds.has(m.manifest.uniqueId))
      .map((m) => canonicalModKey(m.relativePath));
    await createProfile(recipe.name, enabledKeys);
    await applyProfile(game.modsPath, enabledKeys);

    if (failures.length > 0) {
      emitProgress({
        phase: "error",
        error: `Imported "${recipe.name}", but couldn't auto-install: ${failures.join(", ")}. Get those from their source.`,
      });
    } else {
      emitProgress({
        phase: "done",
        installed: [{ installName: recipe.name, name: `Imported ${recipe.mods.length} mods`, version: null }],
      });
    }
    return scan();
  });

  ipcMain.handle("settings:setListingsUrl", async (_event, url: string): Promise<AppSettings> => {
    await writeSettings({ listingsUrl: url.trim() || undefined });
    return toAppSettings();
  });

  ipcMain.handle("listings:fetch", async () => {
    const { listingsUrl } = await readSettings();
    if (!listingsUrl) throw new Error("Add a community listings URL in Settings first.");
    return parseListingsIndex(await fetchJson(listingsUrl, { "user-agent": "StardewModManager" }));
  });

  ipcMain.handle("listings:install", async (_event, githubRepo: string): Promise<ScanResult> => {
    const game = await resolveGame();
    if (!game) throw new Error("Locate your Stardew Valley folder first.");
    const settings = await readSettings();
    emitProgress({ phase: "resolving", label: githubRepo });
    try {
      const result = await resolveSourceDownload(
        settings,
        parseUpdateKeys([`GitHub:${githubRepo}`]),
        (r, t, label) => emitProgress({ phase: "downloading", label, receivedBytes: r, totalBytes: t }),
      );
      if (result.kind === "archive") {
        await installBuffer(game.modsPath, result.buffer, result.archiveName);
      } else {
        throw new Error("No installable GitHub release found for this mod.");
      }
    } catch (err) {
      emitProgress({ phase: "error", error: (err as Error).message });
    }
    return scan();
  });

  ipcMain.handle("smapi:install", async (): Promise<ScanResult> => {
    const game = await resolveGame();
    if (!game) throw new Error("Locate your Stardew Valley folder first.");
    await installSmapi(game.path, (p) => {
      const label = p.version ? `SMAPI ${p.version}` : "SMAPI";
      switch (p.phase) {
        case "checking":
          return emitProgress({ phase: "resolving", label });
        case "downloading":
          return emitProgress({
            phase: "downloading",
            label,
            receivedBytes: p.received,
            totalBytes: p.total,
          });
        case "installing":
          return emitProgress({ phase: "installing", label });
        case "done":
          return emitProgress({
            phase: "done",
            installed: [
              {
                installName: "SMAPI",
                name: p.openedFolder
                  ? "Installer opened — finish it in the SMAPI window"
                  : `SMAPI ${p.installedVersion ?? p.version}`,
                version: p.installedVersion ?? p.version ?? null,
              },
            ],
          });
        case "error":
          return emitProgress({ phase: "error", error: p.error });
      }
    });
    return scan();
  });

  ipcMain.handle("store:browse", async (_event, kind: NexusBrowseKind) => {
    const { nexusApiKey } = await readSettings();
    if (!nexusApiKey) throw new Error("Add your Nexus API key in Settings to browse.");
    return browseMods(nexusApiKey, kind);
  });

  ipcMain.handle("store:mod", async (_event, modId: number) => {
    const { nexusApiKey } = await readSettings();
    if (!nexusApiKey) throw new Error("Add your Nexus API key in Settings to browse.");
    return getModDetail(nexusApiKey, modId);
  });

  ipcMain.handle("store:install", async (_event, modId: number): Promise<ScanResult> => {
    const { nexusApiKey } = await readSettings();
    if (!nexusApiKey) throw new Error("Add your Nexus API key in Settings first.");
    const game = await resolveGame();
    if (!game) throw new Error("Locate your Stardew Valley folder first.");

    emitProgress({ phase: "resolving", label: `mod ${modId}` });
    try {
      const files = await listFiles(nexusApiKey, modId);
      const file = pickPrimaryFile(files);
      if (!file) throw new Error("This mod has no downloadable main file.");

      const url = await resolveDownloadUrl(nexusApiKey, { modId, fileId: file.fileId });
      const archiveName = file.fileName ?? `mod-${modId}.zip`;
      const buffer = await downloadToBuffer(url, (receivedBytes, totalBytes) =>
        emitProgress({ phase: "downloading", label: archiveName, receivedBytes, totalBytes }),
      );

      emitProgress({ phase: "installing", label: archiveName });
      const installed = await installArchive(buffer, { modsPath: game.modsPath, archiveName });
      await syncActiveProfile(game.modsPath);
      emitProgress({
        phase: "done",
        installed: installed.map((m) => ({ installName: m.installName, name: m.name, version: m.version })),
      });
    } catch (err) {
      emitProgress({ phase: "error", error: (err as Error).message });
    }
    return scan();
  });

  // Custom title-bar window controls.
  ipcMain.on("window:minimize", (event) =>
    BrowserWindow.fromWebContents(event.sender)?.minimize(),
  );
  ipcMain.on("window:toggleMaximize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on("window:close", (event) =>
    BrowserWindow.fromWebContents(event.sender)?.close(),
  );
  ipcMain.handle("window:isMaximized", (event): boolean =>
    BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false,
  );
}
