<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { SavesState } from "../../../shared/types";
import { isElectron, useStore } from "../store";

const store = useStore();
const state = ref<SavesState>({ savesPath: "", saves: [], backups: [] });
const loading = ref(false);
const backing = ref(false);
const pendingRestore = ref<string | null>(null);

const profiles = computed(() => store.state.profiles.profiles);
function profileName(id: string | null): string {
  return profiles.value.find((p) => p.id === id)?.name ?? "";
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
function fmtSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function load(): Promise<void> {
  if (!isElectron) return;
  loading.value = true;
  state.value = await store.getSaves();
  loading.value = false;
}
async function backupNow(): Promise<void> {
  backing.value = true;
  state.value = await store.backupSavesNow();
  backing.value = false;
}
async function assign(folder: string, profileId: string): Promise<void> {
  state.value = await store.setSaveProfile(folder, profileId);
}
async function confirmRestore(): Promise<void> {
  if (pendingRestore.value) state.value = await store.restoreSaveBackup(pendingRestore.value);
  pendingRestore.value = null;
}

function saveMenu(folder: string) {
  return [
    [
      ...profiles.value.map((p) => ({ label: p.name, icon: "i-lucide-user", onSelect: () => assign(folder, p.id) })),
      { label: "None", icon: "i-lucide-x", onSelect: () => assign(folder, "") },
    ],
  ];
}

onMounted(load);
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Saves</h1>
        <p class="text-sm text-muted">Back up before you play, and keep each save on its own profile.</p>
      </div>
      <div class="flex items-center gap-2">
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="subtle" :loading="loading" :disabled="!isElectron" @click="load">Refresh</UButton>
        <UButton icon="i-lucide-archive" color="primary" :loading="backing" :disabled="!isElectron" @click="backupNow">Back up now</UButton>
      </div>
    </div>

    <UAlert
      icon="i-lucide-shield-check"
      color="neutral"
      variant="soft"
      title="Automatic protection"
      description="Your saves are backed up automatically right before every modded launch, and each save is tagged with the profile it was played on. If you try to launch with a different profile, you'll get a warning first."
    />

    <!-- Saves -->
    <div>
      <h2 class="mb-2 px-1 text-sm font-medium text-muted">Saves</h2>
      <div v-if="state.saves.length" class="overflow-hidden rounded-xl border border-default">
        <div v-for="save in state.saves" :key="save.folder" class="flex items-center gap-4 border-b border-default px-4 py-3 last:border-b-0">
          <UIcon name="i-lucide-sprout" class="size-5 shrink-0 text-primary" />
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium">{{ save.farmName }} Farm</p>
            <p class="text-xs text-muted">last played {{ fmtDate(save.lastModifiedMs) }}</p>
          </div>
          <UDropdownMenu :items="saveMenu(save.folder)">
            <UButton color="neutral" variant="subtle" size="sm" trailing-icon="i-lucide-chevron-down">
              <UIcon name="i-lucide-users" class="size-4" />
              {{ save.profileId ? profileName(save.profileId) : "Assign profile" }}
            </UButton>
          </UDropdownMenu>
        </div>
      </div>
      <div v-else class="rounded-xl border border-default py-8 text-center text-sm text-muted">
        {{ isElectron ? "No saves found yet." : "Saves appear when running in the app." }}
      </div>
    </div>

    <!-- Backups -->
    <div>
      <h2 class="mb-2 px-1 text-sm font-medium text-muted">Backups <span class="text-dimmed">(latest 10 kept)</span></h2>
      <div v-if="state.backups.length" class="overflow-hidden rounded-xl border border-default">
        <div v-for="b in state.backups" :key="b.id" class="flex items-center gap-4 border-b border-default px-4 py-3 last:border-b-0">
          <UIcon name="i-lucide-archive" class="size-5 shrink-0 text-muted" />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">{{ fmtDate(b.createdMs) }}</p>
            <p class="text-xs text-muted">{{ fmtSize(b.sizeBytes) }}<span v-if="b.label"> · {{ b.label }}</span></p>
          </div>
          <UButton icon="i-lucide-history" color="neutral" variant="subtle" size="sm" @click="pendingRestore = b.id">Restore</UButton>
        </div>
      </div>
      <div v-else class="rounded-xl border border-default py-8 text-center text-sm text-muted">
        No backups yet. One is made automatically before each modded launch.
      </div>
    </div>

    <UModal :open="!!pendingRestore" title="Restore saves" @update:open="(v: boolean) => { if (!v) pendingRestore = null; }">
      <template #body>
        <p class="text-sm">
          Restore this backup? It overwrites current save files with the backed-up versions. (You can
          back up again first if you're unsure.)
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="pendingRestore = null">Cancel</UButton>
          <UButton color="warning" icon="i-lucide-history" @click="confirmRestore">Restore</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
