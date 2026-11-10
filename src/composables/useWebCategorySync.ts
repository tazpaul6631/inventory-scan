import { computed, reactive, ref } from 'vue'
import { i18n } from '@/i18n'
import {
  syncFactoriesFromApi,
  syncOrganizationsFromApi,
  syncPositionsFromApi,
  syncWarehousesFromApi,
} from '@/services/api/category'
import { pollSyncAssetInfoScansFromApi, pollSyncAssetInfosFromApi } from '@/services/api/asset'
import { readApiFailure } from '@/services/api/error'
import { useAuthStore } from '@/stores/auth'

export type SyncTableKey =
  | 'factories'
  | 'warehouses'
  | 'positions'
  | 'organizations'
  | 'assetInfos'
  | 'assetInfoScans'

export type SyncItemState = 'pending' | 'loading' | 'done' | 'error'
export type SyncPhase = 'idle' | 'running' | 'finished' | 'error'

export interface SyncItemProgress {
  key: SyncTableKey
  label: string
  state: SyncItemState
  percent: number
  detail: string
  error: string
}

export const SYNC_PIPELINE_ORDER: SyncTableKey[] = [
  'factories',
  'warehouses',
  'positions',
  'assetInfos',
  'organizations',
  'assetInfoScans',
]

/** Expected duration per step — AssetInfos / Scans dominate; other APIs are typically < 1 min. */
export const STEP_ETA_SEC: Record<SyncTableKey, number> = {
  factories: 30,
  warehouses: 30,
  positions: 30,
  assetInfos: 10 * 60,
  organizations: 30,
  assetInfoScans: 10 * 60,
}

const LABEL_KEYS: Record<SyncTableKey, string> = {
  factories: 'nav.factories',
  warehouses: 'nav.warehouses',
  positions: 'nav.positions',
  organizations: 'nav.organizations',
  assetInfos: 'nav.assetInfo',
  assetInfoScans: 'nav.assetInfoScan',
}

function makeItem(key: SyncTableKey): SyncItemProgress {
  return {
    key,
    label: i18n.global.t(LABEL_KEYS[key]),
    state: 'pending',
    percent: 0,
    detail: '',
    error: '',
  }
}

const items = reactive<Record<SyncTableKey, SyncItemProgress>>({
  factories: makeItem('factories'),
  warehouses: makeItem('warehouses'),
  positions: makeItem('positions'),
  organizations: makeItem('organizations'),
  assetInfos: makeItem('assetInfos'),
  assetInfoScans: makeItem('assetInfoScans'),
})

const activeKeys = ref<SyncTableKey[]>([])
const phase = ref<SyncPhase>('idle')
const dialogVisible = ref(false)

function refreshLabels() {
  for (const key of SYNC_PIPELINE_ORDER) {
    items[key].label = i18n.global.t(LABEL_KEYS[key])
  }
}

function resetItems(keys: SyncTableKey[]) {
  refreshLabels()
  for (const key of SYNC_PIPELINE_ORDER) {
    const active = keys.includes(key)
    Object.assign(items[key], {
      state: active ? 'pending' : 'pending',
      percent: 0,
      detail: '',
      error: '',
    })
  }
  activeKeys.value = [...keys]
}

function requireCreatedBy() {
  const createdBy = useAuthStore().session?.userId?.trim() ?? ''
  if (!createdBy) throw new Error(i18n.global.t('user.needSession'))
  return createdBy
}

async function syncOneShot(
  key: SyncTableKey,
  call: (createdBy: string) => Promise<{ success?: boolean; message?: string }>,
) {
  const item = items[key]
  item.state = 'loading'
  item.percent = 15
  item.detail = i18n.global.t('syncProgress.running')
  item.error = ''
  const createdBy = requireCreatedBy()
  item.percent = 55
  const res = await call(createdBy)
  if (res.success === false) {
    throw new Error(res.message || i18n.global.t('syncProgress.error'))
  }
  item.percent = 100
  item.state = 'done'
  item.detail = i18n.global.t('syncProgress.done')
}

async function pollUntilZero(
  key: 'assetInfos' | 'assetInfoScans',
  poll: typeof pollSyncAssetInfosFromApi,
) {
  const item = items[key]
  item.state = 'loading'
  item.percent = 5
  item.detail = i18n.global.t('syncProgress.running')
  item.error = ''
  const createdBy = requireCreatedBy()
  let initial: number | null = null

  const res = await poll({ createdBy }, (remaining) => {
    if (initial == null) initial = Math.max(remaining, 0)
    if (initial <= 0) {
      item.percent = 100
      item.detail = i18n.global.t('syncProgress.remaining', { n: 0 })
      return
    }
    const done = Math.min(100, Math.round(((initial - remaining) / initial) * 100))
    item.percent = Math.max(5, done)
    item.detail = i18n.global.t('syncProgress.remaining', { n: remaining })
  })

  if (res.success === false) {
    throw new Error(res.message || i18n.global.t('syncProgress.error'))
  }
  item.percent = 100
  item.state = 'done'
  item.detail = i18n.global.t('syncProgress.done')
}

async function runKey(key: SyncTableKey) {
  try {
    if (key === 'factories') {
      await syncOneShot(key, (createdBy) => syncFactoriesFromApi({ createdBy }))
    } else if (key === 'warehouses') {
      await syncOneShot(key, (createdBy) => syncWarehousesFromApi({ createdBy }))
    } else if (key === 'positions') {
      await syncOneShot(key, (createdBy) => syncPositionsFromApi({ createdBy }))
    } else if (key === 'organizations') {
      await syncOneShot(key, (createdBy) => syncOrganizationsFromApi({ createdBy }))
    } else if (key === 'assetInfos') {
      await pollUntilZero('assetInfos', pollSyncAssetInfosFromApi)
    } else if (key === 'assetInfoScans') {
      await pollUntilZero('assetInfoScans', pollSyncAssetInfoScansFromApi)
    } else {
      const _exhaustive: never = key
      throw new Error(`Unknown sync key: ${_exhaustive}`)
    }
  } catch (err) {
    const item = items[key]
    item.state = 'error'
    item.error = readApiFailure(err) || (err instanceof Error ? err.message : i18n.global.t('syncProgress.error'))
    item.detail = item.error
    throw err
  }
}

export function useWebCategorySync() {
  const list = computed(() => activeKeys.value.map((key) => items[key]))

  const overallPercent = computed(() => {
    if (!list.value.length) return 0
    if (phase.value === 'finished') return 100
    const weightTotal = list.value.reduce((acc, item) => acc + STEP_ETA_SEC[item.key], 0)
    if (weightTotal <= 0) return 0
    const weighted = list.value.reduce(
      (acc, item) => acc + item.percent * STEP_ETA_SEC[item.key],
      0,
    )
    return Math.min(99, Math.round(weighted / weightTotal))
  })

  const busy = computed(() => phase.value === 'running')

  async function runOne(key: SyncTableKey) {
    if (phase.value === 'running') return
    resetItems([key])
    dialogVisible.value = true
    phase.value = 'running'
    try {
      await runKey(key)
      phase.value = 'finished'
    } catch {
      phase.value = 'error'
    }
  }

  async function runPipeline(keys: SyncTableKey[] = SYNC_PIPELINE_ORDER) {
    if (phase.value === 'running') return
    resetItems(keys)
    dialogVisible.value = true
    phase.value = 'running'
    try {
      for (const key of keys) {
        await runKey(key)
      }
      phase.value = 'finished'
    } catch {
      phase.value = 'error'
    }
  }

  async function retry(key: SyncTableKey) {
    if (phase.value === 'running') return
    const item = items[key]
    item.state = 'pending'
    item.percent = 0
    item.detail = ''
    item.error = ''
    phase.value = 'running'
    try {
      await runKey(key)
      const idx = activeKeys.value.indexOf(key)
      for (const next of activeKeys.value.slice(idx + 1)) {
        if (items[next].state === 'done') continue
        items[next].state = 'pending'
        items[next].percent = 0
        items[next].detail = ''
        items[next].error = ''
        await runKey(next)
      }
      phase.value = activeKeys.value.every((k) => items[k].state === 'done') ? 'finished' : 'error'
    } catch {
      phase.value = 'error'
    }
  }

  function closeDialog() {
    if (phase.value === 'running') return
    dialogVisible.value = false
    phase.value = 'idle'
  }

  return {
    items,
    list,
    phase,
    dialogVisible,
    overallPercent,
    busy,
    runOne,
    runPipeline,
    retry,
    closeDialog,
  }
}
