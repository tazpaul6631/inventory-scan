<script setup lang="ts">
import DatePicker from 'primevue/datepicker'

defineOptions({ inheritAttrs: false })
</script>

<template>
  <DatePicker v-bind="$attrs">
    <template v-for="(_, name) in $slots" :key="name" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps ?? {}" />
    </template>
  </DatePicker>
</template>
