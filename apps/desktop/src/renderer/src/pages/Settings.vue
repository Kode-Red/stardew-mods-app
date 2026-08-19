<script setup lang="ts">
import { ref } from "vue";
import { isElectron, useStore } from "../store";

const store = useStore();
const nexusKeyInput = ref("");
const savingKey = ref(false);
const keyError = ref<string | null>(null);

async function saveKey(): Promise<void> {
  savingKey.value = true;
  keyError.value = null;
  const ok = await store.saveNexusKey(nexusKeyInput.value);
  if (ok) nexusKeyInput.value = "";
  else if (store.state.error) keyError.value = store.state.error;
  savingKey.value = false;
}

function openUrl(url: string): void {
  window.open(url, "_blank", "noopener");
}
</script>

<template>
  <div class="max-w-2xl space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">Settings</h1>
      <p class="text-sm text-muted">Game location and mod sources.</p>
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
  </div>
</template>
