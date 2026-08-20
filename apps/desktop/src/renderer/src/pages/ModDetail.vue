<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { NexusModDetail } from "../../../shared/types";
import { useStore } from "../store";

const store = useStore();
const route = useRoute();
const router = useRouter();

const modId = computed(() => Number(route.params.id));
const mod = ref<NexusModDetail | null>(null);
const loading = ref(true);

const nexusUrl = computed(
  () => `https://www.nexusmods.com/stardewvalley/mods/${modId.value}`,
);

async function load(): Promise<void> {
  loading.value = true;
  mod.value = await store.getStoreMod(modId.value);
  loading.value = false;
}

function relativeTime(ts: number | null): string {
  if (!ts) return "—";
  const days = Math.floor((Date.now() / 1000 - ts) / 86400);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

function openNexus(): void {
  window.open(nexusUrl.value, "_blank", "noopener");
}

onMounted(load);
watch(modId, load);

const stats = computed(() => [
  { icon: "i-lucide-user", label: "Author", value: mod.value?.author ?? "—" },
  { icon: "i-lucide-thumbs-up", label: "Endorsements", value: (mod.value?.endorsements ?? 0).toLocaleString() },
  { icon: "i-lucide-tag", label: "Version", value: mod.value?.version ?? "—" },
]);
</script>

<template>
  <div class="space-y-5">
    <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" @click="router.push('/store')">
      Back to Store
    </UButton>

    <div v-if="loading" class="h-64 animate-pulse rounded-xl border border-default bg-elevated/40" />

    <template v-else-if="mod">
      <!-- Hero -->
      <div class="relative overflow-hidden rounded-xl border border-default">
        <img
          v-if="mod.pictureUrl"
          :src="mod.pictureUrl"
          :alt="mod.name"
          class="h-56 w-full object-cover"
        />
        <div v-else class="grid h-56 w-full place-items-center bg-elevated text-dimmed">
          <UIcon name="i-lucide-image" class="size-10" />
        </div>
        <div class="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 to-transparent p-6">
          <UBadge color="neutral" variant="solid" size="sm" class="w-fit">#{{ mod.modId }}</UBadge>
          <h1 class="mt-2 text-2xl font-bold text-white">{{ mod.name }}</h1>
          <p v-if="mod.summary" class="mt-1 max-w-2xl text-sm text-white/80">{{ mod.summary }}</p>
        </div>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div v-for="stat in stats" :key="stat.label" class="flex items-center gap-3 rounded-xl border border-default p-4">
          <div class="grid size-9 place-items-center rounded-lg bg-elevated text-muted">
            <UIcon :name="stat.icon" class="size-4.5" />
          </div>
          <div class="min-w-0">
            <div class="text-[11px] uppercase tracking-wide text-muted">{{ stat.label }}</div>
            <div class="truncate font-medium">{{ stat.value }}</div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div class="rounded-xl border border-default p-4">
          <div class="text-[11px] uppercase tracking-wide text-muted">Published</div>
          <div class="font-medium">{{ relativeTime(mod.createdTimestamp) }}</div>
        </div>
        <div class="rounded-xl border border-default p-4">
          <div class="text-[11px] uppercase tracking-wide text-muted">Last updated</div>
          <div class="font-medium">{{ relativeTime(mod.updatedTimestamp) }}</div>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <UButton variant="link" class="px-0" trailing-icon="i-lucide-external-link" @click="openNexus">
          View on Nexus
        </UButton>
        <UButton
          icon="i-lucide-download"
          :disabled="!store.game.value"
          @click="store.installStoreMod(mod.modId)"
        >
          Download &amp; install
        </UButton>
      </div>

      <UAlert
        icon="i-lucide-info"
        color="neutral"
        variant="soft"
        title="Download note"
        description="Direct download works for Nexus Premium accounts. Free accounts should use View on Nexus → Mod Manager Download, which this app catches via the nxm:// handler."
      />
    </template>

    <div v-else class="rounded-xl border border-default py-10 text-center text-sm text-muted">
      Couldn't load this mod.
    </div>
  </div>
</template>
