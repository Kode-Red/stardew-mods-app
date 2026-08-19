<script setup lang="ts">
// Placeholder for a future download queue / history view.
</script>

<template>
  <div class="space-y-4">
    <div>
      <h1 class="text-2xl font-semibold">Downloads</h1>
      <p class="text-sm text-muted">Download queue and history.</p>
    </div>
    <div class="flex flex-col items-center gap-2 rounded-xl border border-dashed border-default py-16 text-center">
      <UIcon name="i-lucide-download" class="size-8 text-dimmed" />
      <p class="text-sm text-muted">A download queue lands here soon.</p>
      <p class="text-xs text-dimmed">For now, installs happen instantly via Nexus links or "Install from file".</p>
    </div>
  </div>
</template>
