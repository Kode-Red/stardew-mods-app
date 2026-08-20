import { join } from "node:path";
import { BrowserWindow, dialog, ipcMain, app, shell } from "electron";
import {
  captureProfileState,
  githubLatestReleaseUrl,
  parseGithubRelease,
  pickReleaseModAsset,
  type NxmLink,
} from "@sdm/core";
import { fetchJson } from "./services/download.js";
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

const GITHUB_UA = { "user-agent": "StardewModManager" };

/** Download an archive and install it, emitting progress and syncing the profile. */
async function downloadAndInstall(
  modsPath: string,
  url: string,
  archiveName: string,
  headers?: Record<string, string>,
): Promise<void> {
  const buffer = await downloadToBuffer(
    url,
    (receivedBytes, totalBytes) =>
      emitProgress({ phase: "downloading", label: archiveName, receivedBytes, totalBytes }),
    headers,
  );
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

async function toAppSettings(): Promise<AppSettings> {
  const settings = await readSettings();
  return {
    hasNexusApiKey: !!settings.nexusApiKey,
    nexusUser: settings.nexusUser ?? null,
    hasCurseForgeApiKey: !!settings.curseForgeApiKey,
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
    const keys = mod.manifest.updateKeys;
    const cf = keys.find((k) => k.site === "CurseForge");
    const gh = keys.find((k) => k.site === "GitHub");
    const nx = keys.find((k) => k.site === "Nexus");

    emitProgress({ phase: "resolving", label: mod.manifest.name });
    try {
      if (cf && settings.curseForgeApiKey) {
        const modId = Number(cf.id);
        const files = await curseforge.listFiles(settings.curseForgeApiKey, modId);
        const fileId = files[0]?.fileId;
        if (fileId == null) throw new Error("No CurseForge file found for this mod.");
        const url = await curseforge.resolveDownloadUrl(settings.curseForgeApiKey, modId, fileId);
        if (!url) throw new Error("The author disabled CurseForge third-party downloads.");
        await downloadAndInstall(game.modsPath, url, url.split("/").pop() ?? `${uniqueId}.zip`);
      } else if (gh) {
        const release = parseGithubRelease(await fetchJson(githubLatestReleaseUrl(gh.id), GITHUB_UA));
        const asset = release ? pickReleaseModAsset(release) : null;
        if (!asset) throw new Error("No downloadable asset in the latest GitHub release.");
        await downloadAndInstall(game.modsPath, asset.url, asset.name, GITHUB_UA);
      } else if (nx && settings.nexusApiKey && settings.nexusUser?.isPremium) {
        const modId = Number(nx.id);
        const file = pickPrimaryFile(await listFiles(settings.nexusApiKey, modId));
        if (!file) throw new Error("No Nexus file found for this mod.");
        const url = await resolveDownloadUrl(settings.nexusApiKey, { modId, fileId: file.fileId });
        await downloadAndInstall(game.modsPath, url, file.fileName ?? `mod-${modId}.zip`);
      } else if (nx) {
        void shell.openExternal(`https://www.nexusmods.com/stardewvalley/mods/${nx.id}`);
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
    if (trimmed && !(await curseforge.validateKey(trimmed))) {
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
    await launchGame(game.path, mode);
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
