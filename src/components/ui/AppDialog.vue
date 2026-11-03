<script setup lang="ts">
import Dialog from 'primevue/dialog'

defineOptions({ inheritAttrs: false })
</script>

<template>
  <Dialog modal v-bind="$attrs" :closable="false">
    <template v-for="(_, name) in $slots" :key="name" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps ?? {}" />
    </template>
  </Dialog>
</template>
