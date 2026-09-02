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
  setModCategory: (uniqueId: string, category: string): Promise<AppSettings> =>
    ipcRenderer.invoke("mods:setCategory", uniqueId, category),
  createFolder: (name: string): Promise<AppSettings> => ipcRenderer.invoke("mods:createFolder", name),
  renameFolder: (oldName: string, newName: string): Promise<AppSettings> =>
    ipcRenderer.invoke("mods:renameFolder", oldName, newName),
  deleteFolder: (name: string): Promise<AppSettings> => ipcRenderer.invoke("mods:deleteFolder", name),

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
  getSaves: (): Promise<import("../shared/types.js").SavesState> => ipcRenderer.invoke("saves:get"),
  setSaveProfile: (folder: string, profileId: string): Promise<import("../shared/types.js").SavesState> =>
    ipcRenderer.invoke("saves:setProfile", folder, profileId),
  backupSaves: (): Promise<import("../shared/types.js").SavesState> => ipcRenderer.invoke("saves:backup"),
  restoreSaveBackup: (id: string): Promise<import("../shared/types.js").SavesState> =>
    ipcRenderer.invoke("saves:restore", id),
  getLaunchWarning: (): Promise<import("../shared/types.js").LaunchWarning | null> =>
    ipcRenderer.invoke("launch:warning"),
  exportProfile: (): Promise<void> => ipcRenderer.invoke("profile:export"),
  importProfile: (): Promise<ScanResult> => ipcRenderer.invoke("profile:import"),
  backupMods: (): Promise<void> => ipcRenderer.invoke("mods:backup"),
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
  setListingsUrl: (url: string): Promise<AppSettings> =>
    ipcRenderer.invoke("settings:setListingsUrl", url),
  fetchListings: (): Promise<import("../shared/types.js").ModListingUi[]> =>
    ipcRenderer.invoke("listings:fetch"),
  installListing: (githubRepo: string): Promise<ScanResult> =>
    ipcRenderer.invoke("listings:install", githubRepo),

  relaunchElevated: (): void => ipcRenderer.send("app:relaunchElevated"),

  checkAppUpdate: (): Promise<void> => ipcRenderer.invoke("updates:check"),
  installAppUpdate: (): void => ipcRenderer.send("updates:install"),
  onAppUpdateStatus: (
    callback: (status: import("../shared/types.js").AppUpdateStatus) => void,
  ): (() => void) => {
    const listener = (_e: IpcRendererEvent, status: import("../shared/types.js").AppUpdateStatus): void =>
      callback(status);
    ipcRenderer.on("app-update:status", listener);
    return () => ipcRenderer.removeListener("app-update:status", listener);
  },

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
