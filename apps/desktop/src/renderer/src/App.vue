<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import type { DesktopApi, LaunchWarning } from "../../shared/types";
import { isElectron, useStore } from "./store";
import ProfilesModal from "./components/ProfilesModal.vue";
import ProgressBanner from "./components/ProgressBanner.vue";
import SetupWizard from "./components/SetupWizard.vue";
import NavItem from "./components/NavItem.vue";

const store = useStore();
const collapsed = ref(false);

const pendingLaunchWarning = ref<LaunchWarning | null>(null);
async function launchModded(): Promise<void> {
  const warning = await store.launchWarning();
  if (warning) {
    pendingLaunchWarning.value = warning;
    return;
  }
  await store.launch("modded");
}
function confirmLaunchModded(): void {
  pendingLaunchWarning.value = null;
  void store.launch("modded");
}

const isWindows = computed(() => store.state.info?.platform === "win32");
const moveHelpOpen = ref(false);
async function chooseFolderFromWarning(): Promise<void> {
  moveHelpOpen.value = false;
  await store.pickFolder();
}

const winApi = (window as unknown as { api?: DesktopApi }).api?.window;
const isMaximized = ref(false);
let unsubMaximize: (() => void) | undefined;

const navGroups = [
  {
    group: "General",
    items: [
      { label: "Dashboard", icon: "i-lucide-layout-dashboard", to: "/" },
      { label: "Saves", icon: "i-lucide-save", to: "/saves" },
      { label: "Downloads", icon: "i-lucide-download", to: "/downloads" },
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
  if (winApi) {
    winApi.isMaximized().then((v) => (isMaximized.value = v));
    unsubMaximize = winApi.onMaximizedChange((v) => (isMaximized.value = v));
  }
  await store.init();
  // First-run: open the setup wizard if the game or SMAPI isn't ready yet.
  if (isElectron && (!store.game.value || !store.smapi.value?.installed)) {
    store.state.setupOpen = true;
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
        class="flex shrink-0 flex-col overflow-hidden border-r border-default bg-elevated/40"
        :style="{
          width: (collapsed ? '4rem' : '15rem') + ' !important',
          minWidth: (collapsed ? '4rem' : '15rem') + ' !important',
        }"
      >
        <div class="app-drag flex h-12 items-center gap-2.5 px-4 mt-2">
          <div class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <UIcon name="i-lucide-sprout" class="size-5" />
          </div>
          <div v-if="!collapsed" class="min-w-0">
            <p class="truncate text-sm font-semibold leading-tight">Stardew Mods</p>
            <p class="text-[11px] text-muted">v0.0 · early</p>
          </div>
        </div>

        <nav class="flex-1 space-y-6 overflow-y-auto px-3 py-3">
          <div v-for="section in navGroups" :key="section.group">
            <p v-if="!collapsed" class="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-dimmed">
              {{ section.group }}
            </p>
            <div class="space-y-1">
              <NavItem
                v-for="item in section.items"
                :key="item.to"
                :to="item.to"
                :icon="item.icon"
                :label="item.label"
                :badge="item.badge ? store.mods.value.length : undefined"
                :collapsed="collapsed"
              />
            </div>
          </div>
        </nav>

        <!-- Pinned to the bottom -->
        <div class="space-y-1 border-t border-default px-3 py-3">
          <NavItem to="/settings" icon="i-lucide-settings" label="Settings" :collapsed="collapsed" />
          <button
            class="flex w-full items-center gap-3 rounded-lg py-2 text-sm text-muted transition-colors hover:bg-elevated hover:text-default"
            :class="collapsed ? 'justify-center px-0' : 'px-3'"
            :title="collapsed ? 'Expand' : undefined"
            @click="collapsed = !collapsed"
          >
            <UIcon :name="collapsed ? 'i-lucide-chevrons-right' : 'i-lucide-chevrons-left'" class="size-4.5 shrink-0" />
            <span v-if="!collapsed" class="flex-1 text-left">Collapse</span>
          </button>
        </div>
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
                @click="launchModded"
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

        <!-- Permission warning (game folder not writable) -->
        <div
          v-if="isElectron && store.game.value && !store.modsWritable.value"
          class="flex items-center gap-3 border-b border-warning/40 bg-warning/10 px-5 py-2.5 text-sm"
        >
          <UIcon name="i-lucide-shield-alert" class="size-5 shrink-0 text-warning" />
          <div class="min-w-0 flex-1">
            <span class="font-medium">Windows is blocking changes to your game folder.</span>
            <span class="text-muted">
              It's in a protected location (Program Files). Move the game to a normal folder (no
              admin needed) — or restart as admin.
            </span>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <UButton size="sm" color="neutral" variant="subtle" icon="i-lucide-help-circle" @click="moveHelpOpen = true">
              How to move
            </UButton>
            <UButton size="sm" color="neutral" variant="subtle" icon="i-lucide-folder-open" @click="store.pickFolder()">
              Choose folder
            </UButton>
            <UButton v-if="isWindows" size="sm" color="warning" icon="i-lucide-shield" @click="store.relaunchElevated()">
              Restart as admin
            </UButton>
          </div>
        </div>

        <!-- App update ready -->
        <div
          v-if="store.state.appUpdate.state === 'downloaded'"
          class="flex items-center gap-3 border-b border-primary/40 bg-primary/10 px-5 py-2.5 text-sm"
        >
          <UIcon name="i-lucide-sparkles" class="size-5 shrink-0 text-primary" />
          <div class="min-w-0 flex-1">
            <span class="font-medium">Update ready</span>
            <span class="text-muted"> — version {{ store.state.appUpdate.version }} installs when you restart.</span>
          </div>
          <UButton size="sm" color="primary" icon="i-lucide-rocket" @click="store.installAppUpdate()">
            Restart &amp; update
          </UButton>
        </div>

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
            <span v-if="store.smapi.value?.installed">SMAPI {{ (store.smapi.value.version ?? "").split("+")[0] }}</span>
            <span>{{ store.mods.value.length }} mods · {{ store.enabledCount.value }} on</span>
            <span v-if="store.state.info" class="opacity-70">v{{ store.state.info.appVersion }}</span>
          </div>
        </footer>
      </div>
    </div>

    <ProfilesModal v-model:open="store.state.profilesOpen" />
    <SetupWizard />

    <!-- How to move the game out of Program Files -->
    <UModal
      :open="moveHelpOpen"
      title="Move Stardew out of Program Files"
      @update:open="(v: boolean) => (moveHelpOpen = v)"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-muted">
            Windows protects <span class="font-mono">Program Files</span>, so mods can't be changed
            there without admin. Moving the game to a normal folder fixes it permanently — Steam does
            it for you in a couple of minutes and keeps your saves.
          </p>
          <ol class="space-y-2 text-sm">
            <li class="flex gap-2"><span class="font-medium text-primary">1.</span> In Steam, open <span class="font-medium">Settings → Storage</span>.</li>
            <li class="flex gap-2"><span class="font-medium text-primary">2.</span> Click <span class="font-medium">Add Drive</span> and pick a spot outside Program Files (another drive, or e.g. <span class="font-mono">C:\Games</span>).</li>
            <li class="flex gap-2"><span class="font-medium text-primary">3.</span> Select <span class="font-medium">Stardew Valley</span> in the library, then <span class="font-medium">Move</span>.</li>
            <li class="flex gap-2"><span class="font-medium text-primary">4.</span> Come back here and click <span class="font-medium">Choose folder</span> (or Rescan) so the app picks up the new location.</li>
          </ol>
          <UAlert
            icon="i-lucide-info"
            color="neutral"
            variant="soft"
            title="No admin after this"
            description="Once the game lives outside Program Files, enabling/disabling, installing, and profile switches all work without administrator rights."
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="moveHelpOpen = false">Got it</UButton>
          <UButton icon="i-lucide-folder-open" @click="chooseFolderFromWarning">Choose folder now</UButton>
        </div>
      </template>
    </UModal>

    <!-- Pre-launch save/profile mismatch warning -->
    <UModal
      :open="!!pendingLaunchWarning"
      title="Save may not match this profile"
      @update:open="(v: boolean) => { if (!v) pendingLaunchWarning = null; }"
    >
      <template #body>
        <div class="flex gap-3">
          <UIcon name="i-lucide-triangle-alert" class="size-6 shrink-0 text-warning" />
          <p class="text-sm">
            Your most recent save
            <span class="font-medium">{{ pendingLaunchWarning?.saveFarmName }}</span>
            was last played with
            <span class="font-medium">{{ pendingLaunchWarning?.savedProfileName }}</span>, but
            <span class="font-medium">{{ pendingLaunchWarning?.activeProfileName }}</span>
            is active. Launching with a different modset can corrupt that save. Your saves were
            backed up before launch just in case.
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="pendingLaunchWarning = null">Cancel</UButton>
          <UButton color="warning" icon="i-lucide-rocket" @click="confirmLaunchModded">Launch anyway</UButton>
        </div>
      </template>
    </UModal>
  </UApp>
</template>
