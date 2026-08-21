<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import type {
  CurseforgeModSummary,
  ModListingUi,
  NexusBrowseKind,
  NexusModSummary,
} from "../../../shared/types";
import { isElectron, useStore } from "../store";

const store = useStore();
const router = useRouter();

type Source = "nexus" | "curseforge" | "community";
const source = ref<Source>("nexus");
const sourceLabels: Record<Source, string> = { nexus: "Nexus", curseforge: "CurseForge", community: "Community" };

// Nexus browse
const nexusTabs: { key: NexusBrowseKind; label: string }[] = [
  { key: "trending", label: "Trending" },
  { key: "latest_added", label: "Latest" },
  { key: "latest_updated", label: "Recently updated" },
];
const nexusTab = ref<NexusBrowseKind>("trending");
const nexusMods = ref<NexusModSummary[]>([]);
const nexusLoading = ref(false);

const hasNexusKey = computed(() => !!store.state.settings?.hasNexusApiKey);
const hasCfKey = computed(() => !!store.state.settings?.hasCurseForgeApiKey);

async function loadNexus(kind: NexusBrowseKind): Promise<void> {
  nexusTab.value = kind;
  if (!isElectron || !hasNexusKey.value) return;
  nexusLoading.value = true;
  nexusMods.value = await store.browseStore(kind);
  nexusLoading.value = false;
}

// CurseForge search
const query = ref("");
const cfMods = ref<CurseforgeModSummary[]>([]);
const cfLoading = ref(false);
const cfSearched = ref(false);

async function runSearch(): Promise<void> {
  if (!query.value.trim() || !hasCfKey.value) return;
  cfLoading.value = true;
  cfSearched.value = true;
  cfMods.value = await store.searchStore(query.value.trim());
  cfLoading.value = false;
}

// Community listings (GitHub-hosted metadata; files stay on GitHub)
const listings = ref<ModListingUi[]>([]);
const listingsLoading = ref(false);
const listingsLoaded = ref(false);
const hasListingsUrl = computed(() => !!store.state.settings?.listingsUrl);

async function loadListings(): Promise<void> {
  if (!isElectron || !hasListingsUrl.value) return;
  listingsLoading.value = true;
  listings.value = await store.fetchListings();
  listingsLoaded.value = true;
  listingsLoading.value = false;
}

function selectSource(s: Source): void {
  source.value = s;
  if (s === "community" && !listingsLoaded.value) void loadListings();
}

function openUrl(url: string): void {
  window.open(url, "_blank", "noopener");
}

onMounted(() => loadNexus("trending"));
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Mods Store</h1>
        <p class="text-sm text-muted">Discover Stardew Valley mods.</p>
      </div>
      <div class="flex gap-1 rounded-lg border border-default p-1">
        <button
          v-for="s in (['nexus', 'curseforge', 'community'] as Source[])"
          :key="s"
          class="rounded-md px-3 py-1.5 text-sm transition-colors"
          :class="source === s ? 'bg-primary/10 font-medium text-primary' : 'text-muted hover:text-default'"
          @click="selectSource(s)"
        >
          {{ sourceLabels[s] }}
        </button>
      </div>
    </div>

    <!-- Nexus -->
    <template v-if="source === 'nexus'">
      <div v-if="!hasNexusKey" class="flex flex-col items-center gap-3 rounded-xl border border-default py-10 text-center">
        <UIcon name="i-lucide-key-round" class="size-8 text-muted" />
        <p class="text-sm text-muted">Add your Nexus API key to browse.</p>
        <UButton icon="i-lucide-settings" @click="router.push('/settings')">Open Settings</UButton>
      </div>

      <template v-else>
        <div class="flex gap-1 rounded-lg border border-default p-1">
          <button
            v-for="tab in nexusTabs"
            :key="tab.key"
            class="flex-1 rounded-md px-3 py-1.5 text-sm transition-colors"
            :class="nexusTab === tab.key ? 'bg-primary/10 font-medium text-primary' : 'text-muted hover:text-default'"
            @click="loadNexus(tab.key)"
          >
            {{ tab.label }}
          </button>
        </div>

        <div v-if="nexusLoading" class="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div v-for="n in 6" :key="n" class="h-56 animate-pulse rounded-xl border border-default bg-elevated/40" />
        </div>
        <div v-else-if="nexusMods.length" class="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <button
            v-for="mod in nexusMods"
            :key="mod.modId"
            class="group overflow-hidden rounded-xl border border-default text-left transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg hover:shadow-black/5"
            @click="router.push(`/store/${mod.modId}`)"
          >
            <div class="aspect-video overflow-hidden bg-elevated">
              <img v-if="mod.pictureUrl" :src="mod.pictureUrl" :alt="mod.name" class="size-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
              <div v-else class="grid size-full place-items-center text-dimmed"><UIcon name="i-lucide-image" class="size-8" /></div>
            </div>
            <div class="space-y-1 p-3">
              <p class="truncate font-medium">{{ mod.name }}</p>
              <p v-if="mod.author" class="truncate text-xs text-muted">by {{ mod.author }}</p>
              <div class="flex items-center gap-1 pt-1 text-xs text-muted">
                <UIcon name="i-lucide-thumbs-up" class="size-3.5" />{{ mod.endorsements.toLocaleString() }}
              </div>
            </div>
          </button>
        </div>
        <div v-else class="rounded-xl border border-default py-10 text-center text-sm text-muted">Nothing to show.</div>
      </template>
    </template>

    <!-- CurseForge -->
    <template v-else-if="source === 'curseforge'">
      <div v-if="!hasCfKey" class="flex flex-col items-center gap-3 rounded-xl border border-default py-10 text-center">
        <UIcon name="i-lucide-key-round" class="size-8 text-muted" />
        <p class="text-sm text-muted">Add your CurseForge API key to search.</p>
        <UButton icon="i-lucide-settings" @click="router.push('/settings')">Open Settings</UButton>
      </div>

      <template v-else>
        <div class="flex gap-2">
          <UInput v-model="query" placeholder="Search CurseForge…" icon="i-lucide-search" class="flex-1" @keyup.enter="runSearch" />
          <UButton icon="i-lucide-search" :loading="cfLoading" @click="runSearch">Search</UButton>
        </div>

        <div v-if="cfLoading" class="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div v-for="n in 6" :key="n" class="h-56 animate-pulse rounded-xl border border-default bg-elevated/40" />
        </div>
        <div v-else-if="cfMods.length" class="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div v-for="mod in cfMods" :key="mod.modId" class="flex flex-col overflow-hidden rounded-xl border border-default">
            <div class="aspect-video overflow-hidden bg-elevated">
              <img v-if="mod.logoUrl" :src="mod.logoUrl" :alt="mod.name" class="size-full object-cover" loading="lazy" />
              <div v-else class="grid size-full place-items-center text-dimmed"><UIcon name="i-lucide-image" class="size-8" /></div>
            </div>
            <div class="flex flex-1 flex-col gap-1 p-3">
              <p class="truncate font-medium">{{ mod.name }}</p>
              <p v-if="mod.author" class="truncate text-xs text-muted">by {{ mod.author }}</p>
              <div class="flex items-center gap-1 text-xs text-muted">
                <UIcon name="i-lucide-download" class="size-3.5" />{{ mod.downloads.toLocaleString() }}
              </div>
              <div class="mt-2 flex items-center gap-2">
                <UButton
                  v-if="mod.allowDistribution !== false"
                  size="xs"
                  icon="i-lucide-download"
                  :disabled="!store.game.value"
                  @click="store.installCurseforgeMod(mod.modId, mod.primaryFileId)"
                >
                  Install
                </UButton>
                <UButton
                  v-else
                  size="xs"
                  color="neutral"
                  variant="subtle"
                  icon="i-lucide-external-link"
                  @click="mod.websiteUrl && openUrl(mod.websiteUrl)"
                >
                  On CurseForge
                </UButton>
                <UButton
                  v-if="mod.websiteUrl"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-external-link"
                  @click="openUrl(mod.websiteUrl)"
                />
              </div>
            </div>
          </div>
        </div>
        <div v-else-if="cfSearched" class="rounded-xl border border-default py-10 text-center text-sm text-muted">No results.</div>
        <div v-else class="rounded-xl border border-default py-10 text-center text-sm text-muted">Search for a mod to get started.</div>
      </template>
    </template>

    <!-- Community (GitHub-hosted listings) -->
    <template v-else>
      <div v-if="!hasListingsUrl" class="flex flex-col items-center gap-3 rounded-xl border border-default py-10 text-center">
        <UIcon name="i-lucide-github" class="size-8 text-muted" />
        <div>
          <p class="text-sm font-medium">Community listings</p>
          <p class="mt-1 max-w-md text-sm text-muted">
            A curated directory where each mod is hosted on the creator's GitHub — we list, GitHub
            hosts the files. Add a listings URL to browse it.
          </p>
        </div>
        <UButton icon="i-lucide-settings" @click="router.push('/settings')">Add listings URL</UButton>
      </div>

      <template v-else>
        <div class="flex items-center justify-between">
          <p class="text-sm text-muted">Installs from each mod's GitHub release — no files hosted here.</p>
          <UButton icon="i-lucide-refresh-cw" size="xs" color="neutral" variant="ghost" :loading="listingsLoading" @click="loadListings">
            Refresh
          </UButton>
        </div>

        <div v-if="listingsLoading" class="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div v-for="n in 6" :key="n" class="h-48 animate-pulse rounded-xl border border-default bg-elevated/40" />
        </div>
        <div v-else-if="listings.length" class="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div v-for="mod in listings" :key="mod.githubRepo" class="flex flex-col overflow-hidden rounded-xl border border-default">
            <div class="aspect-video overflow-hidden bg-elevated">
              <img v-if="mod.imageUrl" :src="mod.imageUrl" :alt="mod.name" class="size-full object-cover" loading="lazy" />
              <div v-else class="grid size-full place-items-center text-dimmed"><UIcon name="i-lucide-github" class="size-8" /></div>
            </div>
            <div class="flex flex-1 flex-col gap-1 p-3">
              <p class="truncate font-medium">{{ mod.name }}</p>
              <p v-if="mod.author" class="truncate text-xs text-muted">by {{ mod.author }}</p>
              <p v-if="mod.summary" class="line-clamp-2 text-xs text-muted">{{ mod.summary }}</p>
              <div class="mt-2 flex items-center gap-2">
                <UButton size="xs" icon="i-lucide-download" :disabled="!store.game.value" @click="store.installListing(mod.githubRepo)">
                  Install
                </UButton>
                <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-external-link" @click="openUrl(`https://github.com/${mod.githubRepo}`)" />
              </div>
            </div>
          </div>
        </div>
        <div v-else class="rounded-xl border border-default py-10 text-center text-sm text-muted">No listings found.</div>
      </template>
    </template>
  </div>
</template>
