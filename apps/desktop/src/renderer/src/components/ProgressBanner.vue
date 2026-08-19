<script setup lang="ts">
import { computed } from "vue";
import { useStore } from "../store";

const store = useStore();
const progress = computed(() => store.state.progress);

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const percent = computed(() => {
  const p = progress.value;
  if (p?.phase !== "downloading" || !p.totalBytes || !p.receivedBytes) return null;
  return Math.round((p.receivedBytes / p.totalBytes) * 100);
});
</script>

<template>
  <div v-if="progress" class="space-y-2 rounded-lg border border-default bg-elevated/40 p-3">
    <div class="flex items-center gap-3">
      <UIcon
        :name="progress.phase === 'done' ? 'i-lucide-circle-check' : progress.phase === 'error' ? 'i-lucide-circle-x' : 'i-lucide-loader-circle'"
        class="size-5 shrink-0"
        :class="progress.phase === 'done' ? 'text-success' : progress.phase === 'error' ? 'text-error' : 'text-primary animate-spin'"
      />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium capitalize">
          {{ progress.phase === "done" ? "Installed" : progress.phase }}
        </p>
        <p v-if="progress.phase === 'error'" class="text-sm text-error">{{ progress.error }}</p>
        <p v-else-if="progress.phase === 'done' && progress.installed?.length" class="text-sm text-muted">
          {{ progress.installed.map((m) => m.name ?? m.installName).join(", ") }}
        </p>
        <p v-else-if="progress.receivedBytes" class="text-xs text-muted">
          {{ formatBytes(progress.receivedBytes) }}
          <span v-if="progress.totalBytes"> / {{ formatBytes(progress.totalBytes) }}</span>
        </p>
        <p v-else-if="progress.label" class="truncate text-xs text-muted">{{ progress.label }}</p>
      </div>
      <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" @click="store.state.progress = null" />
    </div>
    <div v-if="percent !== null" class="h-1.5 w-full overflow-hidden rounded-full bg-default">
      <div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${percent}%` }" />
    </div>
  </div>
</template>
