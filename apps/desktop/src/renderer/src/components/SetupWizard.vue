<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useStore } from "../store";

const store = useStore();
const router = useRouter();

const step = ref(1);
const steps = ["Game", "SMAPI", "Ready"];

const smapiVersion = computed(() => (store.smapi.value?.version ?? "").split("+")[0]);
const busy = computed(() => {
  const p = store.state.progress;
  return !!p && ["resolving", "downloading", "installing"].includes(p.phase);
});

const canAdvance = computed(() => {
  if (step.value === 1) return !!store.game.value;
  if (step.value === 2) return !!store.smapi.value?.installed;
  return true;
});

function next(): void {
  if (step.value < 3) step.value += 1;
}
function back(): void {
  if (step.value > 1) step.value -= 1;
}
function finish(): void {
  store.state.setupOpen = false;
  step.value = 1;
  void router.push("/mods");
}
</script>

<template>
  <UModal
    :open="store.state.setupOpen"
    title="Set up Stardew Mods"
    :dismissible="false"
    @update:open="(v: boolean) => (store.state.setupOpen = v)"
  >
    <template #body>
      <div class="space-y-5">
        <!-- Stepper -->
        <div class="flex items-center gap-2">
          <template v-for="(label, i) in steps" :key="label">
            <div class="flex items-center gap-2">
              <div
                class="grid size-6 place-items-center rounded-full text-xs font-medium"
                :class="step > i + 1 ? 'bg-primary text-inverted' : step === i + 1 ? 'bg-primary/15 text-primary ring-1 ring-primary' : 'bg-elevated text-dimmed'"
              >
                <UIcon v-if="step > i + 1" name="i-lucide-check" class="size-3.5" />
                <span v-else>{{ i + 1 }}</span>
              </div>
              <span class="text-sm" :class="step === i + 1 ? 'font-medium' : 'text-muted'">{{ label }}</span>
            </div>
            <div v-if="i < steps.length - 1" class="h-px flex-1 bg-default" />
          </template>
        </div>

        <!-- Step 1: game -->
        <div v-if="step === 1" class="space-y-3">
          <p class="text-sm text-muted">First, point the app at your Stardew Valley folder.</p>
          <div v-if="store.game.value" class="flex items-center gap-2 rounded-lg border border-default p-3">
            <UIcon name="i-lucide-circle-check" class="size-5 shrink-0 text-success" />
            <div class="min-w-0">
              <p class="text-sm font-medium">Found your game</p>
              <p class="truncate font-mono text-xs text-muted">{{ store.game.value.path }}</p>
            </div>
          </div>
          <div v-else class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-default py-6 text-center">
            <UIcon name="i-lucide-folder-search" class="size-7 text-muted" />
            <p class="text-sm text-muted">Couldn't auto-detect it. Choose the folder with "Stardew Valley.exe".</p>
            <UButton icon="i-lucide-folder-open" @click="store.pickFolder">Choose game folder</UButton>
          </div>
        </div>

        <!-- Step 2: SMAPI -->
        <div v-else-if="step === 2" class="space-y-3">
          <p class="text-sm text-muted">SMAPI is the mod loader Stardew mods need to run.</p>
          <div v-if="store.smapi.value?.installed" class="flex items-center gap-2 rounded-lg border border-default p-3">
            <UIcon name="i-lucide-circle-check" class="size-5 shrink-0 text-success" />
            <p class="text-sm font-medium">SMAPI {{ smapiVersion }} is installed</p>
          </div>
          <div v-else class="space-y-3 rounded-lg border border-dashed border-default p-4 text-center">
            <UIcon name="i-lucide-download" class="mx-auto size-7 text-muted" />
            <p class="text-sm text-muted">SMAPI isn't installed. Get the latest official version.</p>
            <UButton icon="i-lucide-download" :loading="busy" @click="store.installSmapi()">Install SMAPI</UButton>
            <p v-if="store.state.progress && !store.game.value" class="text-xs text-error">Set your game folder first.</p>
            <p v-else-if="busy && store.state.progress?.label" class="text-xs text-muted">{{ store.state.progress.label }}</p>
            <p v-else-if="store.state.progress?.phase === 'error'" class="text-xs text-error">{{ store.state.progress.error }}</p>
          </div>
          <p class="text-xs text-dimmed">
            Downloads the official installer from smapi.io and runs it. If it can't finish
            automatically, it opens the installer folder for you.
          </p>
        </div>

        <!-- Step 3: done -->
        <div v-else class="space-y-3 py-2 text-center">
          <UIcon name="i-lucide-party-popper" class="mx-auto size-8 text-primary" />
          <p class="font-medium">You're all set!</p>
          <p class="text-sm text-muted">
            Install mods from the Store or a local zip, organize them into folders, and launch modded
            from the top bar.
          </p>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <UButton color="neutral" variant="ghost" @click="store.state.setupOpen = false">Skip</UButton>
        <div class="flex gap-2">
          <UButton v-if="step > 1" color="neutral" variant="subtle" @click="back">Back</UButton>
          <UButton v-if="step < 3" :disabled="!canAdvance" @click="next">Next</UButton>
          <UButton v-else icon="i-lucide-package" @click="finish">Open Mods Library</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
