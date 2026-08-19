import { BrowserWindow, dialog, ipcMain, app } from "electron";
import { captureProfileState, type NxmLink } from "@sdm/core";
import type {
  AppInfo,
  AppSettings,
  GameLocation,
  InstallProgress,
  LaunchMode,
  ProfilesState,
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
  downloadToBuffer,
  listFiles,
  resolveDownloadUrl,
  validateKey,
} from "./services/nexus-client.js";
import {
  createProfile,
  deleteProfile,
  getProfiles,
  renameProfile,
  setActiveProfile,
  setProfileEnabled,
} from "./services/profiles-store.js";
import { applyProfile } from "./services/apply-profile.js";
import { launchGame } from "./services/launch.js";

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

async function toAppSettings(): Promise<AppSettings> {
  const settings = await readSettings();
  return {
    hasNexusApiKey: !!settings.nexusApiKey,
    nexusUser: settings.nexusUser ?? null,
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
    await launchGame(game.path, mode);
  });
}
