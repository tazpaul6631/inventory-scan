<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import dayjs from 'dayjs'
import Dialog from '@/components/ui/AppDialog.vue'
import Button from '@/components/ui/AppButton.vue'
import { queryCycleGetOne } from '@/services/api/category'
import { readApiFailure } from '@/services/api/error'
import type { ViewCycle } from '@/types/api'

const props = defineProps<{
  cycleId?: number
}>()

const visible = defineModel<boolean>('visible', { default: false })
const { t } = useI18n()
const toast = useToast()
const loading = ref(false)
const cycle = ref<ViewCycle | null>(null)

function close() {
  visible.value = false
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('DD/MM/YYYY HH:mm:ss') : value
}

async function loadCycle(id: number) {
  loading.value = true
  cycle.value = null
  try {
    const res = await queryCycleGetOne(id)
    if (!res.data || res.success === false) {
      toast.add({
        severity: 'warn',
        summary: res.message || t('cycle.notFound'),
        life: 2500,
        closable: false,
      })
      close()
      return
    }
    cycle.value = res.data
  } catch (err) {
    toast.add({
      severity: 'warn',
      summary: readApiFailure(err) || t('cycle.loadError'),
      life: 2500,
      closable: false,
    })
    close()
  } finally {
    loading.value = false
  }
}

watch(visible, async (open) => {
  if (!open) {
    cycle.value = null
    return
  }
  if (props.cycleId == null) {
    toast.add({
      severity: 'warn',
      summary: t('cycle.notFound'),
      life: 2500,
      closable: false,
    })
    close()
    return
  }
  await loadCycle(props.cycleId)
})
</script>

<template>
  <Dialog v-model:visible="visible" dismissable-mask :header="t('cycle.viewTitle')"
    :style="{ width: 'min(420px, 96vw)' }">
    <div v-if="loading" class="flex justify-center py-6">
      <i class="pi pi-spinner pi-spin text-xl" />
    </div>
    <div v-else-if="cycle" class="grid gap-3">
      <div>
        <p class="m-0 text-sm text-muted">{{ t('cycle.code') }}</p>
        <p class="m-0 font-semibold text-ink">{{ cycle.code || '—' }}</p>
      </div>
      <!-- <div>
        <p class="m-0 text-sm text-muted">{{ t('cycle.status') }}</p>
        <p class="m-0 font-semibold text-ink">{{ cycle.status ?? '—' }}</p>
      </div> -->
      <div>
        <p class="m-0 text-sm text-muted">{{ t('cycle.scanDate') }}</p>
        <p class="m-0 font-semibold text-ink">{{ formatDate(cycle.scanDate) }}</p>
      </div>
      <div>
        <p class="m-0 text-sm text-muted">{{ t('cycle.description') }}</p>
        <p class="m-0 font-semibold text-ink">{{ cycle.description || '—' }}</p>
      </div>
      <div>
        <p class="m-0 text-sm text-muted">{{ t('cycle.createdAt') }}</p>
        <p class="m-0 font-semibold text-ink">{{ formatDate(cycle.createdAt) }}</p>
      </div>
      <div>
        <p class="m-0 text-sm text-muted">{{ t('cycle.updatedAt') }}</p>
        <p class="m-0 font-semibold text-ink">{{ formatDate(cycle.updatedAt) }}</p>
      </div>
    </div>
    <div class="mt-4 flex justify-end">
      <Button :label="t('common.ok')" size="large" :disabled="loading" @click="close" />
    </div>
  </Dialog>
</template>
