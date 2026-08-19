import { computed, reactive } from "vue";
import type {
  AppSettings,
  DesktopApi,
  InstallProgress,
  LaunchMode,
  ProfilesState,
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
  progress: InstallProgress | null;
  loading: boolean;
  checking: boolean;
  launching: boolean;
  error: string | null;
  profilesOpen: boolean;
}

const state = reactive<State>({
  scan: null,
  updates: new Map(),
  settings: null,
  profiles: { profiles: [], activeId: null },
  progress: null,
  loading: false,
  checking: false,
  launching: false,
  error: null,
  profilesOpen: false,
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

async function launch(mode: LaunchMode): Promise<void> {
  if (!api) return;
  state.launching = true;
  await withError(() => api.launchGame(mode));
  state.launching = false;
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
    init,
    dispose,
    refresh,
    toggle,
    pickFolder,
    installFromFile,
    checkUpdates,
    saveNexusKey,
    activateProfile,
    createProfile,
    renameProfile,
    deleteProfile,
    launch,
  };
}
