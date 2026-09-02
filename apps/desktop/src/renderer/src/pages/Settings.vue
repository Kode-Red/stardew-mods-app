<script setup lang="ts">
import { computed, ref } from "vue";
import { isElectron, useStore } from "../store";

const store = useStore();

const smapiVersion = computed(() => (store.smapi.value?.version ?? "").split("+")[0]);
const installingSmapi = computed(() => {
  const p = store.state.progress;
  return !!p && ["resolving", "downloading", "installing"].includes(p.phase);
});
const nexusKeyInput = ref("");
const savingKey = ref(false);
const keyError = ref<string | null>(null);

const cfKeyInput = ref("");
const savingCfKey = ref(false);
const cfKeyError = ref<string | null>(null);

const listingsInput = ref("");
const savingListings = ref(false);

const appVersion = computed(() => store.state.info?.appVersion ?? "");
const updateStatus = computed(() => {
  const u = store.state.appUpdate;
  switch (u.state) {
    case "checking": return "Checking for updates…";
    case "available": return `Downloading update v${u.version}…`;
    case "downloading": return `Downloading… ${u.percent}%`;
    case "downloaded": return `Update v${u.version} ready — restart to install.`;
    case "not-available": return "You're on the latest version.";
    case "error": return `Couldn't check: ${u.message}`;
    case "unsupported": return "Updates apply to the installed app (not in dev).";
    default: return "";
  }
});
const checkingUpdate = computed(() =>
  ["checking", "available", "downloading"].includes(store.state.appUpdate.state),
);

const channel = computed(() => store.state.settings?.updateChannel ?? "stable");
const switchingChannel = ref(false);
async function switchChannel(next: "stable" | "beta"): Promise<void> {
  if (next === channel.value || switchingChannel.value) return;
  switchingChannel.value = true;
  await store.setUpdateChannel(next);
  switchingChannel.value = false;
}

async function saveKey(): Promise<void> {
  savingKey.value = true;
  keyError.value = null;
  const ok = await store.saveNexusKey(nexusKeyInput.value);
  if (ok) nexusKeyInput.value = "";
  else if (store.state.error) keyError.value = store.state.error;
  savingKey.value = false;
}

async function saveCfKey(): Promise<void> {
  savingCfKey.value = true;
  cfKeyError.value = null;
  const ok = await store.saveCurseForgeKey(cfKeyInput.value);
  if (ok) cfKeyInput.value = "";
  else if (store.state.error) cfKeyError.value = store.state.error;
  savingCfKey.value = false;
}

async function saveListings(): Promise<void> {
  savingListings.value = true;
  await store.saveListingsUrl(listingsInput.value);
  savingListings.value = false;
}

function openUrl(url: string): void {
  window.open(url, "_blank", "noopener");
}
</script>

<template>
  <div class="max-w-2xl space-y-6">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Settings</h1>
        <p class="text-sm text-muted">Game location and mod sources.</p>
      </div>
      <UButton
        icon="i-lucide-wand-2"
        color="neutral"
        variant="subtle"
        :disabled="!isElectron"
        @click="store.state.setupOpen = true"
      >
        Run setup
      </UButton>
    </div>

    <!-- App updates -->
    <section class="space-y-3 rounded-xl border border-default p-5">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-medium">App updates</h2>
        <UBadge color="neutral" variant="subtle">v{{ appVersion || "0.0.0" }}</UBadge>
      </div>
      <div class="flex items-center gap-3">
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="subtle"
          :loading="checkingUpdate"
          :disabled="!isElectron"
          @click="store.checkAppUpdate()"
        >
          Check for updates
        </UButton>
        <UButton
          v-if="store.state.appUpdate.state === 'downloaded'"
          color="primary"
          icon="i-lucide-rocket"
          @click="store.installAppUpdate()"
        >
          Restart &amp; update
        </UButton>
        <span v-if="updateStatus" class="text-sm text-muted">{{ updateStatus }}</span>
      </div>

      <div class="flex items-center justify-between gap-4 border-t border-default pt-3">
        <div class="min-w-0">
          <p class="text-sm">Release channel</p>
          <p class="text-xs text-muted">
            <template v-if="channel === 'beta'">
              Beta gets prereleases early — expect rough edges. Switch to Stable to move back to the latest stable build.
            </template>
            <template v-else>
              Stable only. Switch to Beta to test prerelease builds before they ship.
            </template>
          </p>
        </div>
        <UButtonGroup class="shrink-0">
          <UButton
            :color="channel === 'stable' ? 'primary' : 'neutral'"
            :variant="channel === 'stable' ? 'solid' : 'subtle'"
            :loading="switchingChannel && channel !== 'stable'"
            :disabled="!isElectron"
            @click="switchChannel('stable')"
          >
            Stable
          </UButton>
          <UButton
            :color="channel === 'beta' ? 'primary' : 'neutral'"
            :variant="channel === 'beta' ? 'solid' : 'subtle'"
            :loading="switchingChannel && channel !== 'beta'"
            :disabled="!isElectron"
            @click="switchChannel('beta')"
          >
            Beta
          </UButton>
        </UButtonGroup>
      </div>

      <p class="text-xs text-muted">Updates are downloaded from GitHub Releases automatically.</p>
    </section>

    <!-- Game folder -->
    <section class="space-y-3 rounded-xl border border-default p-5">
      <h2 class="text-sm font-medium">Game folder</h2>
      <div v-if="store.game.value" class="flex items-center justify-between gap-3">
        <p class="font-mono text-sm break-all">{{ store.game.value.path }}</p>
        <UButton size="sm" color="neutral" variant="subtle" icon="i-lucide-folder-open" :disabled="!isElectron" @click="store.pickFolder">
          Change
        </UButton>
      </div>
      <div v-else class="flex items-center justify-between gap-3">
        <p class="text-sm text-muted">Not set.</p>
        <UButton size="sm" icon="i-lucide-folder-open" :disabled="!isElectron" @click="store.pickFolder">Choose folder</UButton>
      </div>
    </section>

    <!-- SMAPI -->
    <section class="space-y-3 rounded-xl border border-default p-5">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-medium">SMAPI (mod loader)</h2>
        <UBadge v-if="store.smapi.value?.installed" color="success" variant="subtle">
          Installed{{ smapiVersion ? ` · ${smapiVersion}` : "" }}
        </UBadge>
        <UBadge v-else color="error" variant="subtle">Not installed</UBadge>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-download"
          :loading="installingSmapi"
          :disabled="!isElectron || !store.game.value"
          @click="store.installSmapi()"
        >
          {{ store.smapi.value?.installed ? "Reinstall / update SMAPI" : "Install SMAPI" }}
        </UButton>
        <span v-if="!store.game.value" class="text-xs text-muted">Set your game folder first.</span>
      </div>
      <p class="text-xs text-muted">
        Downloads the official installer from smapi.io and runs it. Required to load mods.
      </p>
    </section>

    <!-- Nexus -->
    <section class="space-y-3 rounded-xl border border-default p-5">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-medium">Nexus Mods API key</h2>
        <UBadge
          v-if="store.state.settings?.nexusUser"
          :color="store.state.settings.nexusUser.isPremium ? 'primary' : 'neutral'"
          variant="subtle"
        >
          {{ store.state.settings.nexusUser.name }}{{ store.state.settings.nexusUser.isPremium ? " · Premium" : "" }}
        </UBadge>
      </div>
      <div class="flex items-center gap-2">
        <UInput
          v-model="nexusKeyInput"
          type="password"
          placeholder="Paste your personal API key"
          icon="i-lucide-key"
          class="flex-1"
          :disabled="!isElectron"
        />
        <UButton :loading="savingKey" :disabled="!isElectron" @click="saveKey">Save</UButton>
      </div>
      <p v-if="keyError" class="text-sm text-error">{{ keyError }}</p>
      <p class="text-xs text-muted">
        Find it under your Nexus account → API keys.
        <UButton variant="link" size="xs" class="px-0" @click="openUrl('https://www.nexusmods.com/users/myaccount?tab=api%20access')">
          Open API settings
        </UButton>
      </p>
      <UAlert
        icon="i-lucide-info"
        color="neutral"
        variant="soft"
        title="How downloads work"
        description="Free Nexus accounts start each download from the website's Mod Manager Download button (an nxm:// link this app handles). Premium accounts can also trigger downloads directly."
      />
    </section>

    <!-- CurseForge -->
    <section class="space-y-3 rounded-xl border border-default p-5">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-medium">CurseForge API key</h2>
        <UBadge v-if="store.state.settings?.hasCurseForgeApiKey" color="primary" variant="subtle">
          Connected
        </UBadge>
      </div>
      <div class="flex items-center gap-2">
        <UInput
          v-model="cfKeyInput"
          type="password"
          placeholder="Paste your CurseForge API key"
          icon="i-lucide-key"
          class="flex-1"
          :disabled="!isElectron"
        />
        <UButton :loading="savingCfKey" :disabled="!isElectron" @click="saveCfKey">Save</UButton>
      </div>
      <p v-if="cfKeyError" class="text-sm text-error">{{ cfKeyError }}</p>
      <p class="text-xs text-muted">
        Get a key from the CurseForge developer console.
        <UButton variant="link" size="xs" class="px-0" @click="openUrl('https://console.curseforge.com/')">
          Open CurseForge console
        </UButton>
      </p>
    </section>

    <!-- Community listings -->
    <section class="space-y-3 rounded-xl border border-default p-5">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-medium">Community listings</h2>
        <UBadge v-if="store.state.settings?.listingsUrl" color="primary" variant="subtle">Set</UBadge>
      </div>
      <p v-if="store.state.settings?.listingsUrl" class="truncate font-mono text-xs text-muted">
        {{ store.state.settings.listingsUrl }}
      </p>
      <div class="flex items-center gap-2">
        <UInput
          v-model="listingsInput"
          placeholder="https://raw.githubusercontent.com/…/listings.json"
          icon="i-lucide-github"
          class="flex-1"
          :disabled="!isElectron"
        />
        <UButton :loading="savingListings" :disabled="!isElectron" @click="saveListings">Save</UButton>
      </div>
      <p class="text-xs text-muted">
        A JSON index of mods, each pointing at a GitHub repo. The app installs from each mod's GitHub
        release — no mod files are hosted here, only the listing. Creators submit by PR to the index repo.
      </p>
    </section>
  </div>
</template>
