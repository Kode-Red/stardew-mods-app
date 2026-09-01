import type {
  CurseforgeModSummary,
  Manifest,
  NexusBrowseKind,
  NexusModDetail,
  NexusModSummary,
  UpdateStatus,
} from "@sdm/core";

export type { CurseforgeModSummary, NexusBrowseKind, NexusModDetail, NexusModSummary };

/** How a game install was found. */
export type GameSource = "steam" | "gog" | "manual" | "detected";

export interface GameLocation {
  /** Game root folder. */
  path: string;
  /** `<root>/Mods`. */
  modsPath: string;
  source: GameSource;
}

export interface SmapiInfo {
  installed: boolean;
  version: string | null;
}

export interface ScannedMod {
  /** Folder path relative to `Mods/` (may contain a leading-dot segment). */
  relativePath: string;
  /** Leaf folder name as it exists on disk. */
  folderName: string;
  /** Name shown to the user (leading dots stripped). */
  displayName: string;
  enabled: boolean;
  manifest: Manifest | null;
  /** Parse/read error message, or null when the manifest loaded cleanly. */
  error: string | null;
}

export interface ScanResult {
  game: GameLocation | null;
  smapi: SmapiInfo;
  mods: ScannedMod[];
  /** False when the Mods folder can't be modified without elevation (e.g. Program Files). */
  modsWritable: boolean;
}

export interface UpdateInfo {
  uniqueId: string;
  status: UpdateStatus;
  installedVersion: string;
  latestVersion: string | null;
  url: string | null;
  compatibilityStatus: string | null;
  errors: string[];
}

export interface AppInfo {
  appVersion: string;
  electron: string;
  node: string;
  chrome: string;
  platform: string;
}

export interface Profile {
  id: string;
  name: string;
  /** Canonical keys of the mods this profile enables. */
  enabled: string[];
}

export interface ProfilesState {
  profiles: Profile[];
  activeId: string | null;
}

export type LaunchMode = "modded" | "vanilla";

export interface SaveEntryUi {
  folder: string;
  farmName: string;
  lastModifiedMs: number;
  /** Profile id this save is associated with, or null. */
  profileId: string | null;
}

export interface SaveBackupUi {
  id: string;
  createdMs: number;
  label: string | null;
  sizeBytes: number;
}

export interface SavesState {
  savesPath: string;
  saves: SaveEntryUi[];
  backups: SaveBackupUi[];
}

/** Warning shown before a modded launch when the newest save's profile differs. */
export interface LaunchWarning {
  saveFarmName: string;
  savedProfileName: string;
  activeProfileName: string;
}

export interface NexusAccount {
  userId: number;
  name: string;
  isPremium: boolean;
}

export interface AppSettings {
  hasNexusApiKey: boolean;
  nexusUser: NexusAccount | null;
  hasCurseForgeApiKey: boolean;
  /** Mod UniqueID -> folder/category name. */
  modCategories: Record<string, string>;
  /** User-created folder names (may contain no mods). */
  modFolders: string[];
  /** URL of a community listings index, or "" if unset. */
  listingsUrl: string;
}

export interface ModListingUi {
  name: string;
  author: string | null;
  summary: string | null;
  githubRepo: string;
  imageUrl: string | null;
  category: string | null;
}

export interface InstalledModSummary {
  installName: string;
  name: string | null;
  version: string | null;
}

/** Progress event for a download+install, pushed from main to the renderer. */
export interface InstallProgress {
  phase: "resolving" | "downloading" | "installing" | "done" | "error";
  /** Human-readable label (mod/file name) for the active operation. */
  label?: string;
  receivedBytes?: number;
  totalBytes?: number | null;
  installed?: InstalledModSummary[];
  error?: string;
}

/** The full surface exposed to the renderer as `window.api`. */
export interface DesktopApi {
  getInfo(): Promise<AppInfo>;
  locateGame(): Promise<GameLocation | null>;
  pickGameFolder(): Promise<GameLocation | null>;
  scanMods(): Promise<ScanResult>;
  setModEnabled(relativePath: string, enabled: boolean): Promise<ScanResult>;
  checkUpdates(): Promise<UpdateInfo[]>;
  /** Download + install the newer version of a mod via its update key. */
  updateMod(uniqueId: string): Promise<ScanResult>;
  /** Delete a mod's folder, then return the fresh scan. */
  uninstallMod(relativePath: string): Promise<ScanResult>;
  /** Highlight a mod's folder in the OS file manager. */
  revealMod(relativePath: string): Promise<void>;
  /** Open the game's Mods/ folder in the OS file manager. */
  openModsFolder(): Promise<void>;
  /** Assign a mod (by UniqueID) to a folder/category; empty string clears it. */
  setModCategory(uniqueId: string, category: string): Promise<AppSettings>;
  createFolder(name: string): Promise<AppSettings>;
  renameFolder(oldName: string, newName: string): Promise<AppSettings>;
  deleteFolder(name: string): Promise<AppSettings>;

  getSettings(): Promise<AppSettings>;
  /** Validate + store a Nexus personal API key. Returns updated settings. */
  setNexusApiKey(key: string): Promise<AppSettings>;
  /** Validate + store a CurseForge API key. Returns updated settings. */
  setCurseForgeApiKey(key: string): Promise<AppSettings>;
  /** Open a file picker and install the chosen archive. Returns the fresh scan. */
  installFromFile(): Promise<ScanResult>;
  /** Subscribe to download/install progress. Returns an unsubscribe function. */
  onInstallProgress(callback: (progress: InstallProgress) => void): () => void;

  listProfiles(): Promise<ProfilesState>;
  createProfile(name: string): Promise<ProfilesState>;
  renameProfile(id: string, name: string): Promise<ProfilesState>;
  deleteProfile(id: string): Promise<ProfilesState>;
  /** Switch profiles: reconcile disk to the profile, then return the fresh scan. */
  activateProfile(id: string): Promise<ScanResult>;

  /** List saves + backups, refreshing save↔profile associations. */
  getSaves(): Promise<SavesState>;
  /** Assign a save to a profile (empty string clears it). */
  setSaveProfile(folder: string, profileId: string): Promise<SavesState>;
  /** Manually back up the whole Saves folder now. */
  backupSaves(): Promise<SavesState>;
  restoreSaveBackup(id: string): Promise<SavesState>;
  /** Check whether launching modded now risks a save/profile mismatch. */
  getLaunchWarning(): Promise<LaunchWarning | null>;

  /** Save the active profile as a shareable recipe file (a modpack, not the mod files). */
  exportProfile(): Promise<void>;
  /** Import a shared recipe: install missing mods from their sources, build the profile. */
  importProfile(): Promise<ScanResult>;
  /** Zip the whole Mods/ folder to a file (personal backup / moving machines). */
  backupMods(): Promise<void>;
  launchGame(mode: LaunchMode): Promise<void>;

  /** Browse a Nexus list (trending / latest added / latest updated). */
  browseStore(kind: NexusBrowseKind): Promise<NexusModSummary[]>;
  getStoreMod(modId: number): Promise<NexusModDetail | null>;
  /** Download + install a mod's primary file from Nexus (premium accounts). */
  installStoreMod(modId: number): Promise<ScanResult>;

  /** Search CurseForge for Stardew mods. */
  searchStore(query: string): Promise<CurseforgeModSummary[]>;
  /** Download + install a CurseForge mod's file (respects the distribution toggle). */
  installCurseforgeMod(modId: number, fileId: number | null): Promise<ScanResult>;

  /** Download + run the official SMAPI installer, then rescan. */
  installSmapi(): Promise<ScanResult>;

  setListingsUrl(url: string): Promise<AppSettings>;
  /** Fetch the community listings index (metadata only; files stay on GitHub). */
  fetchListings(): Promise<ModListingUi[]>;
  /** Install a listed mod from its GitHub release, then rescan. */
  installListing(githubRepo: string): Promise<ScanResult>;

  /** Relaunch the app with administrator rights (Windows). The app quits and restarts. */
  relaunchElevated(): void;

  window: WindowControls;
}

export interface WindowControls {
  minimize(): void;
  toggleMaximize(): void;
  close(): void;
  isMaximized(): Promise<boolean>;
  onMaximizedChange(callback: (maximized: boolean) => void): () => void;
}
