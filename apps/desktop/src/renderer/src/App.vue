<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import type { DesktopApi } from "../../shared/types";
import { isElectron, useStore } from "./store";
import ProfilesModal from "./components/ProfilesModal.vue";
import ProgressBanner from "./components/ProgressBanner.vue";

const store = useStore();
const collapsed = ref(false);

const winApi = (window as unknown as { api?: DesktopApi }).api?.window;
const isMaximized = ref(false);
let unsubMaximize: (() => void) | undefined;

const navGroups = [
  {
    group: "General",
    items: [
      { label: "Dashboard", icon: "i-lucide-layout-dashboard", to: "/" },
      { label: "Downloads", icon: "i-lucide-download", to: "/downloads" },
      { label: "Settings", icon: "i-lucide-settings", to: "/settings" },
    ],
  },
  {
    group: "Mods",
    items: [
      { label: "Mods Library", icon: "i-lucide-package", to: "/mods", badge: true },
      { label: "Mods Store", icon: "i-lucide-store", to: "/store", badge: false },
    ],
  },
];

const profileMenu = computed(() => [
  store.state.profiles.profiles.map((p) => ({
    label: p.name,
    icon: p.id === store.state.profiles.activeId ? "i-lucide-check" : "i-lucide-user",
    onSelect: () => store.activateProfile(p.id),
  })),
  [
    {
      label: "Manage profiles…",
      icon: "i-lucide-sliders-horizontal",
      onSelect: () => (store.state.profilesOpen = true),
    },
  ],
]);

onMounted(async () => {
  store.init();
  if (winApi) {
    isMaximized.value = await winApi.isMaximized();
    unsubMaximize = winApi.onMaximizedChange((v) => (isMaximized.value = v));
  }
});
onUnmounted(() => {
  store.dispose();
  unsubMaximize?.();
});
</script>

<template>
  <UApp>
    <div class="flex h-screen overflow-hidden bg-default text-default">
      <!-- Sidebar -->
      <aside
        class="flex shrink-0 flex-col border-r border-default bg-elevated/40 transition-all"
        :class="collapsed ? 'w-16' : 'w-60'"
      >
        <div class="app-drag flex h-12 items-center gap-2.5 px-4">
          <div class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <UIcon name="i-lucide-sprout" class="size-5" />
          </div>
          <div v-if="!collapsed" class="min-w-0">
            <p class="truncate text-sm font-semibold leading-tight">Stardew Mods</p>
            <p class="text-[11px] text-muted">v0.0 · early</p>
          </div>
        </div>

        <nav class="flex-1 space-y-4 overflow-y-auto px-2 py-2">
          <div v-for="section in navGroups" :key="section.group">
            <p v-if="!collapsed" class="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-dimmed">
              {{ section.group }}
            </p>
            <RouterLink
              v-for="item in section.items"
              v-slot="{ isActive, navigate }"
              :key="item.to"
              :to="item.to"
              custom
            >
              <button
                class="relative flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors"
                :class="isActive ? 'bg-primary/10 font-medium text-primary' : 'text-muted hover:bg-elevated hover:text-default'"
                @click="navigate"
              >
                <span
                  v-if="isActive"
                  class="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary"
                />
                <UIcon :name="item.icon" class="size-4.5 shrink-0" />
                <template v-if="!collapsed">
                  <span class="flex-1 text-left">{{ item.label }}</span>
                  <UBadge
                    v-if="item.badge && store.mods.value.length"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                  >
                    {{ store.mods.value.length }}
                  </UBadge>
                </template>
              </button>
            </RouterLink>
          </div>
        </nav>

        <button
          class="flex items-center gap-3 border-t border-default px-4 py-3 text-sm text-muted hover:text-default"
          @click="collapsed = !collapsed"
        >
          <UIcon :name="collapsed ? 'i-lucide-chevrons-right' : 'i-lucide-chevrons-left'" class="size-4.5" />
          <span v-if="!collapsed">Collapse</span>
        </button>
      </aside>

      <!-- Main column -->
      <div class="flex min-w-0 flex-1 flex-col">
        <!-- Top bar (custom frameless title bar: draggable, with window controls) -->
        <header class="app-drag flex h-12 items-center justify-between gap-4 border-b border-default pl-4">
          <div class="app-no-drag flex items-center">
            <UDropdownMenu :items="profileMenu" :disabled="!isElectron">
              <UButton color="neutral" variant="subtle" size="sm" trailing-icon="i-lucide-chevron-down" :disabled="!isElectron">
                <UIcon name="i-lucide-users" class="size-4" />
                {{ store.activeProfile.value?.name ?? "Default Profile" }}
              </UButton>
            </UDropdownMenu>
          </div>

          <div class="flex h-full items-center">
            <div class="app-no-drag flex items-center gap-2 pr-3">
              <UButton
                color="neutral"
                variant="subtle"
                size="sm"
                icon="i-lucide-play"
                :loading="store.state.launching"
                :disabled="!isElectron || !store.game.value"
                @click="store.launch('vanilla')"
              >
                Launch without mods
              </UButton>
              <UButton
                color="primary"
                size="sm"
                icon="i-lucide-rocket"
                :loading="store.state.launching"
                :disabled="!isElectron || !store.game.value"
                @click="store.launch('modded')"
              >
                Launch modded · {{ store.enabledCount.value }} mods
              </UButton>
            </div>

            <!-- Account avatar -->
            <div class="app-no-drag flex items-center pr-3">
              <div class="grid size-7 place-items-center rounded-full border border-default bg-elevated text-muted">
                <UIcon name="i-lucide-user" class="size-4" />
              </div>
            </div>

            <!-- Window controls -->
            <div v-if="isElectron" class="app-no-drag flex h-full items-stretch">
              <button
                class="grid h-full w-12 place-items-center text-muted transition-colors hover:bg-elevated hover:text-default"
                aria-label="Minimize"
                @click="winApi?.minimize()"
              >
                <UIcon name="i-lucide-minus" class="size-4" />
              </button>
              <button
                class="grid h-full w-12 place-items-center text-muted transition-colors hover:bg-elevated hover:text-default"
                aria-label="Maximize"
                @click="winApi?.toggleMaximize()"
              >
                <UIcon :name="isMaximized ? 'i-lucide-copy' : 'i-lucide-square'" class="size-3.5" />
              </button>
              <button
                class="grid h-full w-12 place-items-center text-muted transition-colors hover:bg-error hover:text-inverted"
                aria-label="Close"
                @click="winApi?.close()"
              >
                <UIcon name="i-lucide-x" class="size-4" />
              </button>
            </div>
          </div>
        </header>

        <!-- Content -->
        <main class="flex-1 overflow-y-auto">
          <div class="mx-auto max-w-6xl space-y-6 px-8 py-7">
            <UAlert
              v-if="!isElectron"
              icon="i-lucide-monitor"
              color="info"
              variant="soft"
              title="Browser preview"
              description="Live features run only inside the Electron app: pnpm --filter @sdm/desktop dev"
            />

            <UAlert
              v-if="store.state.error"
              icon="i-lucide-triangle-alert"
              color="error"
              variant="soft"
              title="Something went wrong"
              :description="store.state.error"
              :close="{ onClick: () => (store.state.error = null) }"
            />

            <ProgressBanner />

            <RouterView />
          </div>
        </main>

        <!-- Status bar -->
        <footer class="flex h-7 shrink-0 items-center justify-between gap-4 border-t border-default bg-elevated/40 px-4 text-[11px] text-muted">
          <div class="flex min-w-0 items-center gap-2">
            <span class="flex items-center gap-1.5">
              <span class="size-1.5 rounded-full" :class="store.game.value ? 'bg-success' : 'bg-error'" />
              {{ store.game.value ? "Connected" : "No game folder" }}
            </span>
            <span v-if="store.game.value" class="truncate font-mono opacity-70">{{ store.game.value.path }}</span>
          </div>
          <div class="flex shrink-0 items-center gap-3">
            <span v-if="store.smapi.value?.installed">SMAPI {{ store.smapi.value.version ?? "" }}</span>
            <span>{{ store.mods.value.length }} mods · {{ store.enabledCount.value }} on</span>
            <span v-if="store.state.info" class="opacity-70">v{{ store.state.info.appVersion }}</span>
          </div>
        </footer>
      </div>
    </div>

    <ProfilesModal v-model:open="store.state.profilesOpen" />
  </UApp>
</template>
