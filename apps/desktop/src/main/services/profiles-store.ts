import { randomUUID } from "node:crypto";
import type { Profile, ProfilesState } from "../../shared/types.js";
import { readSettings, writeSettings } from "./settings.js";

/** Load profiles, creating a "Default Profile" the first time. */
export async function getProfiles(): Promise<ProfilesState> {
  const settings = await readSettings();
  let profiles = settings.profiles ?? [];
  let activeId = settings.activeProfileId ?? null;

  if (profiles.length === 0) {
    const def: Profile = { id: randomUUID(), name: "Default Profile", enabled: [] };
    profiles = [def];
    activeId = def.id;
    await writeSettings({ profiles, activeProfileId: activeId });
  } else if (!activeId || !profiles.some((p) => p.id === activeId)) {
    activeId = profiles[0]!.id;
    await writeSettings({ activeProfileId: activeId });
  }

  return { profiles, activeId };
}

async function save(profiles: Profile[], activeId: string): Promise<ProfilesState> {
  await writeSettings({ profiles, activeProfileId: activeId });
  return { profiles, activeId };
}

export async function createProfile(name: string, enabled: string[] = []): Promise<ProfilesState> {
  const { profiles } = await getProfiles();
  const profile: Profile = { id: randomUUID(), name: name.trim() || "New Profile", enabled };
  return save([...profiles, profile], profile.id);
}

export async function renameProfile(id: string, name: string): Promise<ProfilesState> {
  const { profiles, activeId } = await getProfiles();
  const next = profiles.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p));
  return save(next, activeId!);
}

export async function deleteProfile(id: string): Promise<ProfilesState> {
  const { profiles, activeId } = await getProfiles();
  if (profiles.length <= 1) return { profiles, activeId }; // keep at least one
  const next = profiles.filter((p) => p.id !== id);
  const nextActive = activeId === id ? next[0]!.id : activeId!;
  return save(next, nextActive);
}

export async function setActiveProfile(id: string): Promise<ProfilesState> {
  const { profiles } = await getProfiles();
  if (!profiles.some((p) => p.id === id)) return getProfiles();
  return save(profiles, id);
}

/** Overwrite a profile's enabled set (used to keep the active profile synced to disk). */
export async function setProfileEnabled(id: string, enabled: string[]): Promise<ProfilesState> {
  const { profiles, activeId } = await getProfiles();
  const next = profiles.map((p) => (p.id === id ? { ...p, enabled } : p));
  return save(next, activeId!);
}
