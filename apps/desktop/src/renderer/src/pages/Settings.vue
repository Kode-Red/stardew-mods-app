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
