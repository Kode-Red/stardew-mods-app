<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { isElectron, useStore } from "../store";

const store = useStore();
const router = useRouter();

const installing = computed(() => {
  const p = store.state.progress;
  return !!p && ["resolving", "downloading", "installing"].includes(p.phase);
});

const stats = [
  { label: "Installed", icon: "i-lucide-package", get: () => store.mods.value.length },
  { label: "Updates", icon: "i-lucide-arrow-up-circle", get: () => store.updatableCount.value },
  { label: "Enabled", icon: "i-lucide-toggle-right", get: () => store.enabledCount.value },
];
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">Dashboard</h1>
      <p class="text-sm text-muted">Manage your Stardew Valley mods and profiles.</p>
    </div>

    <!-- Featured placeholder -->
    <div class="relative overflow-hidden rounded-xl border border-default bg-gradient-to-br from-primary/15 via-elevated to-default p-8">
      <p class="text-xs font-medium uppercase tracking-widest text-primary">Getting started</p>
      <h2 class="mt-2 max-w-lg text-2xl font-bold">Install a mod, build a profile, launch the game.</h2>
      <p class="mt-2 max-w-xl text-sm text-muted">
        Point the app at your Stardew Valley folder, install mods from Nexus or a local zip, then
        group them into profiles you can switch between.
      </p>
      <div class="mt-4 flex gap-2">
        <UButton icon="i-lucide-package" @click="router.push('/mods')">Open Mods Library</UButton>
        <UButton icon="i-lucide-sliders-horizontal" color="neutral" variant="subtle" :disabled="!isElectron" @click="store.state.profilesOpen = true">
          Manage profiles
        </UButton>
      </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <button
        v-for="stat in stats"
        :key="stat.label"
        class="flex items-center gap-4 rounded-xl border border-default bg-elevated/40 p-5 text-left transition-colors hover:border-primary/40 hover:bg-elevated/70"
        @click="router.push('/mods')"
      >
        <div class="grid size-11 place-items-center rounded-lg bg-primary/10 text-primary">
          <UIcon :name="stat.icon" class="size-5" />
        </div>
        <div>
          <div class="text-2xl font-semibold tabular-nums">{{ stat.get() }}</div>
          <div class="text-xs text-muted">{{ stat.label }}</div>
        </div>
      </button>
    </div>

    <!-- Game / SMAPI status -->
    <div v-if="isElectron && store.game.value" class="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-default p-5">
      <div class="space-y-1">
        <div class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-folder-check" class="size-4" />
          <span>Game folder</span>
          <UBadge color="neutral" variant="subtle" size="sm">{{ store.game.value.source }}</UBadge>
        </div>
        <p class="font-mono text-sm break-all">{{ store.game.value.path }}</p>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1.5">
          <UIcon
            :name="store.smapi.value?.installed ? 'i-lucide-circle-check' : 'i-lucide-circle-x'"
            :class="store.smapi.value?.installed ? 'text-success' : 'text-error'"
            class="size-5"
          />
          <span class="text-sm font-medium">
            SMAPI {{ store.smapi.value?.version ?? (store.smapi.value?.installed ? "" : "not installed") }}
          </span>
        </div>
        <UButton
          v-if="!store.smapi.value?.installed"
          size="sm"
          icon="i-lucide-download"
          :loading="installing"
          @click="store.installSmapi()"
        >
          Install SMAPI
        </UButton>
      </div>
    </div>

    <div v-else-if="isElectron" class="flex flex-col items-center gap-3 rounded-xl border border-default py-8 text-center">
      <UIcon name="i-lucide-folder-search" class="size-8 text-muted" />
      <p class="text-sm text-muted">Stardew Valley install not found.</p>
      <UButton icon="i-lucide-folder-open" @click="store.pickFolder">Choose game folder</UButton>
    </div>
  </div>
</template>
