<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { isElectron, useStore } from "./store";
import ProfilesModal from "./components/ProfilesModal.vue";
import ProgressBanner from "./components/ProgressBanner.vue";

const store = useStore();
const collapsed = ref(false);

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
    items: [{ label: "Mods Library", icon: "i-lucide-package", to: "/mods", badge: true }],
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

onMounted(() => store.init());
onUnmounted(() => store.dispose());
</script>

<template>
  <UApp>
    <div class="flex h-screen overflow-hidden bg-default text-default">
      <!-- Sidebar -->
      <aside
        class="flex shrink-0 flex-col border-r border-default bg-elevated/40 transition-all"
        :class="collapsed ? 'w-16' : 'w-60'"
      >
        <div class="flex items-center gap-2.5 px-4 py-4">
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
                class="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors"
                :class="isActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted hover:bg-elevated hover:text-default'"
                @click="navigate"
              >
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
        <!-- Top bar -->
        <header class="flex items-center justify-between gap-4 border-b border-default px-5 py-3">
          <UDropdownMenu :items="profileMenu" :disabled="!isElectron">
            <UButton color="neutral" variant="subtle" trailing-icon="i-lucide-chevron-down" :disabled="!isElectron">
              <UIcon name="i-lucide-users" class="size-4" />
              {{ store.activeProfile.value?.name ?? "Default Profile" }}
            </UButton>
          </UDropdownMenu>

          <div class="flex items-center gap-2">
            <UButton
              color="neutral"
              variant="subtle"
              icon="i-lucide-play"
              :loading="store.state.launching"
              :disabled="!isElectron || !store.game.value"
              @click="store.launch('vanilla')"
            >
              Launch without mods
            </UButton>
            <UButton
              color="primary"
              icon="i-lucide-rocket"
              :loading="store.state.launching"
              :disabled="!isElectron || !store.game.value"
              @click="store.launch('modded')"
            >
              Launch modded · {{ store.enabledCount.value }} mods
            </UButton>
          </div>
        </header>

        <!-- Content -->
        <main class="flex-1 overflow-y-auto">
          <div class="mx-auto max-w-5xl space-y-5 px-6 py-6">
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
      </div>
    </div>

    <ProfilesModal v-model:open="store.state.profilesOpen" />
  </UApp>
</template>
