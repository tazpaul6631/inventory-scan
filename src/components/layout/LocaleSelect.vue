<script setup lang="ts">
import { ref } from 'vue'
import Select from '@/components/ui/AppSelect.vue'
import FloatLabel from '@/components/ui/AppFloatLabel.vue'
import { useI18n } from 'vue-i18n'
import { applyLocale, localeMeta, SUPPORTED_LOCALES, type AppLocale } from '@/i18n'
import { useSettingsStore } from '@/stores/settings'

const { compact } = defineProps<{ compact?: boolean }>()

const { t } = useI18n()
const { locale } = useI18n()
const settings = useSettingsStore()
const select = ref<{ hide?: () => void }>()

defineExpose({
  hide: () => select.value?.hide?.(),
})

async function change(code: AppLocale) {
  applyLocale(code)
  await settings.update({ locale: code })
}
</script>

<template>
  <FloatLabel variant="on" class="locale-select" :class="{ compact }">
    <Select ref="select" class="w-full" input-id="locale-select" v-model="locale" :options="[...SUPPORTED_LOCALES]"
      option-label="label" option-value="code" :aria-label="$t('common.language')" @update:model-value="change">
      <template #value="slotProps">
        <span v-if="slotProps.value" class="locale-option">
          <img :src="localeMeta(slotProps.value).flag" alt="" />
          <span v-if="!compact">{{ localeMeta(slotProps.value).label }}</span>
        </span>
        <span v-else>{{ t('common.language') }}</span>
      </template>
      <template #option="slotProps">
        <span class="locale-option">
          <img :src="slotProps.option.flag" alt="" />
          <span>{{ slotProps.option.label }}</span>
        </span>
      </template>
    </Select>
    <label v-if="!compact" for="locale-select">{{ t('settings.locale') }}</label>
  </FloatLabel>
</template>
