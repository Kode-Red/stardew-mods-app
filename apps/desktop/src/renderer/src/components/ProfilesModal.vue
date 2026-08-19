<script setup lang="ts">
import { ref } from "vue";
import { useStore } from "../store";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();

const store = useStore();
const newName = ref("");
const editingId = ref<string | null>(null);
const editName = ref("");

async function create(): Promise<void> {
  const name = newName.value.trim();
  if (!name) return;
  await store.createProfile(name);
  newName.value = "";
}

function startEdit(id: string, name: string): void {
  editingId.value = id;
  editName.value = name;
}

async function commitEdit(): Promise<void> {
  if (editingId.value) await store.renameProfile(editingId.value, editName.value);
  editingId.value = null;
}
</script>

<template>
  <UModal :open="open" title="Profiles" @update:open="emit('update:open', $event)">
    <template #body>
      <div class="space-y-4">
        <ul class="divide-y divide-default rounded-lg border border-default">
          <li
            v-for="profile in store.state.profiles.profiles"
            :key="profile.id"
            class="flex items-center gap-3 px-3 py-2.5"
          >
            <UIcon
              :name="profile.id === store.state.profiles.activeId ? 'i-lucide-circle-check' : 'i-lucide-circle'"
              class="size-4 shrink-0"
              :class="profile.id === store.state.profiles.activeId ? 'text-primary' : 'text-dimmed'"
            />
            <template v-if="editingId === profile.id">
              <UInput v-model="editName" size="sm" class="flex-1" @keyup.enter="commitEdit" />
              <UButton size="sm" color="primary" variant="ghost" icon="i-lucide-check" @click="commitEdit" />
            </template>
            <template v-else>
              <button
                class="flex-1 text-left text-sm font-medium hover:text-primary"
                @click="store.activateProfile(profile.id)"
              >
                {{ profile.name }}
              </button>
              <span class="text-xs text-muted">{{ profile.enabled.length }} mods</span>
              <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-pencil" @click="startEdit(profile.id, profile.name)" />
              <UButton
                size="sm"
                color="error"
                variant="ghost"
                icon="i-lucide-trash-2"
                :disabled="store.state.profiles.profiles.length <= 1"
                @click="store.deleteProfile(profile.id)"
              />
            </template>
          </li>
        </ul>

        <div class="flex items-center gap-2">
          <UInput
            v-model="newName"
            placeholder="New profile name"
            class="flex-1"
            @keyup.enter="create"
          />
          <UButton icon="i-lucide-plus" :disabled="!newName.trim()" @click="create">Add</UButton>
        </div>
        <p class="text-xs text-muted">
          A new profile captures your currently-enabled mods. Switching a profile enables/disables
          mods on disk to match it.
        </p>
      </div>
    </template>
  </UModal>
</template>
