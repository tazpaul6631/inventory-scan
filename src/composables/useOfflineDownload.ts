import { computed, reactive, ref } from 'vue'
import { i18n } from '@/i18n'
import { baseQueryAssetInfoScanViewResult } from '@/services/api/asset'
import {
  baseQueryOrganizationResult,
  baseQueryPositionResult,
  baseQueryWarehouseResult,
} from '@/services/api/category'
import { fetchAllPages } from '@/services/api/paging'
import { readApiFailure } from '@/services/api/error'
import {
  appendAssetScanPage,
  clearAssetScansForCycle,
  replaceOrganizations,
  replacePositions,
  replaceWarehouses,
} from '@/services/repositories/offline-catalog'
import { withBulkWrite, withTransaction } from '@/storage/database'

export type OfflineDownloadKey = 'warehouses' | 'positions' | 'organizations' | 'assetScans'
export type OfflineItemState = 'pending' | 'loading' | 'done' | 'error'
export type OfflinePhase = 'idle' | 'running' | 'finished' | 'error'

export interface OfflineItemProgress {
  key: OfflineDownloadKey
  label: string
  state: OfflineItemState
  percent: number
  detail: string
  error: string
}

export const OFFLINE_PIPELINE_ORDER: OfflineDownloadKey[] = [
  'warehouses',
  'positions',
  'organizations',
  'assetScans',
]

/** Approximate ETA weights — asset scans dominate. */
export const OFFLINE_STEP_ETA_SEC: Record<OfflineDownloadKey, number> = {
  warehouses: 30,
  positions: 45,
  organizations: 30,
  assetScans: 12 * 60,
}

const LABEL_KEYS: Record<OfflineDownloadKey, string> = {
  warehouses: 'nav.warehouses',
  positions: 'nav.positions',
  organizations: 'nav.organizations',
  assetScans: 'nav.assetInfoScan',
}

const CATALOG_PAGE_SIZE = 1000
const ASSET_SCAN_PAGE_SIZE = 1000

function makeItem(key: OfflineDownloadKey): OfflineItemProgress {
  return {
    key,
    label: i18n.global.t(LABEL_KEYS[key]),
    state: 'pending',
    percent: 0,
    detail: '',
    error: '',
  }
}

const items = reactive<Record<OfflineDownloadKey, OfflineItemProgress>>({
  warehouses: makeItem('warehouses'),
  positions: makeItem('positions'),
  organizations: makeItem('organizations'),
  assetScans: makeItem('assetScans'),
})

const activeKeys = ref<OfflineDownloadKey[]>([])
const phase = ref<OfflinePhase>('idle')
const dialogVisible = ref(false)
const context = ref<{ factoryId: number; cycleId: number } | null>(null)

function refreshLabels() {
  for (const key of OFFLINE_PIPELINE_ORDER) {
    items[key].label = i18n.global.t(LABEL_KEYS[key])
  }
}

function resetItems(keys: OfflineDownloadKey[]) {
  refreshLabels()
  for (const key of OFFLINE_PIPELINE_ORDER) {
    Object.assign(items[key], {
      state: 'pending',
      percent: 0,
      detail: '',
      error: '',
    })
  }
  activeKeys.value = [...keys]
}

function formatProgress(downloaded: number, totalCount: number, page: number, totalPage: number) {
  if (totalCount > 0) {
    return i18n.global.t('offlineDownload.pageProgress', {
      page,
      totalPage: Math.max(totalPage, 1),
      downloaded,
      total: totalCount,
    })
  }
  return i18n.global.t('offlineDownload.pageOnly', { page, totalPage: Math.max(totalPage, 1) })
}

function percentFromProgress(downloaded: number, totalCount: number, page: number, totalPage: number) {
  if (totalCount > 0) {
    return Math.min(99, Math.max(5, Math.round((downloaded / totalCount) * 100)))
  }
  if (totalPage > 0) {
    return Math.min(99, Math.max(5, Math.round((page / totalPage) * 100)))
  }
  return 50
}

function beginStep(key: OfflineDownloadKey) {
  const item = items[key]
  item.state = 'loading'
  item.percent = 5
  item.detail = i18n.global.t('offlineDownload.running')
  item.error = ''
  return item
}

function finishStep(key: OfflineDownloadKey) {
  const item = items[key]
  item.percent = 100
  item.state = 'done'
  item.detail = i18n.global.t('offlineDownload.done')
}

async function downloadWarehouses(factoryId: number) {
  const item = beginStep('warehouses')
  const collected: Parameters<typeof replaceWarehouses>[1] = []
  await fetchAllPages((page, pageSize) => baseQueryWarehouseResult({ factoryId, page, pageSize }), {
    pageSize: CATALOG_PAGE_SIZE,
    onPage: async (rows, progress) => {
      collected.push(...rows)
      item.percent = percentFromProgress(
        progress.downloaded,
        progress.totalCount,
        progress.page,
        progress.totalPage,
      )
      item.detail = formatProgress(
        progress.downloaded,
        progress.totalCount,
        progress.page,
        progress.totalPage,
      )
    },
  })
  await replaceWarehouses(factoryId, collected)
  finishStep('warehouses')
}

async function downloadPositions(factoryId: number) {
  const item = beginStep('positions')
  const collected: Parameters<typeof replacePositions>[1] = []
  await fetchAllPages((page, pageSize) => baseQueryPositionResult({ factoryId, page, pageSize }), {
    pageSize: CATALOG_PAGE_SIZE,
    onPage: async (rows, progress) => {
      collected.push(...rows)
      item.percent = percentFromProgress(
        progress.downloaded,
        progress.totalCount,
        progress.page,
        progress.totalPage,
      )
      item.detail = formatProgress(
        progress.downloaded,
        progress.totalCount,
        progress.page,
        progress.totalPage,
      )
    },
  })
  await replacePositions(factoryId, collected)
  finishStep('positions')
}

async function downloadOrganizations(factoryId: number) {
  const item = beginStep('organizations')
  const collected: Parameters<typeof replaceOrganizations>[1] = []
  await fetchAllPages(
    (page, pageSize) => baseQueryOrganizationResult({ factoryId, page, pageSize }),
    {
      pageSize: CATALOG_PAGE_SIZE,
      onPage: async (rows, progress) => {
        collected.push(...rows)
        item.percent = percentFromProgress(
          progress.downloaded,
          progress.totalCount,
          progress.page,
          progress.totalPage,
        )
        item.detail = formatProgress(
          progress.downloaded,
          progress.totalCount,
          progress.page,
          progress.totalPage,
        )
      },
    },
  )
  await replaceOrganizations(factoryId, collected)
  finishStep('organizations')
}

async function downloadAssetScans(cycleId: number) {
  const item = beginStep('assetScans')
  await withTransaction(async () => {
    await clearAssetScansForCycle(cycleId)
    await fetchAllPages(
      (page, pageSize) => baseQueryAssetInfoScanViewResult({ cycleId, page, pageSize }),
      {
        pageSize: ASSET_SCAN_PAGE_SIZE,
        onPage: async (rows, progress) => {
          await appendAssetScanPage(cycleId, rows)
          item.percent = percentFromProgress(
            progress.downloaded,
            progress.totalCount,
            progress.page,
            progress.totalPage,
          )
          item.detail = formatProgress(
            progress.downloaded,
            progress.totalCount,
            progress.page,
            progress.totalPage,
          )
        },
      },
    )
  })
  finishStep('assetScans')
}

async function runKey(key: OfflineDownloadKey) {
  const ctx = context.value
  if (!ctx) throw new Error(i18n.global.t('offlineDownload.missingContext'))
  try {
    if (key === 'warehouses') await downloadWarehouses(ctx.factoryId)
    else if (key === 'positions') await downloadPositions(ctx.factoryId)
    else if (key === 'organizations') await downloadOrganizations(ctx.factoryId)
    else if (key === 'assetScans') await downloadAssetScans(ctx.cycleId)
    else {
      const _exhaustive: never = key
      throw new Error(`Unknown offline key: ${_exhaustive}`)
    }
  } catch (err) {
    const item = items[key]
    item.state = 'error'
    item.error =
      readApiFailure(err) ||
      (err instanceof Error ? err.message : i18n.global.t('offlineDownload.error'))
    item.detail = item.error
    throw err
  }
}

export function useOfflineDownload() {
  const list = computed(() => activeKeys.value.map((key) => items[key]))

  const overallPercent = computed(() => {
    if (!list.value.length) return 0
    if (phase.value === 'finished') return 100
    const weightTotal = list.value.reduce((acc, item) => acc + OFFLINE_STEP_ETA_SEC[item.key], 0)
    if (weightTotal <= 0) return 0
    const weighted = list.value.reduce(
      (acc, item) => acc + item.percent * OFFLINE_STEP_ETA_SEC[item.key],
      0,
    )
    return Math.min(99, Math.round(weighted / weightTotal))
  })

  const busy = computed(() => phase.value === 'running')

  async function runOfflineDownload(params: { factoryId: number; cycleId: number }) {
    if (phase.value === 'running') return
    context.value = params
    resetItems(OFFLINE_PIPELINE_ORDER)
    dialogVisible.value = true
    phase.value = 'running'
    try {
      await withBulkWrite(async () => {
        for (const key of OFFLINE_PIPELINE_ORDER) {
          await runKey(key)
        }
      })
      phase.value = 'finished'
    } catch {
      phase.value = 'error'
    }
  }

  async function retry(key: OfflineDownloadKey) {
    if (phase.value === 'running' || !context.value) return
    const item = items[key]
    item.state = 'pending'
    item.percent = 0
    item.detail = ''
    item.error = ''
    phase.value = 'running'
    try {
      await withBulkWrite(async () => {
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
      })
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
    runOfflineDownload,
    retry,
    closeDialog,
  }
}
