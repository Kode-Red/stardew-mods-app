import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  AppInfo,
  AppSettings,
  CurseforgeModSummary,
  DesktopApi,
  GameLocation,
  InstallProgress,
  LaunchMode,
  NexusBrowseKind,
  NexusModDetail,
  NexusModSummary,
  ProfilesState,
  ScanResult,
  UpdateInfo,
} from "../shared/types.js";

/** The typed surface exposed to the renderer as `window.api`. */
const api: DesktopApi = {
  getInfo: (): Promise<AppInfo> => ipcRenderer.invoke("app:info"),
  locateGame: (): Promise<GameLocation | null> => ipcRenderer.invoke("game:locate"),
  pickGameFolder: (): Promise<GameLocation | null> =>
    ipcRenderer.invoke("game:pickFolder"),
  scanMods: (): Promise<ScanResult> => ipcRenderer.invoke("mods:scan"),
  setModEnabled: (relativePath: string, enabled: boolean): Promise<ScanResult> =>
    ipcRenderer.invoke("mods:setEnabled", relativePath, enabled),
  checkUpdates: (): Promise<UpdateInfo[]> => ipcRenderer.invoke("mods:checkUpdates"),
  updateMod: (uniqueId: string): Promise<ScanResult> =>
    ipcRenderer.invoke("mods:update", uniqueId),
  uninstallMod: (relativePath: string): Promise<ScanResult> =>
    ipcRenderer.invoke("mods:uninstall", relativePath),
  revealMod: (relativePath: string): Promise<void> =>
    ipcRenderer.invoke("mods:reveal", relativePath),
  openModsFolder: (): Promise<void> => ipcRenderer.invoke("mods:openFolder"),

  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
  setNexusApiKey: (key: string): Promise<AppSettings> =>
    ipcRenderer.invoke("settings:setNexusApiKey", key),
  setCurseForgeApiKey: (key: string): Promise<AppSettings> =>
    ipcRenderer.invoke("settings:setCurseForgeApiKey", key),
  installFromFile: (): Promise<ScanResult> => ipcRenderer.invoke("mods:installFromFile"),
  onInstallProgress: (callback: (progress: InstallProgress) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, progress: InstallProgress): void =>
      callback(progress);
    ipcRenderer.on("install:progress", listener);
    return () => ipcRenderer.removeListener("install:progress", listener);
  },

  listProfiles: (): Promise<ProfilesState> => ipcRenderer.invoke("profiles:list"),
  createProfile: (name: string): Promise<ProfilesState> =>
    ipcRenderer.invoke("profiles:create", name),
  renameProfile: (id: string, name: string): Promise<ProfilesState> =>
    ipcRenderer.invoke("profiles:rename", id, name),
  deleteProfile: (id: string): Promise<ProfilesState> =>
    ipcRenderer.invoke("profiles:delete", id),
  activateProfile: (id: string): Promise<ScanResult> =>
    ipcRenderer.invoke("profiles:activate", id),
  launchGame: (mode: LaunchMode): Promise<void> => ipcRenderer.invoke("game:launch", mode),

  browseStore: (kind: NexusBrowseKind): Promise<NexusModSummary[]> =>
    ipcRenderer.invoke("store:browse", kind),
  getStoreMod: (modId: number): Promise<NexusModDetail | null> =>
    ipcRenderer.invoke("store:mod", modId),
  installStoreMod: (modId: number): Promise<ScanResult> =>
    ipcRenderer.invoke("store:install", modId),
  searchStore: (query: string): Promise<CurseforgeModSummary[]> =>
    ipcRenderer.invoke("store:search", query),
  installCurseforgeMod: (modId: number, fileId: number | null): Promise<ScanResult> =>
    ipcRenderer.invoke("store:installCurseforge", modId, fileId),
  installSmapi: (): Promise<ScanResult> => ipcRenderer.invoke("smapi:install"),

  window: {
    minimize: (): void => ipcRenderer.send("window:minimize"),
    toggleMaximize: (): void => ipcRenderer.send("window:toggleMaximize"),
    close: (): void => ipcRenderer.send("window:close"),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke("window:isMaximized"),
    onMaximizedChange: (callback: (maximized: boolean) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, maximized: boolean): void =>
        callback(maximized);
      ipcRenderer.on("window:maximized", listener);
      return () => ipcRenderer.removeListener("window:maximized", listener);
    },
  },
};

export type PreloadApi = DesktopApi;

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error("Failed to expose preload API:", error);
  }
} else {
  (globalThis as unknown as { api: DesktopApi }).api = api;
}
