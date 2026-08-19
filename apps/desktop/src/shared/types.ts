import type { Manifest, UpdateStatus } from "@sdm/core";

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

export interface NexusAccount {
  userId: number;
  name: string;
  isPremium: boolean;
}

export interface AppSettings {
  hasNexusApiKey: boolean;
  nexusUser: NexusAccount | null;
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

  getSettings(): Promise<AppSettings>;
  /** Validate + store a Nexus personal API key. Returns updated settings. */
  setNexusApiKey(key: string): Promise<AppSettings>;
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
  launchGame(mode: LaunchMode): Promise<void>;
}
