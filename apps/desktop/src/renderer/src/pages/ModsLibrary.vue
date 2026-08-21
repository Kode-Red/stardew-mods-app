<script setup lang="ts">
import { computed, onUnmounted, reactive, ref } from "vue";
import { canonicalModKey, type UpdateStatus } from "@sdm/core";
import type { ScannedMod, UpdateInfo } from "../../../shared/types";
import { isElectron, useStore } from "../store";

const store = useStore();

const query = ref("");
type Sort = "name" | "updates" | "enabled";
const sortBy = ref<Sort>("name");
const collapsed = reactive(new Set<string>());

const pendingUninstall = ref<ScannedMod | null>(null);
const pendingCategory = ref<ScannedMod | null>(null);
const categoryInput = ref("");

// Drag-and-drop + folder management
const draggingId = ref<string | null>(null);
const dragOverGroup = ref<string | null>(null);
const newFolderOpen = ref(false);
const newFolderName = ref("");
const pendingRename = ref<string | null>(null);
const renameInput = ref("");

const UNGROUPED = "Ungrouped";

const statusMeta: Record<UpdateStatus, { color: "success" | "warning" | "info" | "neutral"; label: string }> = {
  "up-to-date": { color: "success", label: "Up to date" },
  "update-available": { color: "warning", label: "Update" },
  ahead: { color: "info", label: "Ahead" },
  unknown: { color: "neutral", label: "—" },
};

const categories = computed(() => store.state.settings?.modCategories ?? {});
const folders = computed(() => store.state.settings?.modFolders ?? []);
const existingCategories = computed(() =>
  [...new Set([...folders.value, ...Object.values(categories.value)])].sort((a, b) => a.localeCompare(b)),
);

/** A stable per-mod key for categorising: UniqueID, else the dot-normalised path. */
function modKey(mod: ScannedMod): string {
  return mod.manifest?.uniqueId || canonicalModKey(mod.relativePath);
}

function categoryOf(mod: ScannedMod): string {
  return categories.value[modKey(mod)] || UNGROUPED;
}

function updateFor(mod: ScannedMod): UpdateInfo | undefined {
  return mod.manifest ? store.state.updates.get(mod.manifest.uniqueId) : undefined;
}

function compatFor(mod: ScannedMod): { label: string; color: "error" | "warning" } | null {
  const status = updateFor(mod)?.compatibilityStatus;
  if (!status || status === "Ok" || status === "Optional") return null;
  const color = /broken|abandoned|obsolete/i.test(status) ? "error" : "warning";
  return { label: status, color };
}

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  const list = store.mods.value;
  if (!q) return list;
  return list.filter(
    (m) =>
      m.displayName.toLowerCase().includes(q) ||
      m.manifest?.author?.toLowerCase().includes(q) ||
      m.folderName.toLowerCase().includes(q),
  );
});

const sorted = computed(() => {
  const list = [...filtered.value];
  if (sortBy.value === "name") return list.sort((a, b) => a.displayName.localeCompare(b.displayName));
  if (sortBy.value === "enabled") {
    return list.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.displayName.localeCompare(b.displayName));
  }
  const rank = (m: ScannedMod) => (updateFor(m)?.status === "update-available" ? 0 : 1);
  return list.sort((a, b) => rank(a) - rank(b) || a.displayName.localeCompare(b.displayName));
});

const groups = computed(() => {
  const map = new Map<string, ScannedMod[]>();
  // Seed user-created folders (so empty ones still show) when not filtering.
  if (!query.value.trim()) for (const f of folders.value) map.set(f, []);
  for (const mod of sorted.value) {
    const key = categoryOf(mod);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(mod);
  }
  const names = [...map.keys()].sort((a, b) => {
    if (a === UNGROUPED) return 1;
    if (b === UNGROUPED) return -1;
    return a.localeCompare(b);
  });
  return names
    .filter((n) => !(n === UNGROUPED && map.get(n)!.length === 0))
    .map((name) => ({ name, mods: map.get(name)! }));
});

const sortMenu = [
  [
    { label: "Name", icon: "i-lucide-arrow-down-a-z", onSelect: () => (sortBy.value = "name") },
    { label: "Updates first", icon: "i-lucide-arrow-up-circle", onSelect: () => (sortBy.value = "updates") },
    { label: "Enabled first", icon: "i-lucide-toggle-right", onSelect: () => (sortBy.value = "enabled") },
  ],
];

function rowMenu(mod: ScannedMod) {
  return [
    [
      { label: "Reveal in folder", icon: "i-lucide-folder-open", onSelect: () => store.revealMod(mod.relativePath) },
      { label: "Move to folder…", icon: "i-lucide-folder-input", onSelect: () => openCategory(mod) },
      { label: "Uninstall", icon: "i-lucide-trash-2", onSelect: () => (pendingUninstall.value = mod) },
    ],
  ];
}

function folderMenu(name: string) {
  return [
    [
      { label: "Rename", icon: "i-lucide-pencil", onSelect: () => openRename(name) },
      { label: "Delete folder", icon: "i-lucide-trash-2", onSelect: () => store.deleteFolder(name) },
    ],
  ];
}

// --- drag and drop ---
function onDragStart(mod: ScannedMod, event: DragEvent): void {
  const key = modKey(mod);
  draggingId.value = key;
  event.dataTransfer?.setData("text/plain", key);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}
function onDragEnd(): void {
  draggingId.value = null;
  dragOverGroup.value = null;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

// Auto-scroll the content area when dragging a mod near the top/bottom edge.
let rafId = 0;
let dragY = 0;
function autoscrollStep(): void {
  if (!draggingId.value) {
    rafId = 0;
    return;
  }
  const el = document.querySelector("main");
  if (el) {
    const rect = el.getBoundingClientRect();
    const edge = 64;
    const speed = 14;
    if (dragY > rect.top && dragY < rect.top + edge) el.scrollTop -= speed;
    else if (dragY > rect.bottom - edge) el.scrollTop += speed;
  }
  rafId = requestAnimationFrame(autoscrollStep);
}
function onRootDragOver(event: DragEvent): void {
  if (!draggingId.value) return;
  dragY = event.clientY;
  if (!rafId) rafId = requestAnimationFrame(autoscrollStep);
}

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId);
});
function onDropTo(folder: string): void {
  const id = draggingId.value;
  onDragEnd();
  if (id) void store.setModCategory(id, folder === UNGROUPED ? "" : folder);
}

// --- folder actions ---
function openCategory(mod: ScannedMod): void {
  pendingCategory.value = mod;
  categoryInput.value = categories.value[modKey(mod)] ?? "";
}
async function saveCategory(name: string): Promise<void> {
  const mod = pendingCategory.value;
  if (mod) await store.setModCategory(modKey(mod), name);
  pendingCategory.value = null;
}
async function createFolder(): Promise<void> {
  const n = newFolderName.value.trim();
  if (n) await store.createFolder(n);
  newFolderName.value = "";
  newFolderOpen.value = false;
}
function openRename(name: string): void {
  pendingRename.value = name;
  renameInput.value = name;
}
async function commitRename(): Promise<void> {
  if (pendingRename.value) await store.renameFolder(pendingRename.value, renameInput.value);
  pendingRename.value = null;
}
async function confirmUninstall(): Promise<void> {
  const mod = pendingUninstall.value;
  if (mod) await store.uninstallMod(mod.relativePath);
  pendingUninstall.value = null;
}
function toggleGroup(name: string): void {
  if (collapsed.has(name)) collapsed.delete(name);
  else collapsed.add(name);
}
function openUrl(url: string): void {
  window.open(url, "_blank", "noopener");
}
</script>

<template>
  <div class="space-y-5" @dragover="onRootDragOver">

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Mods Library</h1>
        <p class="text-sm text-muted">{{ store.mods.value.length }} installed · {{ store.enabledCount.value }} enabled</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UButton icon="i-lucide-folder-open" color="neutral" variant="ghost" :disabled="!isElectron || !store.game.value" @click="store.openModsFolder()">
          Open Mods folder
        </UButton>
        <UButton icon="i-lucide-folder-plus" color="neutral" variant="subtle" :disabled="!isElectron || !store.game.value" @click="store.installFromFile">
          Install from file
        </UButton>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="subtle" :loading="store.state.loading" :disabled="!isElectron" @click="store.refresh">
          Rescan
        </UButton>
        <UButton icon="i-lucide-download" color="primary" :loading="store.state.checking" :disabled="!isElectron || store.mods.value.length === 0" @click="store.checkUpdates">
          Check for updates
        </UButton>
        <UButton
          v-if="store.updatableCount.value > 0"
          icon="i-lucide-arrow-up-circle"
          color="primary"
          variant="soft"
          @click="store.updateAllMods()"
        >
          Update all ({{ store.updatableCount.value }})
        </UButton>
      </div>
    </div>

    <div v-if="isElectron && !store.game.value" class="flex flex-col items-center gap-3 rounded-xl border border-default py-8 text-center">
      <UIcon name="i-lucide-folder-search" class="size-8 text-muted" />
      <p class="text-sm text-muted">Choose your Stardew Valley folder to see installed mods.</p>
      <UButton icon="i-lucide-folder-open" @click="store.pickFolder">Choose game folder</UButton>
    </div>

    <template v-else-if="store.mods.value.length > 0">
      <!-- Toolbar -->
      <div class="flex flex-wrap gap-2">
        <UInput v-model="query" placeholder="Search mods…" icon="i-lucide-search" class="min-w-40 flex-1" />
        <UButton icon="i-lucide-folder-plus" color="neutral" variant="subtle" @click="newFolderOpen = true">
          New folder
        </UButton>
        <UDropdownMenu :items="sortMenu">
          <UButton color="neutral" variant="subtle" icon="i-lucide-arrow-up-down" trailing-icon="i-lucide-chevron-down">
            Sort
          </UButton>
        </UDropdownMenu>
      </div>

      <p class="text-xs text-dimmed">Tip: drag a mod onto a folder to organize it.</p>

      <!-- Conflicts -->
      <div
        v-if="store.conflictTotal.value > 0"
        class="space-y-2 rounded-xl border border-warning/40 bg-warning/5 p-4"
      >
        <div class="flex items-center gap-2 text-warning">
          <UIcon name="i-lucide-triangle-alert" class="size-4.5" />
          <span class="text-sm font-medium">
            {{ store.conflictTotal.value }} possible conflict{{ store.conflictTotal.value === 1 ? "" : "s" }}
          </span>
        </div>
        <ul class="space-y-1 text-sm text-muted">
          <li v-for="dup in store.conflicts.value.duplicateIds" :key="dup.uniqueId" class="flex gap-2">
            <UIcon name="i-lucide-copy" class="mt-0.5 size-3.5 shrink-0" />
            <span>
              Duplicate ID <span class="font-mono text-xs">{{ dup.uniqueId }}</span> —
              {{ dup.names.join(", ") }} (one won't load).
            </span>
          </li>
          <li
            v-for="(dep, i) in store.conflicts.value.missingDependencies"
            :key="`${dep.modName}-${dep.dependencyId}-${i}`"
            class="flex gap-2"
          >
            <UIcon name="i-lucide-unlink" class="mt-0.5 size-3.5 shrink-0" />
            <span>
              <span class="font-medium text-default">{{ dep.modName }}</span> needs
              <span class="font-mono text-xs">{{ dep.dependencyId }}</span>
              ({{ dep.reason === "outdated" ? "update it" : "not installed/enabled" }}).
            </span>
          </li>
        </ul>
      </div>

      <div v-if="filtered.length === 0" class="rounded-xl border border-default py-8 text-center text-sm text-muted">
        No mods match "{{ query }}".
      </div>

      <!-- Grouped list -->
      <div
        v-for="group in groups"
        v-else
        :key="group.name"
        class="overflow-hidden rounded-xl border transition-colors"
        :class="dragOverGroup === group.name ? 'border-primary bg-primary/5' : 'border-default'"
        @dragover.prevent="dragOverGroup = group.name"
        @drop.prevent="onDropTo(group.name)"
      >
        <div class="flex items-center bg-elevated/40">
          <button
            class="flex flex-1 items-center gap-2 px-4 py-2.5 text-left text-sm font-medium transition-colors hover:bg-elevated/70"
            @click="toggleGroup(group.name)"
          >
            <UIcon :name="collapsed.has(group.name) ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'" class="size-4 text-muted" />
            <UIcon :name="group.name === UNGROUPED ? 'i-lucide-inbox' : 'i-lucide-folder'" class="size-4 text-muted" />
            <span>{{ group.name }}</span>
            <UBadge color="neutral" variant="subtle" size="sm">{{ group.mods.length }}</UBadge>
          </button>
          <UDropdownMenu v-if="group.name !== UNGROUPED" :items="folderMenu(group.name)">
            <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" size="sm" class="mr-2" />
          </UDropdownMenu>
        </div>

        <template v-if="!collapsed.has(group.name)">
          <div v-if="group.mods.length === 0" class="border-t border-default px-4 py-6 text-center text-xs text-dimmed">
            Drag mods here
          </div>
          <div
            v-for="mod in group.mods"
            :key="mod.relativePath"
            class="group/row flex items-center gap-3 border-t border-default px-4 py-3.5 transition-colors hover:bg-elevated/40"
            :class="{ 'opacity-55': !mod.enabled }"
            draggable="true"
            @dragstart="onDragStart(mod, $event)"
            @dragend="onDragEnd"
          >
            <UIcon
              name="i-lucide-grip-vertical"
              class="size-4 shrink-0 cursor-grab text-dimmed opacity-0 transition-opacity group-hover/row:opacity-100"
            />
            <USwitch :model-value="mod.enabled" :disabled="!!mod.error" @update:model-value="store.toggle(mod)" />

            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate font-medium">{{ mod.displayName }}</span>
                <UBadge v-if="mod.manifest?.isContentPack" color="neutral" variant="outline" size="sm">content pack</UBadge>
                <UBadge v-if="mod.error" color="error" variant="subtle" size="sm">invalid manifest</UBadge>
                <UBadge v-if="compatFor(mod)" :color="compatFor(mod)!.color" variant="subtle" size="sm">
                  {{ compatFor(mod)!.label }}
                </UBadge>
              </div>
              <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span v-if="mod.manifest?.author">by {{ mod.manifest.author }}</span>
                <span v-if="mod.manifest" class="font-mono">v{{ mod.manifest.version }}</span>
                <span v-else class="truncate">{{ mod.error }}</span>
                <span
                  v-for="key in (mod.manifest?.updateKeys ?? [])"
                  :key="key.raw"
                  class="rounded bg-elevated px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-dimmed"
                >
                  {{ key.site }}
                </span>
              </div>
            </div>

            <template v-if="updateFor(mod)">
              <UBadge :color="statusMeta[updateFor(mod)!.status].color" variant="subtle">
                {{ statusMeta[updateFor(mod)!.status].label }}
                <template v-if="updateFor(mod)!.status === 'update-available'">→ {{ updateFor(mod)!.latestVersion }}</template>
              </UBadge>
              <UButton
                v-if="updateFor(mod)!.status === 'update-available'"
                icon="i-lucide-arrow-up-circle"
                color="primary"
                variant="soft"
                size="xs"
                :disabled="!mod.manifest"
                @click="mod.manifest && store.updateMod(mod.manifest.uniqueId)"
              >
                Update
              </UButton>
              <UButton
                v-if="updateFor(mod)!.status === 'update-available' && updateFor(mod)!.url"
                icon="i-lucide-external-link"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="openUrl(updateFor(mod)!.url!)"
              />
            </template>

            <UDropdownMenu :items="rowMenu(mod)">
              <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" size="sm" />
            </UDropdownMenu>
          </div>
        </template>
      </div>
    </template>

    <div v-else-if="isElectron && !store.state.loading" class="rounded-xl border border-default py-8 text-center text-sm text-muted">
      No mods found. Install one from a file or from Nexus.
    </div>

    <!-- New folder -->
    <UModal :open="newFolderOpen" title="New folder" @update:open="(v: boolean) => (newFolderOpen = v)">
      <template #body>
        <UInput v-model="newFolderName" placeholder="Folder name (e.g. UI, Farm, Cheats)" autofocus @keyup.enter="createFolder" />
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="newFolderOpen = false">Cancel</UButton>
          <UButton :disabled="!newFolderName.trim()" @click="createFolder">Create</UButton>
        </div>
      </template>
    </UModal>

    <!-- Rename folder -->
    <UModal :open="!!pendingRename" title="Rename folder" @update:open="(v: boolean) => { if (!v) pendingRename = null; }">
      <template #body>
        <UInput v-model="renameInput" @keyup.enter="commitRename" />
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="pendingRename = null">Cancel</UButton>
          <UButton @click="commitRename">Rename</UButton>
        </div>
      </template>
    </UModal>

    <!-- Move to folder -->
    <UModal :open="!!pendingCategory" title="Move to folder" @update:open="(v: boolean) => { if (!v) pendingCategory = null; }">
      <template #body>
        <div class="space-y-3">
          <p class="text-sm">
            Organize <span class="font-medium">{{ pendingCategory?.displayName }}</span> into a folder.
          </p>
          <UInput v-model="categoryInput" placeholder="Folder name" @keyup.enter="saveCategory(categoryInput)" />
          <div v-if="existingCategories.length" class="flex flex-wrap gap-1.5">
            <UButton v-for="cat in existingCategories" :key="cat" size="xs" color="neutral" variant="subtle" @click="saveCategory(cat)">
              {{ cat }}
            </UButton>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-between gap-2">
          <UButton color="neutral" variant="ghost" @click="saveCategory('')">Remove from folder</UButton>
          <div class="flex gap-2">
            <UButton color="neutral" variant="ghost" @click="pendingCategory = null">Cancel</UButton>
            <UButton @click="saveCategory(categoryInput)">Save</UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Uninstall confirm -->
    <UModal :open="!!pendingUninstall" title="Uninstall mod" @update:open="(v: boolean) => { if (!v) pendingUninstall = null; }">
      <template #body>
        <p class="text-sm">
          Delete <span class="font-medium">{{ pendingUninstall?.displayName }}</span> from your Mods folder?
          This can't be undone.
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="pendingUninstall = null">Cancel</UButton>
          <UButton color="error" icon="i-lucide-trash-2" @click="confirmUninstall">Uninstall</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
