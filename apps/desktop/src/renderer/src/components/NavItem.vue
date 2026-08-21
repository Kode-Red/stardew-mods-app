<script setup lang="ts">
defineProps<{
  to: string;
  icon: string;
  label: string;
  badge?: number;
  collapsed?: boolean;
}>();
</script>

<template>
  <RouterLink v-slot="{ isActive, navigate }" :to="to" custom>
    <button
      class="relative flex w-full items-center gap-3 rounded-lg py-2 text-sm transition-colors"
      :class="[
        isActive
          ? 'bg-primary/10 font-medium text-primary'
          : 'text-muted hover:bg-elevated hover:text-default',
        collapsed ? 'justify-center px-0' : 'px-3',
      ]"
      :title="collapsed ? label : undefined"
      @click="navigate"
    >
      <span v-if="isActive" class="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />
      <UIcon :name="icon" class="size-4.5 shrink-0" />
      <template v-if="!collapsed">
        <span class="flex-1 truncate text-left">{{ label }}</span>
        <UBadge v-if="badge" color="neutral" variant="subtle" size="sm">{{ badge }}</UBadge>
      </template>
    </button>
  </RouterLink>
</template>
