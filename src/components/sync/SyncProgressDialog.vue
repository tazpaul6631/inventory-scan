<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ProgressBar from 'primevue/progressbar'
import Dialog from '@/components/ui/AppDialog.vue'
import Button from '@/components/ui/AppButton.vue'
import {
  STEP_ETA_SEC,
  useWebCategorySync,
  type SyncItemProgress,
  type SyncTableKey,
} from '@/composables/useWebCategorySync'

const emit = defineEmits<{
  finished: []
}>()

const { t } = useI18n()
const { list, phase, dialogVisible, overallPercent, busy, retry, closeDialog } = useWebCategorySync()

const barClass: Record<SyncTableKey, string> = {
  factories: 'bg-lime-300!',
  warehouses: 'bg-cyan-300!',
  positions: 'bg-violet-300!',
  assetInfos: 'bg-emerald-200!',
  organizations: 'bg-pink-300!',
  assetInfoScans: 'bg-rose-300!',
}

/** Forces timeLabel to recompute when step % updates between render cycles. */
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

function stopTimer() {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

function ensureTimer() {
  if (timer) return
  now.value = Date.now()
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
}

function formatCountdown(remainingSec: number) {
  const minutes = Math.floor(remainingSec / 60)
  const seconds = remainingSec % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function stepRemainingSec(item: SyncItemProgress) {
  const budget = STEP_ETA_SEC[item.key]
  if (item.state === 'done') return 0
  if (item.state === 'loading') {
    return Math.round((budget * (100 - item.percent)) / 100)
  }
  return budget
}

watch(
  phase,
  (next) => {
    if (next === 'running') {
      ensureTimer()
      return
    }
    stopTimer()
  },
  { immediate: true },
)

onBeforeUnmount(stopTimer)

const canClose = computed(() => phase.value !== 'running')

const phaseText = computed(() => {
  if (phase.value === 'running') return t('syncProgress.phaseRunning')
  if (phase.value === 'finished') return t('syncProgress.phaseFinished')
  if (phase.value === 'error') return t('syncProgress.phaseError')
  return t('syncProgress.phaseIdle')
})

const remainingSec = computed(() => {
  void now.value
  return Math.max(
    0,
    list.value.reduce((acc, item) => acc + stepRemainingSec(item), 0),
  )
})

const timeLabel = computed(() => {
  const pct = overallPercent.value
  if (phase.value !== 'running') return `${pct}%`
  if (remainingSec.value === 0) return t('syncProgress.almostDone', { percent: pct })
  return t('syncProgress.overallLabel', {
    percent: pct,
    time: formatCountdown(remainingSec.value),
  })
})

function onClose() {
  const wasFinished = phase.value === 'finished'
  closeDialog()
  if (wasFinished) emit('finished')
}
</script>

<template>
  <Dialog v-model:visible="dialogVisible" modal :closable="canClose" :dismissable-mask="canClose"
    :close-on-escape="canClose" :header="t('syncProgress.title')" :style="{ width: 'min(440px, 96vw)' }">
    <p class="m-0 mb-3 text-sl text-muted">{{ phaseText }}</p>

    <div class="mb-5">
      <div class="mb-2 flex items-baseline justify-between text-sm">
        <span class="font-medium">{{ t('syncProgress.overall') }}</span>
        <span class="tabular-nums">{{ timeLabel }}</span>
      </div>
      <ProgressBar :value="overallPercent" :showValue="false" :pt="{
        root: 'h-3! rounded-full!',
        value: (phase === 'error' ? 'bg-red-400!' : 'bg-lime-500!') + ' rounded-full!',
      }" />
    </div>

    <ul class="m-0 flex list-none flex-col gap-5 p-0">
      <li v-for="item in list" :key="item.key">
        <div class="mb-1.5 flex items-center justify-between gap-2 text-sm">
          <span class="font-medium text-sm text-ink font-bold">{{ item.label }}</span>
          <span class="tabular-nums" :class="item.state === 'error' ? 'text-red-600' : 'text-muted'">
            {{ item.state === 'done' ? t('syncProgress.done') : item.state === 'loading' ? item.detail : item.state ===
              'error' ? item.error : t('syncProgress.running') }}
          </span>
        </div>
        <ProgressBar :mode="item.state === 'loading' ? 'indeterminate' : 'determinate'" :value="item.percent"
          :showValue="false"
          :pt="{ root: 'h-2.5! rounded-full!', value: (item.state === 'error' ? 'bg-red-400!' : item.state === 'pending' ? 'bg-amber-200!' : barClass[item.key]) + ' rounded-full!' }" />
        <div v-if="item.state === 'error'" class="mt-2 flex items-start justify-between gap-3">
          <p class="m-0 text-xs text-red-600">{{ item.error }}</p>
          <Button :label="t('syncProgress.retry')" size="large" severity="danger" outlined class="shrink-0"
            :disabled="busy" @click="retry(item.key)" />
        </div>
      </li>
    </ul>

    <div class="mt-4 flex justify-end">
      <Button :label="t('common.cancel')" size="large" :disabled="!canClose" :raised="false" text severity="secondary"
        @click="onClose" />
    </div>
  </Dialog>
</template>
