import { computed, reactive, ref } from 'vue'
import { syncAiScanResultsBatch, syncScanFailLogsBatch } from '@/services/api/asset'
import { readApiFailure } from '@/services/api/error'
import { reconcilePendingScanCommandBeforeSync } from '@/services/offline/reconcilePendingScanBeforeSync'
import { refreshOfflineAssetScansByVatNo } from '@/services/offline/refreshAssetScansByVatNo'
import {
  countPendingScanCommands,
  countPendingScanFailLogs,
  deleteScanCommandsWithMedia,
  listPendingScanCommands,
  listPendingScanFailLogs,
  markScanCommandError,
  markScanCommandSynced,
} from '@/services/repositories/offline-catalog'
import {
  getEvidenceBlobForRecord,
  markMediaSynced,
  listMediaByRecordId,
} from '@/services/repositories/media'
import { EVIDENCE_MEDIA_KIND } from '@/services/evidence-photo'
import { useNetworkStore } from '@/stores/network'
import { i18n } from '@/i18n'

type ScanCommandSyncPhase = 'idle' | 'running' | 'finished' | 'error'
type SyncStepKey = 'scan' | 'scanFail'
type SyncStepState = 'pending' | 'loading' | 'done' | 'error' | 'skipped'

interface SyncStepProgress {
  key: SyncStepKey
  label: string
  state: SyncStepState
  done: number
  total: number
  failed: number
  error: string
}

const dialogVisible = ref(false)
const phase = ref<ScanCommandSyncPhase>('idle')
const busy = ref(false)
const lastError = ref('')
const activeCycleId = ref<number | undefined>(undefined)
/** When true, finished sync should offer Continue / countdown then logout. */
const logoutGateActive = ref(false)

const steps = reactive<Record<SyncStepKey, SyncStepProgress>>({
  scan: {
    key: 'scan',
    label: '',
    state: 'pending',
    done: 0,
    total: 0,
    failed: 0,
    error: '',
  },
  scanFail: {
    key: 'scanFail',
    label: '',
    state: 'pending',
    done: 0,
    total: 0,
    failed: 0,
    error: '',
  },
})

const STEP_ORDER: SyncStepKey[] = ['scan', 'scanFail']

function refreshStepLabels() {
  steps.scan.label = i18n.global.t('scan.syncStepScan')
  steps.scanFail.label = i18n.global.t('scan.syncStepScanFail')
}

function resetSteps() {
  refreshStepLabels()
  for (const key of STEP_ORDER) {
    steps[key].state = 'pending'
    steps[key].done = 0
    steps[key].total = 0
    steps[key].failed = 0
    steps[key].error = ''
  }
  lastError.value = ''
}

async function markRecordMediaSynced(recordId: string) {
  const rows = await listMediaByRecordId(recordId)
  for (const row of rows) {
    if (row.kind === EVIDENCE_MEDIA_KIND) await markMediaSynced(row.id)
  }
}

export function useOfflineScanCommandSync() {
  const network = useNetworkStore()

  const stepList = computed(() => STEP_ORDER.map((key) => steps[key]))

  const total = computed(() => stepList.value.reduce((acc, step) => acc + step.total, 0))
  const done = computed(() => stepList.value.reduce((acc, step) => acc + step.done, 0))
  const failed = computed(() => stepList.value.reduce((acc, step) => acc + step.failed, 0))
  const remaining = computed(() => Math.max(0, total.value - done.value - failed.value))

  const percent = computed(() => {
    if (phase.value === 'finished') return 100
    const weights = stepList.value.length || 1
    const sum = stepList.value.reduce((acc, step) => {
      if (step.state === 'done' || step.state === 'skipped') return acc + 100
      if (step.state === 'error') return acc + (step.total > 0 ? 50 : 0)
      if (step.total <= 0) return acc
      return acc + Math.round(((step.done + step.failed) / step.total) * 100)
    }, 0)
    return Math.min(99, Math.round(sum / weights))
  })

  function closeDialog() {
    if (busy.value) return
    dialogVisible.value = false
    logoutGateActive.value = false
    if (phase.value === 'finished' || phase.value === 'error') {
      phase.value = 'idle'
    }
  }

  async function runScanStep(cycleId?: number) {
    const step = steps.scan
    step.state = 'loading'
    step.total = await countPendingScanCommands(cycleId)
    if (step.total <= 0) {
      step.state = 'skipped'
      step.done = 0
      return
    }
    const items = await listPendingScanCommands(cycleId, Math.max(step.total, 1))
    if (!items.length) {
      step.state = 'skipped'
      return
    }
    try {
      const toUpload: Array<{
        id: string
        payload: (typeof items)[0]['payload']
        vatNo: string
      }> = []

      for (const item of items) {
        const result = await reconcilePendingScanCommandBeforeSync(item)
        toUpload.push({
          id: item.id,
          payload: result.payload,
          vatNo: result.payload.vatNo?.trim() || item.payload.vatNo?.trim() || '',
        })
      }

      if (toUpload.length) {
        const payloads = []
        for (const row of toUpload) {
          const image = await getEvidenceBlobForRecord(row.id)
          payloads.push(image ? { ...row.payload, image } : row.payload)
        }
        const res = await syncAiScanResultsBatch(payloads)
        if (res.success === false) {
          const message = res.message?.trim() || 'batch sync failed'
          for (const row of toUpload) await markScanCommandError(row.id, message)
          step.failed = toUpload.length
          step.done = 0
          step.error = message
          step.state = 'error'
          lastError.value = message
          throw new Error(message)
        }
        for (const row of toUpload) {
          await markScanCommandSynced(row.id)
          await markRecordMediaSynced(row.id)
        }
      }

      step.done = toUpload.length
      step.state = 'done'

      // Align SQLite for vatNos we uploaded.
      const vatNos = [...new Set(toUpload.map((row) => row.vatNo).filter(Boolean))]
      const refreshCycleId =
        cycleId ?? items.find((item) => item.payload.cycleId != null)?.payload.cycleId
      if (refreshCycleId != null) {
        for (const vatNo of vatNos) {
          await refreshOfflineAssetScansByVatNo(refreshCycleId, vatNo, {
            takeServerLocal: true,
          })
        }
      }
    } catch (err) {
      if (step.state !== 'error') {
        const message = readApiFailure(err) || 'batch sync failed'
        for (const item of items) await markScanCommandError(item.id, message)
        step.failed = items.length
        step.error = message
        step.state = 'error'
        lastError.value = message
      }
      throw err
    }
  }

  async function runScanFailStep(cycleId?: number) {
    const step = steps.scanFail
    step.state = 'loading'
    step.total = await countPendingScanFailLogs(cycleId)
    if (step.total <= 0) {
      step.state = 'skipped'
      step.done = 0
      return
    }
    const items = await listPendingScanFailLogs(cycleId, Math.max(step.total, 1))
    if (!items.length) {
      step.state = 'skipped'
      return
    }
    try {
      const payloads = []
      for (const item of items) {
        const image = await getEvidenceBlobForRecord(item.id)
        payloads.push({
          vatNo: item.vatNo,
          cycleId: item.cycleId,
          createdAt: item.createdAt,
          createdBy: item.createdBy,
          ...(image ? { image } : {}),
        })
      }
      const res = await syncScanFailLogsBatch(payloads)
      if (res.success === false) {
        const message = res.message?.trim() || 'fail-log sync failed'
        for (const item of items) await markScanCommandError(item.id, message)
        step.failed = items.length
        step.error = message
        step.state = 'error'
        lastError.value = message
        throw new Error(message)
      }
      // Uploaded — remove local NotFound rows so unknown badge clears.
      await deleteScanCommandsWithMedia(items.map((item) => item.id))
      step.done = items.length
      step.state = 'done'
    } catch (err) {
      if (step.state !== 'error') {
        const message = readApiFailure(err) || 'fail-log sync failed'
        for (const item of items) await markScanCommandError(item.id, message)
        step.failed = items.length
        step.error = message
        step.state = 'error'
        lastError.value = message
      }
      throw err
    }
  }

  async function flushPending(cycleId?: number) {
    if (busy.value) return
    if (!network.online) {
      phase.value = 'error'
      lastError.value = 'offline'
      dialogVisible.value = true
      return
    }

    activeCycleId.value = cycleId
    busy.value = true
    phase.value = 'running'
    dialogVisible.value = true
    resetSteps()

    try {
      await runScanStep(cycleId)
      await runScanFailStep(cycleId)
      const anyError = STEP_ORDER.some((key) => steps[key].state === 'error')
      phase.value = anyError ? 'error' : 'finished'
    } catch {
      phase.value = 'error'
    } finally {
      busy.value = false
    }
  }

  async function startSync(cycleId?: number, options?: { logoutGate?: boolean }) {
    logoutGateActive.value = Boolean(options?.logoutGate)
    await flushPending(cycleId)
  }

  async function retryFailed() {
    await flushPending(activeCycleId.value)
  }

  return {
    dialogVisible,
    phase,
    steps,
    stepList,
    total,
    done,
    failed,
    remaining,
    percent,
    busy,
    lastError,
    logoutGateActive,
    startSync,
    retryFailed,
    closeDialog,
  }
}
