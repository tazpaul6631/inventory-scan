<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ProgressBar from 'primevue/progressbar'
import Dialog from '@/components/ui/AppDialog.vue'
import Button from '@/components/ui/AppButton.vue'
import { useOfflineScanCommandSync } from '@/composables/useOfflineScanCommandSync'
import { speakImportantText, ttsLangFromLocale } from '@/utils/speakImportantText'

const emit = defineEmits<{
  finished: []
  readyForLogout: []
}>()

const { t, locale } = useI18n()
const {
  dialogVisible,
  phase,
  stepList,
  total,
  done,
  failed,
  percent,
  busy,
  lastError,
  logoutGateActive,
  retryFailed,
  closeDialog,
} = useOfflineScanCommandSync()

const continueCountdown = ref(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null

const canClose = computed(() => phase.value !== 'running')
const canDismiss = computed(() => canClose.value)

const phaseText = computed(() => {
  if (logoutGateActive.value && phase.value === 'finished') {
    return t('auth.logoutSyncDone', { seconds: continueCountdown.value })
  }
  if (lastError.value === 'offline' && phase.value === 'error') return t('scan.syncOffline')
  if (phase.value === 'running') return t('scan.syncPhaseRunning')
  if (phase.value === 'finished') return t('scan.syncPhaseFinished')
  if (phase.value === 'error') {
    return logoutGateActive.value ? t('auth.logoutNeedSync') : t('scan.syncPhaseError')
  }
  return t('scan.syncPhaseIdle')
})

const countLabel = computed(() =>
  t('scan.syncProgress', { done: done.value, total: total.value, failed: failed.value }),
)

const showRetry = computed(
  () => phase.value === 'error' && failed.value > 0 && lastError.value !== 'offline',
)

const showContinueLogout = computed(
  () => logoutGateActive.value && phase.value === 'finished',
)

function stepStatusLabel(state: string) {
  if (state === 'done') return t('offlineDownload.done')
  if (state === 'loading') return t('offlineDownload.running')
  if (state === 'error') return t('offlineDownload.error')
  if (state === 'skipped') return t('scan.syncStepSkipped')
  return t('offlineDownload.waiting')
}

function clearCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
  continueCountdown.value = 0
}

function finishLogoutGate() {
  clearCountdown()
  closeDialog()
  emit('readyForLogout')
}

/** Close without logging out (cancel during countdown / error). */
function cancelLogoutGate() {
  clearCountdown()
  closeDialog()
  emit('finished')
}

function startContinueCountdown() {
  clearCountdown()
  continueCountdown.value = 10
  countdownTimer = setInterval(() => {
    continueCountdown.value -= 1
    if (continueCountdown.value <= 0) {
      finishLogoutGate()
    }
  }, 1000)
}

watch(phase, (next) => {
  if (!logoutGateActive.value) return
  if (next === 'finished') {
    void speakImportantText(
      t('auth.logoutSyncDoneTts'),
      ttsLangFromLocale(String(locale.value)),
    )
    startContinueCountdown()
    return
  }
  if (next === 'error') {
    clearCountdown()
    void speakImportantText(
      t('auth.logoutNeedSyncTts'),
      ttsLangFromLocale(String(locale.value)),
    )
  }
})

watch(logoutGateActive, (active) => {
  if (active && phase.value !== 'finished') {
    void speakImportantText(
      t('auth.logoutNeedSyncTts'),
      ttsLangFromLocale(String(locale.value)),
    )
  }
  if (!active) clearCountdown()
})

onBeforeUnmount(clearCountdown)

function onClose() {
  // Closing during logout countdown / gate cancels logout — stay logged in.
  if (logoutGateActive.value) {
    cancelLogoutGate()
    return
  }
  const wasFinished = phase.value === 'finished'
  clearCountdown()
  closeDialog()
  if (wasFinished) emit('finished')
}

function onContinue() {
  finishLogoutGate()
}
</script>

<template>
  <Dialog v-model:visible="dialogVisible" modal :closable="canDismiss" :dismissable-mask="canDismiss"
    :close-on-escape="canDismiss" :header="t('scan.syncTitle')" :style="{ width: 'min(420px, 96vw)' }">
    <p class="m-0 mb-3 text-sm text-muted">{{ phaseText }}</p>

    <div class="mb-4">
      <div class="mb-2 flex items-baseline justify-between gap-2 text-sm">
        <span class="font-medium">{{ t('scan.syncOverall') }}</span>
        <span class="tabular-nums">{{ percent }}%</span>
      </div>
      <ProgressBar :value="percent" :showValue="false" :pt="{
        root: 'h-3! rounded-full!',
        value: (phase === 'error' ? 'bg-red-400!' : 'bg-lime-500!') + ' rounded-full!',
      }" />
    </div>

    <ul class="m-0 mb-3 flex list-none flex-col gap-4 p-0">
      <li v-for="step in stepList" :key="step.key">
        <div class="mb-1.5 flex items-center justify-between gap-2 text-sm">
          <span class="font-medium">{{ step.label }}</span>
          <span class="tabular-nums text-right" :class="step.state === 'error' ? 'text-red-600' : 'text-muted'">
            {{ stepStatusLabel(step.state) }}
            <template v-if="step.total > 0">
              · {{ step.done }}/{{ step.total }}
            </template>
          </span>
        </div>
        <ProgressBar
          :mode="step.state === 'loading' ? 'indeterminate' : 'determinate'"
          :value="step.state === 'done' || step.state === 'skipped' ? 100 : step.total > 0 ? Math.round(((step.done + step.failed) / step.total) * 100) : 0"
          :showValue="false"
          :pt="{
            root: 'h-2.5! rounded-full!',
            value:
              (step.state === 'error'
                ? 'bg-red-400!'
                : step.key === 'scanFail'
                  ? 'bg-amber-400!'
                  : 'bg-cyan-400!') + ' rounded-full!',
          }"
        />
        <p v-if="step.state === 'error' && step.error" class="mt-1 mb-0 text-xs text-red-600">{{ step.error }}</p>
      </li>
    </ul>

    <p class="m-0 text-sm tabular-nums">{{ countLabel }}</p>
    <p v-if="failed > 0 && lastError && lastError !== 'offline'" class="mt-2 mb-0 text-xs text-red-600">
      {{ lastError }}
    </p>

    <div class="mt-4 flex justify-end gap-2">
      <Button v-if="showRetry" :label="t('scan.syncRetry')" size="large" severity="danger" outlined :disabled="busy"
        @click="retryFailed" />
      <Button :label="t('common.cancel')" size="large" :disabled="!canClose" severity="secondary" @click="onClose" />
      <Button v-if="showContinueLogout" size="large" :label="t('auth.logoutContinue', { seconds: continueCountdown })"
        :disabled="!canClose" @click="onContinue" />
    </div>
  </Dialog>
</template>
