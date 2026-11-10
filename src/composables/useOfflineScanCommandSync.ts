import { computed, ref } from 'vue'
import { syncAiScanResultsBatch } from '@/services/api/asset'
import { readApiFailure } from '@/services/api/error'
import {
  countPendingScanCommands,
  listPendingScanCommands,
  markScanCommandError,
  markScanCommandSynced,
} from '@/services/repositories/offline-catalog'
import { useNetworkStore } from '@/stores/network'

export type ScanCommandSyncPhase = 'idle' | 'running' | 'finished' | 'error'

const dialogVisible = ref(false)
const phase = ref<ScanCommandSyncPhase>('idle')
const total = ref(0)
const done = ref(0)
const failed = ref(0)
const busy = ref(false)
const lastError = ref('')
const activeCycleId = ref<number | undefined>(undefined)
/** When true, finished sync should offer Continue / countdown then logout. */
const logoutGateActive = ref(false)

export function useOfflineScanCommandSync() {
  const network = useNetworkStore()

  const percent = computed(() => {
    if (total.value <= 0) return phase.value === 'finished' ? 100 : 0
    return Math.min(100, Math.round(((done.value + failed.value) / total.value) * 100))
  })

  const remaining = computed(() => Math.max(0, total.value - done.value - failed.value))

  function resetCounters() {
    total.value = 0
    done.value = 0
    failed.value = 0
    lastError.value = ''
  }

  function closeDialog() {
    if (busy.value) return
    dialogVisible.value = false
    logoutGateActive.value = false
    if (phase.value === 'finished' || phase.value === 'error') {
      phase.value = 'idle'
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
    resetCounters()

    try {
      total.value = await countPendingScanCommands(cycleId)
      if (total.value <= 0) {
        phase.value = 'finished'
        return
      }

      const items = await listPendingScanCommands(cycleId, Math.max(total.value, 1))
      if (!items.length) {
        phase.value = 'finished'
        return
      }

      try {
        const res = await syncAiScanResultsBatch(items.map((item) => item.payload))
        if (res.success === false) {
          const message = res.message?.trim() || 'batch sync failed'
          for (const item of items) {
            await markScanCommandError(item.id, message)
          }
          failed.value = items.length
          lastError.value = message
          phase.value = 'error'
          return
        }

        for (const item of items) {
          await markScanCommandSynced(item.id)
        }
        done.value = items.length
        phase.value = 'finished'
      } catch (err) {
        const message = readApiFailure(err) || 'batch sync failed'
        for (const item of items) {
          await markScanCommandError(item.id, message)
        }
        failed.value = items.length
        lastError.value = message
        phase.value = 'error'
      }
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
