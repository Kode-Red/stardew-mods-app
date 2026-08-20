<script setup lang="ts">
import { ref } from "vue";
import type { UpdateStatus } from "@sdm/core";
import type { ScannedMod, UpdateInfo } from "../../../shared/types";
import { isElectron, useStore } from "../store";

const store = useStore();
const pendingUninstall = ref<ScannedMod | null>(null);

function rowMenu(mod: ScannedMod) {
  return [
    [
      {
        label: "Reveal in folder",
        icon: "i-lucide-folder-open",
        onSelect: () => store.revealMod(mod.relativePath),
      },
      {
        label: "Uninstall",
        icon: "i-lucide-trash-2",
        onSelect: () => (pendingUninstall.value = mod),
      },
    ],
  ];
}

async function confirmUninstall(): Promise<void> {
  const mod = pendingUninstall.value;
  if (mod) await store.uninstallMod(mod.relativePath);
  pendingUninstall.value = null;
}

const statusMeta: Record<UpdateStatus, { color: "success" | "warning" | "info" | "neutral"; label: string }> = {
  "up-to-date": { color: "success", label: "Up to date" },
  "update-available": { color: "warning", label: "Update" },
  ahead: { color: "info", label: "Ahead" },
  unknown: { color: "neutral", label: "—" },
};

function updateFor(mod: ScannedMod): UpdateInfo | undefined {
  return mod.manifest ? store.state.updates.get(mod.manifest.uniqueId) : undefined;
}

function openUrl(url: string): void {
  window.open(url, "_blank", "noopener");
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Mods Library</h1>
        <p class="text-sm text-muted">{{ store.mods.value.length }} installed · {{ store.enabledCount.value }} enabled</p>
      </div>
      <div class="flex items-center gap-2">
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

    <div v-else-if="store.mods.value.length > 0" class="overflow-hidden rounded-xl border border-default">
      <div
        v-for="mod in store.mods.value"
        :key="mod.relativePath"
        class="flex items-center gap-4 border-b border-default px-4 py-3.5 transition-colors last:border-b-0 hover:bg-elevated/40"
        :class="{ 'opacity-55': !mod.enabled }"
      >
        <USwitch :model-value="mod.enabled" :disabled="!!mod.error" @update:model-value="store.toggle(mod)" />

        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="truncate font-medium">{{ mod.displayName }}</span>
            <UBadge v-if="mod.manifest?.isContentPack" color="neutral" variant="outline" size="sm">content pack</UBadge>
            <UBadge v-if="mod.error" color="error" variant="subtle" size="sm">invalid manifest</UBadge>
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
    </div>

    <div v-else-if="isElectron && !store.state.loading" class="rounded-xl border border-default py-8 text-center text-sm text-muted">
      No mods found. Install one from a file or from Nexus.
    </div>

    <UModal :open="!!pendingUninstall" title="Uninstall mod" @update:open="(v: boolean) => { if (!v) pendingUninstall = null; }">
      <template #body>
        <p class="text-sm">
          Delete <span class="font-medium">{{ pendingUninstall?.displayName }}</span> from your Mods
          folder? This can't be undone.
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
