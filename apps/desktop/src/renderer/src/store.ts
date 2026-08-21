import { computed, reactive } from "vue";
import { conflictCount, detectConflicts } from "@sdm/core";
import type {
  AppInfo,
  AppSettings,
  CurseforgeModSummary,
  DesktopApi,
  ModListingUi,
  InstallProgress,
  LaunchMode,
  LaunchWarning,
  NexusBrowseKind,
  NexusModDetail,
  NexusModSummary,
  ProfilesState,
  SavesState,
  ScannedMod,
  ScanResult,
  UpdateInfo,
} from "../../shared/types";

const api = (window as unknown as { api?: DesktopApi }).api;
export const isElectron = !!api;

interface State {
  scan: ScanResult | null;
  updates: Map<string, UpdateInfo>;
  settings: AppSettings | null;
  profiles: ProfilesState;
  info: AppInfo | null;
  progress: InstallProgress | null;
  loading: boolean;
  checking: boolean;
  launching: boolean;
  error: string | null;
  profilesOpen: boolean;
  setupOpen: boolean;
}

const state = reactive<State>({
  scan: null,
  updates: new Map(),
  settings: null,
  profiles: { profiles: [], activeId: null },
  info: null,
  progress: null,
  loading: false,
  checking: false,
  launching: false,
  error: null,
  profilesOpen: false,
  setupOpen: false,
});

const game = computed(() => state.scan?.game ?? null);
const smapi = computed(() => state.scan?.smapi ?? null);
const mods = computed(() => state.scan?.mods ?? []);
const enabledCount = computed(() => mods.value.filter((m) => m.enabled).length);
const updatableCount = computed(
  () => [...state.updates.values()].filter((u) => u.status === "update-available").length,
);
const activeProfile = computed(
  () => state.profiles.profiles.find((p) => p.id === state.profiles.activeId) ?? null,
);
const conflicts = computed(() =>
  detectConflicts(
    mods.value.map((m) => ({ folderName: m.folderName, manifest: m.manifest, enabled: m.enabled })),
  ),
);
const conflictTotal = computed(() => conflictCount(conflicts.value));

function withError<T>(fn: () => Promise<T>): Promise<T | undefined> {
  state.error = null;
  return fn().catch((err: unknown) => {
    state.error = (err as Error).message;
    return undefined;
  });
}

async function refresh(): Promise<void> {
  if (!api) return;
  state.loading = true;
  await withError(async () => {
    state.scan = await api.scanMods();
  });
  state.loading = false;
}

async function loadProfiles(): Promise<void> {
  if (!api) return;
  await withError(async () => {
    state.profiles = await api.listProfiles();
  });
}

async function loadSettings(): Promise<void> {
  if (!api) return;
  await withError(async () => {
    state.settings = await api.getSettings();
  });
}

let unsubscribe: (() => void) | undefined;

async function init(): Promise<void> {
  if (!api) return;
  void api.getInfo().then((info) => (state.info = info)).catch(() => undefined);
  await Promise.all([refresh(), loadSettings(), loadProfiles()]);
  unsubscribe ??= api.onInstallProgress((p) => {
    state.progress = p;
    if (p.phase === "done") void refresh();
  });
}

function dispose(): void {
  unsubscribe?.();
  unsubscribe = undefined;
}

async function toggle(mod: ScannedMod): Promise<void> {
  if (!api) return;
  await withError(async () => {
    state.scan = await api.setModEnabled(mod.relativePath, !mod.enabled);
    await loadProfiles();
  });
}

async function pickFolder(): Promise<void> {
  if (!api) return;
  const location = await api.pickGameFolder();
  if (location) await refresh();
}

async function installFromFile(): Promise<void> {
  if (!api) return;
  await withError(async () => {
    state.scan = await api.installFromFile();
    await loadProfiles();
  });
}

async function checkUpdates(): Promise<void> {
  if (!api) return;
  state.checking = true;
  await withError(async () => {
    const results = await api.checkUpdates();
    state.updates = new Map(results.map((r) => [r.uniqueId, r]));
  });
  state.checking = false;
}

async function updateMod(uniqueId: string): Promise<void> {
  if (!api) return;
  await withError(async () => {
    state.scan = await api.updateMod(uniqueId);
    await loadProfiles();
  });
  // Re-check so the just-updated mod's badge refreshes.
  await checkUpdates();
}

async function updateAllMods(): Promise<void> {
  const outdated = [...state.updates.values()].filter((u) => u.status === "update-available");
  for (const u of outdated) {
    if (!api) break;
    await withError(async () => {
      state.scan = await api.updateMod(u.uniqueId);
    });
  }
  await loadProfiles();
  await checkUpdates();
}

async function uninstallMod(relativePath: string): Promise<void> {
  if (!api) return;
  await withError(async () => {
    state.scan = await api.uninstallMod(relativePath);
    await loadProfiles();
  });
}

function revealMod(relativePath: string): void {
  void api?.revealMod(relativePath);
}

function openModsFolder(): void {
  void api?.openModsFolder();
}

async function setModCategory(uniqueId: string, category: string): Promise<void> {
  if (!api) return;
  await withError(async () => {
    state.settings = await api.setModCategory(uniqueId, category);
  });
}

async function createFolder(name: string): Promise<void> {
  if (!api) return;
  await withError(async () => {
    state.settings = await api.createFolder(name);
  });
}

async function renameFolder(oldName: string, newName: string): Promise<void> {
  if (!api) return;
  await withError(async () => {
    state.settings = await api.renameFolder(oldName, newName);
  });
}

async function deleteFolder(name: string): Promise<void> {
  if (!api) return;
  await withError(async () => {
    state.settings = await api.deleteFolder(name);
  });
}

async function saveNexusKey(key: string): Promise<boolean> {
  if (!api) return false;
  const result = await withError(async () => {
    state.settings = await api.setNexusApiKey(key);
    return state.settings.hasNexusApiKey;
  });
  return result ?? false;
}

async function activateProfile(id: string): Promise<void> {
  if (!api || id === state.profiles.activeId) return;
  await withError(async () => {
    state.scan = await api.activateProfile(id);
    await loadProfiles();
    state.updates = new Map();
  });
}

async function createProfile(name: string): Promise<void> {
  if (!api) return;
  await withError(async () => {
    state.profiles = await api.createProfile(name);
  });
}

async function renameProfile(id: string, name: string): Promise<void> {
  if (!api) return;
  await withError(async () => {
    state.profiles = await api.renameProfile(id, name);
  });
}

async function deleteProfile(id: string): Promise<void> {
  if (!api) return;
  await withError(async () => {
    state.profiles = await api.deleteProfile(id);
  });
}

async function exportProfile(): Promise<void> {
  if (!api) return;
  await withError(() => api.exportProfile());
}

async function importProfile(): Promise<void> {
  if (!api) return;
  await withError(async () => {
    state.scan = await api.importProfile();
    await loadProfiles();
    state.updates = new Map();
  });
}

async function backupMods(): Promise<void> {
  if (!api) return;
  await withError(() => api.backupMods());
}

async function launch(mode: LaunchMode): Promise<void> {
  if (!api) return;
  state.launching = true;
  await withError(() => api.launchGame(mode));
  state.launching = false;
}

async function launchWarning(): Promise<LaunchWarning | null> {
  if (!api) return null;
  return (await withError(() => api.getLaunchWarning())) ?? null;
}

const EMPTY_SAVES: SavesState = { savesPath: "", saves: [], backups: [] };
async function getSaves(): Promise<SavesState> {
  if (!api) return EMPTY_SAVES;
  return (await withError(() => api.getSaves())) ?? EMPTY_SAVES;
}
async function setSaveProfile(folder: string, profileId: string): Promise<SavesState> {
  if (!api) return EMPTY_SAVES;
  return (await withError(() => api.setSaveProfile(folder, profileId))) ?? EMPTY_SAVES;
}
async function backupSavesNow(): Promise<SavesState> {
  if (!api) return EMPTY_SAVES;
  return (await withError(() => api.backupSaves())) ?? EMPTY_SAVES;
}
async function restoreSaveBackup(id: string): Promise<SavesState> {
  if (!api) return EMPTY_SAVES;
  return (await withError(() => api.restoreSaveBackup(id))) ?? EMPTY_SAVES;
}

async function browseStore(kind: NexusBrowseKind): Promise<NexusModSummary[]> {
  if (!api) return [];
  return (await withError(() => api.browseStore(kind))) ?? [];
}

async function getStoreMod(modId: number): Promise<NexusModDetail | null> {
  if (!api) return null;
  return (await withError(() => api.getStoreMod(modId))) ?? null;
}

async function installStoreMod(modId: number): Promise<void> {
  if (!api) return;
  await withError(async () => {
    state.scan = await api.installStoreMod(modId);
    await loadProfiles();
  });
}

async function installSmapi(): Promise<void> {
  if (!api) return;
  await withError(async () => {
    state.scan = await api.installSmapi();
  });
}

async function saveListingsUrl(url: string): Promise<void> {
  if (!api) return;
  await withError(async () => {
    state.settings = await api.setListingsUrl(url);
  });
}

async function fetchListings(): Promise<ModListingUi[]> {
  if (!api) return [];
  return (await withError(() => api.fetchListings())) ?? [];
}

async function installListing(githubRepo: string): Promise<void> {
  if (!api) return;
  await withError(async () => {
    state.scan = await api.installListing(githubRepo);
    await loadProfiles();
  });
}

async function saveCurseForgeKey(key: string): Promise<boolean> {
  if (!api) return false;
  const result = await withError(async () => {
    state.settings = await api.setCurseForgeApiKey(key);
    return state.settings.hasCurseForgeApiKey;
  });
  return result ?? false;
}

async function searchStore(query: string): Promise<CurseforgeModSummary[]> {
  if (!api) return [];
  return (await withError(() => api.searchStore(query))) ?? [];
}

async function installCurseforgeMod(modId: number, fileId: number | null): Promise<void> {
  if (!api) return;
  await withError(async () => {
    state.scan = await api.installCurseforgeMod(modId, fileId);
    await loadProfiles();
  });
}

export function useStore() {
  return {
    state,
    isElectron,
    game,
    smapi,
    mods,
    enabledCount,
    updatableCount,
    activeProfile,
    conflicts,
    conflictTotal,
    init,
    dispose,
    refresh,
    toggle,
    pickFolder,
    installFromFile,
    checkUpdates,
    updateMod,
    updateAllMods,
    uninstallMod,
    revealMod,
    openModsFolder,
    setModCategory,
    createFolder,
    renameFolder,
    deleteFolder,
    saveNexusKey,
    activateProfile,
    createProfile,
    renameProfile,
    deleteProfile,
    exportProfile,
    importProfile,
    backupMods,
    launch,
    launchWarning,
    getSaves,
    setSaveProfile,
    backupSavesNow,
    restoreSaveBackup,
    browseStore,
    getStoreMod,
    installStoreMod,
    installSmapi,
    saveListingsUrl,
    fetchListings,
    installListing,
    saveCurseForgeKey,
    searchStore,
    installCurseforgeMod,
  };
}
