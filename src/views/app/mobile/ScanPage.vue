<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Button from '@/components/ui/AppButton.vue'
import InputNumber from '@/components/ui/AppInputNumber.vue'
import InputText from '@/components/ui/AppInputText.vue'
import Select from '@/components/ui/AppSelect.vue'
import FloatLabel from '@/components/ui/AppFloatLabel.vue'
import Dialog from '@/components/ui/AppDialog.vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import { useScan } from '@/composables/useScan'
import { useBarcodeWedge } from '@/composables/useBarcodeWedge'
import {
  cancelLiveScan,
  forcePreferLiveScan,
  isScanCanceled,
  preferLiveScan,
  scanOnce,
  scanOnceLive,
} from '@/adapters/barcode'
import { useAuthStore } from '@/stores/auth'
import { useNetworkStore } from '@/stores/network'
import { createAiScanResult, createScanFailLog } from '@/services/api/asset'
import { readApiFailure } from '@/services/api/error'
import {
  classifyCorrectLocationScan,
  isAssetCompletedByFlags,
  isSameScanBy,
  scanResultFromCompletedFlags,
} from '@/services/offline/classifyCorrectLocation'
import { refreshOfflineAssetScansByVatNo } from '@/services/offline/refreshAssetScansByVatNo'
import {
  captureEvidencePhoto,
  discardEvidenceFile,
  type CapturedEvidence,
} from '@/services/evidence-photo'
import { insertEvidenceMedia } from '@/services/repositories/media'
import { readBinaryFile } from '@/storage/files'
import {
  countOfflineAssetScans,
  countAllPendingSyncItems,
  deleteScanCommandsWithMedia,
  enqueueScanCommand,
  getOfflineFactoryName,
  getOfflineFactoryTenantId,
  getOfflineWarehouseName,
  listOfflineAssetScans,
  listOfflineAssetProgressBuckets,
  listOfflineOrganizations,
  listOfflinePositions,
  countOfflineUnknownScanCodes,
  listOfflineUnknownScanCodes,
  listOfflineWarehouses,
  type OfflineUnknownScanFilters,
  localStatusFromScanResult,
  lookupOfflineAssetScansByVatNo,
  lookupOfflineAssetScansByVatNoFactory,
  markScanCommandSynced,
  organizationOwnsOrderCode,
  mergeScanFlags,
  statusFromScanFlags,
  updateOfflineAssetScanProgress,
  type OfflineAssetScanFilters,
  type OfflineAssetProgressBucket,
  type OfflineAssetScanItem,
  type OfflineLocalScanStatus,
  type OfflineScanCommandPayload,
  type OfflineScanListFilter,
  type OfflineUnknownScanCode,
} from '@/services/repositories/offline-catalog'
import { useOfflineScanCommandSync } from '@/composables/useOfflineScanCommandSync'
import { formatVietnamDateTime } from '@/utils/localDateTime'
import { speakImportantText, ttsLangFromLocale } from '@/utils/speakImportantText'
import type { AiScanResultCode, ViewAssetInfoScanResult } from '@/types/api'
import type { ScanDirection, ScanResult } from '@/types'

type ScanRowStatus =
  | 'pending'
  | 'success'
  | 'duplicate'
  | 'notFound'
  | 'wrongFactory'
  | 'wrongWarehouse'
  | 'wrongOrganization'
  | 'wrongWposition'
type ResultStatus = Exclude<ScanRowStatus, 'pending'>

interface ScanTableRow {
  id?: string
  sticker: string
  qty: string
  name: string
  orderCode: string
  originalWposition: string
  status: ScanRowStatus
  wPositionId?: number
  factoryId?: number
  warehouseId?: number
  asset?: ViewAssetInfoScanResult
}

const TO_CHECK_PAGE_SIZE = 100
const AREA_SUMMARY_LIMIT = 200

const { t, locale } = useI18n()
const toast = useToast()
const { session } = storeToRefs(useAuthStore())
const { online } = storeToRefs(useNetworkStore())

const direction = ref<ScanDirection>('in')
const { remember } = useScan(direction)
const checking = ref(false)
const savingCode = ref(false)
const liveScanOpen = ref(false)
const LIVE_SCAN_ELEMENT_ID = 'scan-page-live-reader'

async function closeLiveScanOverlay() {
  liveScanOpen.value = false
  await cancelLiveScan().catch(() => undefined)
}

async function scanWithLiveFallback(): Promise<ScanResult> {
  liveScanOpen.value = true
  await nextTick()
  try {
    return await scanOnceLive(LIVE_SCAN_ELEMENT_ID)
  } finally {
    await closeLiveScanOverlay()
  }
}
const warehouse = ref<string | null>(null)
const position = ref<string | null>(null)
const organization = ref<string | null>(null)
const draftWarehouse = ref<string | null>(null)
const draftPosition = ref<string | null>(null)
const draftOrganization = ref<string | null>(null)
const locationDialogOpen = ref(false)
const warehouseOptions = ref<{ label: string; value: string }[]>([])
const positionOptions = ref<{ label: string; value: string; complete: boolean }[]>([])
const organizationOptions = ref<{ label: string; value: string; complete: boolean }[]>([])

type ScanProgressCache = {
  key: string
  buckets: OfflineAssetProgressBucket[]
  orgKeys: Map<string, Set<string>>
}

let scanProgressCache: ScanProgressCache | null = null
let scanProgressInflight: Promise<ScanProgressCache | null> | null = null
let scanProgressEpoch = 0
let positionLoadId = 0
let organizationLoadId = 0

function scanProgressKey(cycleId: number, factoryIdValue: number, warehouseId: number) {
  return `${cycleId}|${factoryIdValue}|${warehouseId}`
}

function invalidateScanProgressCache() {
  scanProgressEpoch += 1
  scanProgressCache = null
  scanProgressInflight = null
}

function orderMatchesOrg(orderCode: string, orgName: string, orgKeys: Map<string, Set<string>>) {
  const keys = orgKeys.get(orgName)
  if (!keys) return orderCode === orgName
  return keys.has(orderCode)
}

function sumBuckets(
  buckets: OfflineAssetProgressBucket[],
  match: (bucket: OfflineAssetProgressBucket) => boolean,
) {
  let total = 0
  let scanned = 0
  for (const bucket of buckets) {
    if (!match(bucket)) continue
    total += bucket.total
    scanned += bucket.scanned
  }
  return { total, scanned }
}

async function ensureScanProgress(warehouseId: string | null): Promise<ScanProgressCache | null> {
  const cycleId = session.value?.cycleId
  const fid = factoryId.value
  const whId = warehouseId ? Number(warehouseId) : NaN
  if (cycleId === undefined || fid === undefined || Number.isNaN(whId)) return null
  const key = scanProgressKey(cycleId, fid, whId)
  const epoch = scanProgressEpoch
  if (scanProgressCache?.key === key) return scanProgressCache
  if (scanProgressInflight) {
    const pending = await scanProgressInflight
    if (epoch !== scanProgressEpoch) return null
    if (pending?.key === key) return pending
  }
  const run = (async (): Promise<ScanProgressCache | null> => {
    const [buckets, orgs] = await Promise.all([
      listOfflineAssetProgressBuckets({ cycleId, factoryId: fid, warehouseId: whId }),
      listOfflineOrganizations(fid),
    ])
    const orgKeys = new Map<string, Set<string>>()
    for (const org of orgs) {
      const name = org.name?.trim() || ''
      if (!name) continue
      const keys = orgKeys.get(name) ?? new Set<string>()
      keys.add(name)
      const code = org.code?.trim()
      if (code) keys.add(code)
      orgKeys.set(name, keys)
    }
    return { key, buckets, orgKeys }
  })()
  scanProgressInflight = run
  try {
    const result = await run
    if (epoch !== scanProgressEpoch) return null
    if (result && scanProgressInflight === run) scanProgressCache = result
    return result
  } finally {
    if (scanProgressInflight === run) scanProgressInflight = null
  }
}

function cachedScanProgress(warehouseId: string | null): ScanProgressCache | null {
  const cycleId = session.value?.cycleId
  const fid = factoryId.value
  const whId = warehouseId ? Number(warehouseId) : NaN
  if (cycleId === undefined || fid === undefined || Number.isNaN(whId)) return null
  return scanProgressCache?.key === scanProgressKey(cycleId, fid, whId) ? scanProgressCache : null
}
const loadingWarehouses = ref(false)
const loadingPositions = ref(false)
const loadingOrganizations = ref(false)
const loadingAssets = ref(false)
const positionOverlayStyle = ref<Record<string, string>>({})
const organizationOverlayStyle = ref<Record<string, string>>({})
const manual = ref('')
const manualDialogOpen = ref(false)
const pendingEvidence = ref<CapturedEvidence | null>(null)
const capturingEvidence = ref(false)
/** Skip discarding draft photo when dialog closes after a successful submit. */
let manualCloseAfterSubmit = false
const sessionItems = ref<ScanResult[]>([])
const resultOpen = ref(false)
const resultStatus = ref<ResultStatus>('success')
const resultSticker = ref('')
const resultName = ref('')
const resultCount = ref<number | null>(1)
const resultExpect = ref(1)
const resultScanMin = ref(1)
const resultOriginalFactory = ref('')
const resultOriginalWarehouse = ref('')
const resultOriginalPosition = ref('')
const resultOriginalOrg = ref('')
type ResultWrongOption = { label: string; value: string; row: ScanTableRow }
const resultWrongOptions = ref<ResultWrongOption[]>([])
const resultWrongPickId = ref<string | null>(null)
const loadingWrongOptions = ref(false)
/** Same-factory wrong location: select first, no Dup/Wrong color until pick. */
const resultAwaitingPositionPick = ref(false)
/** Opened via needsPositionPick flow (Select stays after branching to Dup/Wrong). */
const resultFromPositionPick = ref(false)
const areaSummaryOpen = ref(false)
const loadingAreaSummary = ref(false)
const areaSummaryUnknownItems = ref<OfflineUnknownScanCode[]>([])
const unknownBadgeCount = ref(0)
const pendingSyncCount = ref(0)
const { startSync, busy: syncBusy, phase: syncPhase } = useOfflineScanCommandSync()
const toCheckItems = ref<ScanTableRow[]>([])
const listFilter = ref<OfflineScanListFilter>('all')
const assetsOffset = ref(0)
const assetsHasMore = ref(false)
const assetsTotal = ref(0)
const assetsPending = ref(0)
const assetsScanned = ref(0)
const loadingMoreAssets = ref(false)
const tableWrapRef = ref<HTMLElement | null>(null)
let tableScrollEl: HTMLElement | null = null
let listLoadId = 0

const factoryId = computed(() => session.value?.factoryId)

const listFilterOptions = computed(() => [
  { label: t('scan.filterAll'), value: 'all' as const, count: assetsTotal.value },
  { label: t('scan.filterPending'), value: 'pending' as const, count: assetsPending.value },
  { label: t('scan.filterScanned'), value: 'scanned' as const, count: assetsScanned.value },
])

const filterDisabled = computed(
  () => !warehouse.value || !(position.value || organization.value),
)

function formatQty(count: number, expect: number) {
  return `${count}/${expect}`
}

/** Format stored epoch/ISO as Vietnam local time (UTC+7). */
function formatVnTime(value: string | number | null | undefined): string {
  if (value == null || value === '') return ''
  const asNumber = typeof value === 'number' ? value : Number(value)
  const date = Number.isFinite(asNumber) ? new Date(asNumber) : new Date(String(value))
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

function currentScanFilters(): OfflineAssetScanFilters | null {
  const fid = factoryId.value
  const cycleId = session.value?.cycleId
  const warehouseId = warehouse.value ? Number(warehouse.value) : NaN
  const wPositionId = position.value ? Number(position.value) : NaN
  const organizationName = organization.value?.trim() || null
  const hasPosition = !Number.isNaN(wPositionId)
  const hasOrganization = Boolean(organizationName)
  if (fid === undefined || cycleId === undefined || (!hasPosition && !hasOrganization)) {
    return null
  }
  return {
    cycleId,
    factoryId: fid,
    ...(Number.isNaN(warehouseId) ? {} : { warehouseId }),
    ...(hasPosition ? { wPositionId } : {}),
    ...(organizationName ? { name: organizationName } : {}),
  }
}

function unknownScanFiltersFromCurrent(): OfflineUnknownScanFilters | null {
  const filters = currentScanFilters()
  if (!filters || filters.warehouseId == null) return null
  return {
    cycleId: filters.cycleId,
    factoryId: filters.factoryId,
    warehouseId: filters.warehouseId,
    ...(filters.wPositionId != null ? { wPositionId: filters.wPositionId } : {}),
    ...(filters.name?.trim() ? { orderCode: filters.name.trim() } : {}),
  }
}

/** Compact badge text for large counts (keeps icon button readable up to 10k+). */
function formatUnknownBadge(count: number): string {
  if (count <= 0) return ''
  if (count < 1000) return String(count)
  if (count < 10000) {
    const rounded = Math.round(count / 100) / 10
    return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}k`
  }
  return '9.9k+'
}

const unknownBadgeLabel = computed(() => formatUnknownBadge(unknownBadgeCount.value))
const pendingSyncBadgeLabel = computed(() => formatUnknownBadge(pendingSyncCount.value))
const canStartSync = computed(
  () => online.value && pendingSyncCount.value > 0 && !syncBusy.value,
)

async function refreshUnknownBadgeCount() {
  const params = unknownScanFiltersFromCurrent()
  if (!params || !canScan.value) {
    unknownBadgeCount.value = 0
    return
  }
  try {
    unknownBadgeCount.value = await countOfflineUnknownScanCodes(params)
  } catch {
    unknownBadgeCount.value = 0
  }
}

async function refreshPendingSyncCount() {
  const cycleId = session.value?.cycleId
  if (cycleId === undefined) {
    pendingSyncCount.value = 0
    return
  }
  try {
    pendingSyncCount.value = await countAllPendingSyncItems(cycleId)
  } catch {
    pendingSyncCount.value = 0
  }
}

async function openScanCommandSync() {
  if (!canStartSync.value) {
    if (!online.value) {
      toast.add({
        severity: 'warn',
        summary: t('scan.syncOffline'),
        life: 2500,
        closable: false,
      })
    }
    return
  }
  await startSync(session.value?.cycleId)
  await refreshPendingSyncCount()
  await refreshUnknownBadgeCount()
}

function mapOfflineItem(item: OfflineAssetScanItem): ScanTableRow {
  const expect = item.count || 1
  const fromFlags = statusFromScanFlags(item)
  const raw = fromFlags ?? item.localScanStatus
  const status: ScanRowStatus =
    raw === 'success' ||
      raw === 'duplicate' ||
      raw === 'notFound' ||
      raw === 'wrongFactory' ||
      raw === 'wrongWarehouse' ||
      raw === 'wrongOrganization' ||
      raw === 'wrongWposition'
      ? raw
      : 'pending'
  const scannedCount =
    status === 'pending'
      ? 0
      : item.localScanQty != null
        ? item.localScanQty
        : item.scanCount != null
          ? item.scanCount
          : expect
  return {
    id: item.id,
    sticker: item.vatNo?.trim() || '',
    qty: formatQty(scannedCount, expect),
    name: item.materialName?.trim() || '',
    orderCode: item.orderCode?.trim() || '',
    originalWposition: item.wPosition?.trim() || '',
    status,
    wPositionId: item.wPositionId,
    factoryId: item.factoryId,
    warehouseId: item.warehouseId,
    asset: item,
  }
}

function clearAssetCounts() {
  assetsTotal.value = 0
  assetsPending.value = 0
  assetsScanned.value = 0
}

async function refreshAssetCounts() {
  const filters = currentScanFilters()
  if (!filters) {
    clearAssetCounts()
    return
  }
  try {
    const counts = await countOfflineAssetScans(filters)
    assetsTotal.value = counts.total
    assetsPending.value = counts.pending
    assetsScanned.value = counts.scanned
  } catch {
    clearAssetCounts()
  }
}

async function loadWarehouses() {
  if (loadingWarehouses.value) return
  const fid = factoryId.value
  if (fid === undefined) {
    warehouseOptions.value = []
    return
  }
  loadingWarehouses.value = true
  try {
    const rows = await listOfflineWarehouses(fid)
    warehouseOptions.value = rows
      .map((item) => {
        const name = item.name?.trim() || ''
        return { label: name, value: String(item.id) }
      })
      .filter((item) => item.label)
  } catch (err) {
    warehouseOptions.value = []
    toast.add({
      severity: 'warn',
      summary: readApiFailure(err) || t('auth.invalid'),
      life: 2500,
      closable: false,
    })
  } finally {
    loadingWarehouses.value = false
  }
}

function optionLabel(
  options: { label: string; value: string }[],
  value: string | null,
): string {
  if (!value) return '....'
  return options.find((item) => item.value === value)?.label || value
}

const locationSummary = computed(
  () =>
    `${optionLabel(warehouseOptions.value, warehouse.value)} -> ${optionLabel(organizationOptions.value, organization.value)} -> ${optionLabel(positionOptions.value, position.value)}`,
)

const draftLocationEmpty = computed(
  () => !draftWarehouse.value && !draftPosition.value && !draftOrganization.value,
)

const canApplyLocation = computed(() => {
  if (draftLocationEmpty.value) return true
  return (
    Boolean(draftWarehouse.value) &&
    Boolean(draftPosition.value || draftOrganization.value)
  )
})

const canClearDraftLocation = computed(() => !draftLocationEmpty.value)

function onDraftWarehouseChange() {
  draftPosition.value = null
  draftOrganization.value = null
  positionOptions.value = []
  invalidateScanProgressCache()
}

function clearDraftPositionIfMissing() {
  if (
    draftPosition.value &&
    !positionOptions.value.some((item) => item.value === draftPosition.value)
  ) {
    draftPosition.value = null
  }
}

watch(draftOrganization, () => {
  if (!draftWarehouse.value) {
    positionOptions.value = []
    draftPosition.value = null
    return
  }
  void loadPositions(draftWarehouse.value)
})

watch(draftPosition, () => {
  void loadOrganizations()
})

function scrollTableToTop() {
  if (tableScrollEl) tableScrollEl.scrollTop = 0
}

async function loadToCheckAssets(reset = true) {
  const filters = currentScanFilters()
  if (!filters) {
    listLoadId += 1
    toCheckItems.value = []
    assetsOffset.value = 0
    assetsHasMore.value = false
    clearAssetCounts()
    loadingAssets.value = false
    loadingMoreAssets.value = false
    scrollTableToTop()
    return
  }

  if (reset) {
    listLoadId += 1
    const loadId = listLoadId
    loadingMoreAssets.value = false
    loadingAssets.value = true
    assetsOffset.value = 0
    assetsHasMore.value = false
    toCheckItems.value = []
    scrollTableToTop()
    try {
      const { items, totalCount } = await listOfflineAssetScans({
        ...filters,
        listFilter: listFilter.value,
        limit: TO_CHECK_PAGE_SIZE,
        offset: 0,
      })
      if (loadId !== listLoadId) return
      toCheckItems.value = items.map(mapOfflineItem)
      assetsOffset.value = toCheckItems.value.length
      assetsHasMore.value = assetsOffset.value < totalCount
      await refreshAssetCounts()
      await nextTick()
      if (loadId !== listLoadId) return
      scrollTableToTop()
    } catch (err) {
      if (loadId !== listLoadId) return
      toCheckItems.value = []
      toast.add({
        severity: 'warn',
        summary: readApiFailure(err) || t('auth.invalid'),
        life: 2500,
        closable: false,
      })
    } finally {
      if (loadId === listLoadId) {
        loadingAssets.value = false
        loadingMoreAssets.value = false
      }
    }
    return
  }

  if (loadingMoreAssets.value || loadingAssets.value || !assetsHasMore.value) return
  const loadId = listLoadId
  loadingMoreAssets.value = true
  try {
    const { items, totalCount } = await listOfflineAssetScans({
      ...filters,
      listFilter: listFilter.value,
      limit: TO_CHECK_PAGE_SIZE,
      offset: assetsOffset.value,
    })
    if (loadId !== listLoadId) return
    const mapped = items.map(mapOfflineItem)
    toCheckItems.value.push(...mapped)
    assetsOffset.value += mapped.length
    assetsHasMore.value = assetsOffset.value < totalCount
    await refreshAssetCounts()
  } catch (err) {
    if (loadId !== listLoadId) return
    toast.add({
      severity: 'warn',
      summary: readApiFailure(err) || t('auth.invalid'),
      life: 2500,
      closable: false,
    })
  } finally {
    if (loadId === listLoadId) loadingMoreAssets.value = false
  }
}

function selectListFilter(value: OfflineScanListFilter) {
  if (filterDisabled.value) return
  listFilter.value = value
  void loadToCheckAssets(true)
}

function onTableScroll() {
  const el = tableScrollEl
  if (!el || loadingMoreAssets.value || loadingAssets.value || !assetsHasMore.value) return
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
    void loadToCheckAssets(false)
  }
}

function unbindTableScroll() {
  if (!tableScrollEl) return
  tableScrollEl.removeEventListener('scroll', onTableScroll)
  tableScrollEl = null
}

function bindTableScroll() {
  const next = tableWrapRef.value?.querySelector(
    '.p-datatable-table-container',
  ) as HTMLElement | null
  if (!next || next === tableScrollEl) return
  unbindTableScroll()
  tableScrollEl = next
  tableScrollEl.addEventListener('scroll', onTableScroll, { passive: true })
}

onMounted(() => {
  void nextTick(bindTableScroll)
  void refreshUnknownBadgeCount()
  void refreshPendingSyncCount()
})

onUnmounted(() => {
  unbindTableScroll()
  void closeLiveScanOverlay()
})

watch([toCheckItems, loadingAssets, listFilter], () => {
  void nextTick(bindTableScroll)
})

watch(syncPhase, (phase) => {
  if (phase !== 'finished') return
  void refreshPendingSyncCount()
  void refreshUnknownBadgeCount()
  void refreshAssetCounts()
  if (currentScanFilters()) void loadToCheckAssets(true)
})

function syncPositionOverlayWidth() {
  const el = document.querySelector('.position-select') as HTMLElement | null
  if (!el) return
  const width = `${Math.round(el.getBoundingClientRect().width)}px`
  positionOverlayStyle.value = { width, minWidth: width, maxWidth: width }
}

function syncOrganizationOverlayWidth() {
  const el = document.querySelector('.organization-select') as HTMLElement | null
  if (!el) return
  const width = `${Math.round(el.getBoundingClientRect().width)}px`
  organizationOverlayStyle.value = { width, minWidth: width, maxWidth: width }
}

async function onPositionShow() {
  if (!draftWarehouse.value) return
  syncPositionOverlayWidth()
  await loadPositions(draftWarehouse.value)
}

async function onOrganizationShow() {
  syncOrganizationOverlayWidth()
  await loadOrganizations()
}

async function openLocationDialog() {
  draftWarehouse.value = warehouse.value
  draftPosition.value = position.value
  draftOrganization.value = organization.value
  locationDialogOpen.value = true
  await loadWarehouses()
  if (draftWarehouse.value) {
    await Promise.all([loadPositions(draftWarehouse.value), loadOrganizations()])
  }
}

async function restoreLocationDraftFromApplied() {
  draftWarehouse.value = warehouse.value
  draftPosition.value = position.value
  draftOrganization.value = organization.value
  if (warehouse.value) {
    await Promise.all([loadPositions(warehouse.value), loadOrganizations()])
  } else {
    positionOptions.value = []
  }
}

async function closeLocationDialog() {
  locationDialogOpen.value = false
  await restoreLocationDraftFromApplied()
}

function clearAllLocationFilters() {
  draftWarehouse.value = null
  draftPosition.value = null
  draftOrganization.value = null
  positionOptions.value = []
}

function applyLocation() {
  if (!canApplyLocation.value) return

  if (draftLocationEmpty.value) {
    warehouse.value = null
    position.value = null
    organization.value = null
    locationDialogOpen.value = false
    unknownBadgeCount.value = 0
    listFilter.value = 'all'
    void loadToCheckAssets(true)
    return
  }

  warehouse.value = draftWarehouse.value
  position.value = draftPosition.value
  organization.value = draftOrganization.value
  locationDialogOpen.value = false
  listFilter.value = 'all'
  void loadToCheckAssets(true)
  void refreshUnknownBadgeCount()
}

async function loadPositions(warehouseId: string | null = draftWarehouse.value) {
  const loadId = ++positionLoadId
  if (!warehouseId) return
  const fid = factoryId.value
  if (fid === undefined) {
    positionOptions.value = []
    return
  }
  loadingPositions.value = true
  try {
    const rows = await listOfflinePositions(fid, Number(warehouseId))
    if (loadId !== positionLoadId) return
    positionOptions.value = rows
      .map((item) => {
        const wposition = item.wposition?.trim() || ''
        return {
          label: wposition,
          value: String(item.id),
          complete: false,
        }
      })
      .filter((item) => item.label)
    clearDraftPositionIfMissing()
  } catch (err) {
    if (loadId !== positionLoadId) return
    positionOptions.value = []
    toast.add({
      severity: 'warn',
      summary: readApiFailure(err) || t('auth.invalid'),
      life: 2500,
      closable: false,
    })
  } finally {
    if (loadId === positionLoadId) loadingPositions.value = false
  }
  if (loadId !== positionLoadId) return
  const cached = cachedScanProgress(warehouseId)
  if (cached) {
    paintPositionTicks(cached)
    return
  }
  void applyPositionTicks(loadId, warehouseId)
}

function progressIsComplete(row?: { total: number; scanned: number }) {
  return !!row && row.total > 0 && row.total === row.scanned
}

function positionCounts(
  progress: ScanProgressCache,
  positionId: number,
  orgName: string,
) {
  return sumBuckets(
    progress.buckets,
    (bucket) =>
      bucket.wPositionId === positionId &&
      (!orgName || orderMatchesOrg(bucket.orderCode, orgName, progress.orgKeys)),
  )
}

async function applyPositionTicks(loadId: number, warehouseId: string) {
  const progress = await ensureScanProgress(warehouseId)
  if (loadId !== positionLoadId) return
  paintPositionTicks(progress)
}

function paintPositionTicks(progress: ScanProgressCache | null) {
  const orgName = draftOrganization.value?.trim() || ''
  positionOptions.value = positionOptions.value
    .filter((item) => {
      if (!orgName || !progress) return true
      return positionCounts(progress, Number(item.value), orgName).total > 0
    })
    .map((item) => ({
      ...item,
      complete: progress
        ? progressIsComplete(positionCounts(progress, Number(item.value), orgName))
        : false,
    }))
  clearDraftPositionIfMissing()
}

async function loadOrganizations() {
  const loadId = ++organizationLoadId
  const fid = factoryId.value
  if (fid === undefined) {
    organizationOptions.value = []
    return
  }
  loadingOrganizations.value = true
  try {
    const rows = await listOfflineOrganizations(fid)
    if (loadId !== organizationLoadId) return
    organizationOptions.value = rows
      .map((item) => {
        const code = item.code?.trim() || ''
        const name = item.name?.trim() || ''
        return {
          label: name || code,
          value: name,
          complete: false,
        }
      })
      .filter((item) => item.value)
  } catch (err) {
    if (loadId !== organizationLoadId) return
    organizationOptions.value = []
    toast.add({
      severity: 'warn',
      summary: readApiFailure(err) || t('auth.invalid'),
      life: 2500,
      closable: false,
    })
  } finally {
    if (loadId === organizationLoadId) loadingOrganizations.value = false
  }
  if (loadId !== organizationLoadId) return
  const cached = cachedScanProgress(draftWarehouse.value)
  if (cached) {
    paintOrganizationTicks(cached)
    return
  }
  void applyOrganizationTicks(loadId)
}

function organizationCounts(
  progress: ScanProgressCache,
  orgName: string,
  positionId: number | null,
) {
  return sumBuckets(
    progress.buckets,
    (bucket) =>
      (positionId == null || bucket.wPositionId === positionId) &&
      orderMatchesOrg(bucket.orderCode, orgName, progress.orgKeys),
  )
}

async function applyOrganizationTicks(loadId: number) {
  const progress = await ensureScanProgress(draftWarehouse.value)
  if (loadId !== organizationLoadId) return
  paintOrganizationTicks(progress)
}

function paintOrganizationTicks(progress: ScanProgressCache | null) {
  const positionId = Number(draftPosition.value)
  const selectedPosition =
    draftPosition.value && Number.isFinite(positionId) ? positionId : null
  organizationOptions.value = organizationOptions.value
    .filter((item) => {
      if (selectedPosition == null || !progress) return true
      return organizationCounts(progress, item.value, selectedPosition).total > 0
    })
    .map((item) => ({
      ...item,
      complete: progress
        ? progressIsComplete(organizationCounts(progress, item.value, selectedPosition))
        : false,
    }))
  if (
    draftOrganization.value &&
    !organizationOptions.value.some((item) => item.value === draftOrganization.value)
  ) {
    draftOrganization.value = null
  }
}

const canScan = computed(
  () =>
    Boolean(warehouse.value) &&
    Boolean(position.value || organization.value) &&
    assetsTotal.value > 0,
)

watch([warehouse, position, organization, canScan], () => {
  void refreshUnknownBadgeCount()
})

watch(syncPhase, (next, prev) => {
  if (next === 'finished' || (prev === 'running' && next !== 'running')) {
    void refreshPendingSyncCount()
  }
})

const resultTitle = computed(() => {
  if (resultAwaitingPositionPick.value) return t('scan.pickWrongPosition')
  if (resultStatus.value === 'duplicate') return t('scan.resultDuplicate')
  if (resultStatus.value === 'notFound') return t('scan.resultNotFound')
  if (resultStatus.value === 'wrongWposition') return t('scan.resultWrongWposition')
  return t('scan.resultSuccess')
})

const resultWrongPicked = computed(() => Boolean(resultWrongPickId.value))

const resultDialogStatusClass = computed(() => {
  // Same-factory miss: red while awaiting Select.
  if (resultAwaitingPositionPick.value) return 'scan-result-wrongWposition'
  // After Select (pending or already scanned): sea-blue UI; API always WrongWposition.
  if (resultWrongPicked.value) return 'scan-result-wrongPending'
  return `scan-result-${resultStatus.value}`
})

const resultValueClass = computed(() => {
  if (resultAwaitingPositionPick.value) return 'scan-status-wrongWposition'
  if (resultWrongPicked.value) return 'scan-status-wrongPending'
  return `scan-status-${resultStatus.value}`
})

const showPositionPickSelect = computed(
  () =>
    resultAwaitingPositionPick.value ||
    resultFromPositionPick.value ||
    resultStatus.value === 'wrongWposition',
)

const showResultDetails = computed(() => {
  if (resultAwaitingPositionPick.value) return false
  if (resultFromPositionPick.value) return resultWrongPicked.value
  if (resultStatus.value === 'wrongWposition') return resultWrongPicked.value
  return true
})

const showResultOrigin = computed(
  () => resultWrongPicked.value && !resultAwaitingPositionPick.value,
)

const canConfirmResult = computed(() => {
  if (resultAwaitingPositionPick.value) return false
  if (resultFromPositionPick.value || resultStatus.value === 'wrongWposition') {
    return resultWrongPicked.value
  }
  return true
})

function parseQty(qty: string) {
  const [count = '0', expect = '1'] = qty.split('/')
  return {
    count: Number(count) || 0,
    expect: Number(expect) || 1,
  }
}

function toCheckRowClass(data: ScanTableRow) {
  if (listFilter.value === 'pending') return undefined
  if (data.status === 'pending') return undefined
  return `scan-row-${data.status}`
}

async function refreshVatNoBeforeClassify(code: string): Promise<void> {
  const cycleId = session.value?.cycleId
  if (cycleId === undefined || !online.value) return
  // Best-effort: timeout/failure → classify from local SQLite.
  await refreshOfflineAssetScansByVatNo(cycleId, code, { takeServerLocal: false })
}

async function lookupScanMatches(code: string): Promise<ScanTableRow[]> {
  const cycleId = session.value?.cycleId
  if (cycleId === undefined) return []
  const rows = await lookupOfflineAssetScansByVatNo(cycleId, code)
  return rows.map(mapOfflineItem)
}

function applyLocalScanProgress(
  row: ScanTableRow,
  status: OfflineLocalScanStatus,
  qty: string,
  scanBy?: string | null,
) {
  const existing = {
    isComplete: row.asset?.isComplete ?? null,
    isSuccess: row.asset?.isSuccess ?? null,
    isWarning: row.asset?.isWarning ?? null,
    isError: row.asset?.isError ?? null,
  }
  const merged = mergeScanFlags(existing, status)
  const effective = (statusFromScanFlags(merged) ?? status) as ScanRowStatus
  const nextScanBy =
    (status === 'success' || status === 'duplicate') && scanBy?.trim()
      ? scanBy.trim()
      : row.asset?.scanBy
  row.status = effective
  row.qty = qty
  row.asset = {
    ...(row.asset ?? {}),
    isComplete: merged.isComplete,
    isSuccess: merged.isSuccess,
    isWarning: merged.isWarning,
    isError: merged.isError,
    scanBy: nextScanBy,
  }
  return effective
}

async function persistLocalProgress(
  matches: ScanTableRow[],
  status: OfflineLocalScanStatus,
  count: number,
) {
  const ids = matches.map((row) => row.id).filter((id): id is string => Boolean(id))
  const scanBy = session.value?.userId?.trim() || null
  await updateOfflineAssetScanProgress(ids, status, count, { scanBy })
  invalidateScanProgressCache()
  if (locationDialogOpen.value && draftWarehouse.value) {
    void loadPositions(draftWarehouse.value)
    void loadOrganizations()
  }

  const primary = matches[0]
  const sticker = primary?.sticker
  if (!sticker) {
    await refreshAssetCounts()
    return
  }

  const expect = parseQty(primary.qty ?? '0/1').expect
  const qty = formatQty(count, expect)
  let effective: ScanRowStatus = status as ScanRowStatus

  for (const match of matches) {
    effective = applyLocalScanProgress(match, status, qty, scanBy)
  }
  for (const row of toCheckItems.value) {
    if (row.sticker !== sticker) continue
    effective = applyLocalScanProgress(row, status, qty, scanBy)
  }

  if (listFilter.value === 'pending' && effective !== 'pending') {
    toCheckItems.value = toCheckItems.value.filter((row) => row.sticker !== sticker)
  } else if (listFilter.value === 'scanned' && effective === 'pending') {
    toCheckItems.value = toCheckItems.value.filter((row) => row.sticker !== sticker)
  }

  await refreshAssetCounts()
}

function rowFactoryId(row: ScanTableRow): number | undefined {
  return row.factoryId ?? row.asset?.factoryId ?? undefined
}

function rowWarehouseId(row: ScanTableRow): number | undefined {
  return row.warehouseId ?? row.asset?.warehouseId ?? undefined
}

/** Selected warehouse + optional position/org must all match (AND). */
async function locationMatches(row: ScanTableRow): Promise<boolean> {
  const selectedWarehouseId = warehouse.value ? Number(warehouse.value) : NaN
  if (Number.isNaN(selectedWarehouseId)) return false
  if (rowWarehouseId(row) !== selectedWarehouseId) return false

  const selectedPositionId = position.value ? Number(position.value) : NaN
  if (!Number.isNaN(selectedPositionId)) {
    const assetPositionId = row.wPositionId ?? row.asset?.wPositionId
    if (assetPositionId == null || assetPositionId !== selectedPositionId) return false
  }

  const orgName = organization.value?.trim()
  if (orgName) {
    const sessionFactoryId = session.value?.factoryId
    if (sessionFactoryId == null) return false
    const owns = await organizationOwnsOrderCode(
      sessionFactoryId,
      orgName,
      row.orderCode || row.asset?.orderCode,
    )
    if (!owns) return false
  }

  return true
}

function pickWrongPositionPrimary(sameFactory: ScanTableRow[]): ScanTableRow {
  const selectedWarehouseId = warehouse.value ? Number(warehouse.value) : NaN
  if (!Number.isNaN(selectedWarehouseId)) {
    const nearWarehouse = sameFactory.find((row) => rowWarehouseId(row) === selectedWarehouseId)
    if (nearWarehouse) return nearWarehouse
  }
  return sameFactory[0]
}

interface ClassifyOutcome {
  scanResult: AiScanResultCode
  primary: ScanTableRow | null
  persistMatches: ScanTableRow[]
  /** Same-factory miss: open Select; API always WrongWposition after pick. */
  needsPositionPick?: boolean
  /**
   * isComplete + scanBy !== me: mirror BE into SQLite and upload with scanBy=me (no Exist dialog).
   * isComplete + scanBy === me: Exist dialog path (flag unset).
   */
  adoptRemoteComplete?: boolean
}

function scanResultFromAssetOrFlags(
  asset: ScanTableRow['asset'],
  flags: {
    isComplete?: boolean | null
    isSuccess?: boolean | null
    isWarning?: boolean | null
    isError?: boolean | null
  },
): AiScanResultCode {
  const raw = asset?.scanResult?.trim() || ''
  if (
    raw === 'Success' ||
    raw === 'Ok' ||
    raw === 'Exist' ||
    raw === 'Duplicate' ||
    raw === 'WrongWposition' ||
    raw === 'NotFound'
  ) {
    return raw
  }
  return scanResultFromCompletedFlags(flags)
}

/**
 * Full-list vatNo classify (both factories):
 * A NotFound | B Success / Exist (same factory + location by flags) |
 * B2 isComplete + other/missing scanBy → adoptRemoteComplete |
 * B3 isComplete + same scanBy → Exist dialog |
 * C same-factory wrong location → needsPositionPick |
 * D other-factory WrongWposition.
 */
async function classifyScanResult(matches: ScanTableRow[]): Promise<ClassifyOutcome> {
  if (!matches.length) {
    return { scanResult: 'NotFound', primary: null, persistMatches: [] }
  }

  const sessionFactoryId = session.value?.factoryId
  const currentUserId = session.value?.userId
  const sameFactory = matches.filter((row) => rowFactoryId(row) === sessionFactoryId)
  const otherFactory = matches.filter((row) => rowFactoryId(row) !== sessionFactoryId)

  if (sameFactory.length) {
    const locationHits: ScanTableRow[] = []
    for (const row of sameFactory) {
      if (await locationMatches(row)) locationHits.push(row)
    }

    if (locationHits.length) {
      const primary = locationHits[0]
      const flags = {
        isComplete: primary.asset?.isComplete,
        isSuccess: primary.asset?.isSuccess,
        isWarning: primary.asset?.isWarning,
        isError: primary.asset?.isError,
      }

      if (isAssetCompletedByFlags(flags)) {
        const scanResult = scanResultFromAssetOrFlags(primary.asset, flags)
        if (!isSameScanBy(primary.asset?.scanBy, currentUserId)) {
          return {
            scanResult,
            primary,
            persistMatches: locationHits,
            adoptRemoteComplete: true,
          }
        }
        return {
          scanResult: scanResultFromCompletedFlags(flags),
          primary,
          persistMatches: locationHits,
        }
      }

      const scanResult = classifyCorrectLocationScan(flags)
      return {
        scanResult,
        primary,
        persistMatches: locationHits,
      }
    }

    // Wrong location: open Select; API always WrongWposition after pick.
    const primary = pickWrongPositionPrimary(sameFactory)
    return {
      scanResult: 'WrongWposition',
      primary,
      persistMatches: sameFactory,
      needsPositionPick: true,
    }
  }

  if (otherFactory.length) {
    const primary = otherFactory[0]
    return { scanResult: 'WrongWposition', primary, persistMatches: [primary] }
  }

  return { scanResult: 'NotFound', primary: null, persistMatches: [] }
}

function rowStatusFromScanResult(scanResult: AiScanResultCode): ResultStatus {
  if (scanResult === 'Success' || scanResult === 'Ok') return 'success'
  if (scanResult === 'Exist' || scanResult === 'Duplicate') return 'duplicate'
  if (scanResult === 'NotFound') return 'notFound'
  // Classify only emits WrongWposition for location/other-factory misses.
  return 'wrongWposition'
}

function warehouseLabelForId(id: number | null | undefined) {
  if (id == null) return ''
  return warehouseOptions.value.find((item) => item.value === String(id))?.label || String(id)
}

async function resolveFactoryLabel(factoryId: number | null | undefined, fallback?: string | null) {
  const fromAsset = fallback?.trim()
  if (fromAsset) return fromAsset
  if (factoryId == null) return ''
  try {
    return await getOfflineFactoryName(factoryId)
  } catch {
    return String(factoryId)
  }
}

async function resolveWarehouseLabel(
  warehouseId: number | null | undefined,
  factoryId?: number | null,
  fallback?: string | null,
) {
  const fromAsset = fallback?.trim()
  if (fromAsset) return fromAsset
  if (warehouseId == null) return ''
  const fromOptions = warehouseLabelForId(warehouseId)
  if (fromOptions && fromOptions !== String(warehouseId)) return fromOptions
  try {
    return await getOfflineWarehouseName(warehouseId, factoryId)
  } catch {
    return String(warehouseId)
  }
}

function assetIsComplete(row: ScanTableRow | null | undefined) {
  return row?.asset?.isComplete === true
}

function expectCountOf(row: ScanTableRow | null | undefined) {
  const fromAsset = row?.asset?.count
  if (fromAsset != null && fromAsset > 0) return fromAsset
  return parseQty(row?.qty ?? '0/1').expect || 1
}

const resultIsComplete = ref(false)

const editableResultQty = computed(() => {
  if (resultAwaitingPositionPick.value) return false
  // After position pick: always enter scanCount (Dup or Wrong).
  if (resultFromPositionPick.value) return resultWrongPicked.value
  if (resultStatus.value === 'wrongWposition') return resultWrongPicked.value
  return resultIsComplete.value && resultStatus.value === 'duplicate'
})

function speakScanResult(status: ResultStatus) {
  if (
    status !== 'success' &&
    status !== 'duplicate' &&
    status !== 'wrongWposition' &&
    status !== 'notFound'
  ) {
    return
  }
  const text =
    status === 'duplicate'
      ? t('scan.speakResultDuplicate')
      : status === 'wrongWposition'
        ? t('scan.speakResultWrongWposition')
        : status === 'notFound'
          ? t('scan.speakResultNotFound')
          : t('scan.speakResultSuccess')
  void speakImportantText(text, ttsLangFromLocale(String(locale.value)))
}

function clearResultOriginFields() {
  resultOriginalFactory.value = ''
  resultOriginalWarehouse.value = ''
  resultOriginalPosition.value = ''
  resultOriginalOrg.value = ''
}

function wrongOptionLabel(row: ScanTableRow) {
  return row.originalWposition || row.asset?.wPosition?.trim() || String(row.wPositionId ?? '')
}

async function fillResultDetailsFromRow(status: ResultStatus, row: ScanTableRow) {
  const qty = parseQty(row.qty)
  const complete = assetIsComplete(row)
  const expect = expectCountOf(row) || 1
  // Per-position: local_scan_qty / API scanCount / row qty; else this row's count.
  const offline = row.asset as OfflineAssetScanItem | undefined
  const fromAsset = offline?.localScanQty ?? offline?.scanCount ?? null
  const savedScan =
    fromAsset != null && fromAsset > 0 ? fromAsset : qty.count > 0 ? qty.count : expect
  resultIsComplete.value = complete
  resultName.value = row.name
  // Placeholder + empty-save fallback (Exist & Wrong): empty input → resultScanMin.
  resultScanMin.value = savedScan
  resultCount.value =
    status === 'wrongWposition' || (complete && status === 'duplicate') ? null : qty.count
  resultExpect.value = expect
  resultOriginalFactory.value = await resolveFactoryLabel(
    row.factoryId ?? row.asset?.factoryId,
    row.asset?.factoryName,
  )
  resultOriginalWarehouse.value = await resolveWarehouseLabel(
    row.warehouseId ?? row.asset?.warehouseId,
    row.factoryId ?? row.asset?.factoryId,
    row.asset?.warehouseName,
  )
  resultOriginalPosition.value = row.originalWposition || row.asset?.wPosition?.trim() || ''
  resultOriginalOrg.value = row.orderCode || row.asset?.orderCode?.trim() || ''
}

async function loadWrongPositionOptions(vatNo: string) {
  resultWrongOptions.value = []
  resultWrongPickId.value = null
  const cycleId = session.value?.cycleId
  const fid = session.value?.factoryId
  if (cycleId === undefined || fid == null) return
  loadingWrongOptions.value = true
  try {
    const items = await lookupOfflineAssetScansByVatNoFactory(cycleId, vatNo, fid)
    resultWrongOptions.value = items
      .map(mapOfflineItem)
      .filter((row): row is ScanTableRow & { id: string } => Boolean(row.id))
      .map((row) => ({
        label: wrongOptionLabel(row),
        value: row.id,
        row,
      }))
  } catch {
    resultWrongOptions.value = []
  } finally {
    loadingWrongOptions.value = false
  }
}

async function onWrongPositionPick(id: string | null) {
  resultWrongPickId.value = id
  if (!id) {
    if (resultFromPositionPick.value) resultAwaitingPositionPick.value = true
    resultName.value = ''
    resultIsComplete.value = false
    resultCount.value = null
    resultExpect.value = 1
    resultScanMin.value = 1
    clearResultOriginFields()
    return
  }
  const selected = resultWrongOptions.value.find((item) => item.value === id)
  if (!selected) return

  // Wrong-position Select: always WrongWposition for API; UI uses wrongPending (cyan).
  const nextStatus: ResultStatus = 'wrongWposition'
  resultStatus.value = nextStatus
  resultAwaitingPositionPick.value = false
  await fillResultDetailsFromRow(nextStatus, selected.row)
  speakScanResult(nextStatus)
}

async function openResult(
  status: ResultStatus,
  row: ScanTableRow,
  opts?: { needsPositionPick?: boolean },
) {
  resultSticker.value = row.sticker
  resultWrongPickId.value = null
  resultWrongOptions.value = []
  resultAwaitingPositionPick.value = false
  resultFromPositionPick.value = false

  if (opts?.needsPositionPick) {
    resultFromPositionPick.value = true
    resultAwaitingPositionPick.value = true
    resultStatus.value = 'wrongWposition'
    resultName.value = ''
    resultIsComplete.value = false
    resultCount.value = null
    resultExpect.value = 1
    resultScanMin.value = 1
    clearResultOriginFields()
    resultOpen.value = true
    void speakImportantText(
      t('scan.speakPickWrongPosition'),
      ttsLangFromLocale(String(locale.value)),
    )
    await loadWrongPositionOptions(row.sticker)
    return
  }

  resultStatus.value = status
  if (status === 'wrongWposition') {
    resultName.value = ''
    resultIsComplete.value = false
    resultCount.value = null
    resultExpect.value = 1
    resultScanMin.value = 1
    clearResultOriginFields()
    resultOpen.value = true
    speakScanResult(status)
    await loadWrongPositionOptions(row.sticker)
    return
  }

  await fillResultDetailsFromRow(status, row)
  resultOpen.value = true
  speakScanResult(status)
}

async function openAreaSummary() {
  const params = unknownScanFiltersFromCurrent()
  if (!params || !canScan.value) return
  areaSummaryOpen.value = true
  loadingAreaSummary.value = true
  areaSummaryUnknownItems.value = []
  try {
    const [items, total] = await Promise.all([
      listOfflineUnknownScanCodes(params, AREA_SUMMARY_LIMIT),
      countOfflineUnknownScanCodes(params),
    ])
    areaSummaryUnknownItems.value = items
    unknownBadgeCount.value = total
  } catch {
    areaSummaryUnknownItems.value = []
  } finally {
    loadingAreaSummary.value = false
  }
}

function closeAreaSummary() {
  areaSummaryOpen.value = false
}

async function persistScan(value: string, kind: ScanResult['kind'], format: string) {
  const item: ScanResult = { value, format, kind, direction: direction.value }
  await remember(item)
  sessionItems.value.unshift(item)
}

async function buildScanCommandPayload(
  row: ScanTableRow | null,
  scanResult: AiScanResultCode,
  scanCount: number,
  vatNo: string,
): Promise<OfflineScanCommandPayload | null> {
  const scanBy = session.value?.userId?.trim() ?? ''
  const cycleId = session.value?.cycleId
  if (!scanBy || cycleId === undefined) return null

  const sessionFactoryId = session.value?.factoryId
  const asset = row?.asset
  const factoryTenantId =
    sessionFactoryId != null ? await getOfflineFactoryTenantId(sessionFactoryId) : null
  const expectCount =
    asset?.count != null && asset.count > 0
      ? asset.count
      : parseQty(row?.qty ?? '0/1').expect || 1

  return {
    factoryId: asset?.factoryId ?? sessionFactoryId ?? 0,
    tenantId: factoryTenantId,
    warehouseId: asset?.warehouseId ?? (warehouse.value ? Number(warehouse.value) : 0),
    wPositionId: asset?.wPositionId ?? (position.value ? Number(position.value) : 0),
    wPosition: asset?.wPosition ?? null,
    vatNo: asset?.vatNo ?? vatNo,
    orderCode:
      asset?.orderCode?.trim() ||
      row?.orderCode?.trim() ||
      organization.value?.trim() ||
      null,
    materialName: asset?.materialName ?? row?.name ?? null,
    count: expectCount,
    cycleId,
    scanResult,
    scanCount,
    scanAt: formatVietnamDateTime(),
    scanBy,
  }
}

async function queueAndMaybeSubmit(
  row: ScanTableRow | null,
  scanResult: AiScanResultCode,
  scanCount: number,
  vatNo: string,
): Promise<string | null> {
  const payload = await buildScanCommandPayload(row, scanResult, scanCount, vatNo)
  if (!payload) {
    toast.add({
      severity: 'warn',
      summary: t('user.needSession'),
      life: 2500,
      closable: false,
    })
    return null
  }
  const commandId = await enqueueScanCommand(payload)

  // Attach draft evidence (if any) before online upload so blob is available.
  let imageBlob: Blob | null = null
  const draft = pendingEvidence.value
  if (draft && draft.vatNo === vatNo.trim()) {
    try {
      imageBlob = await readBinaryFile(draft.path)
    } catch {
      imageBlob = null
    }
    await commitPendingEvidence(commandId)
  }

  void refreshPendingSyncCount()
  if (!online.value) return commandId

  try {
    if (scanResult === 'NotFound') {
      const res = await createScanFailLog({
        vatNo: payload.vatNo?.trim() || vatNo.trim(),
        cycleId: payload.cycleId,
        createdAt: payload.scanAt?.trim() || formatVietnamDateTime(),
        createdBy: payload.scanBy,
        image: imageBlob,
      })
      if (res.success === false) return commandId
      await deleteScanCommandsWithMedia([commandId])
      void refreshUnknownBadgeCount()
      void refreshPendingSyncCount()
      return commandId
    }
    const res = await createAiScanResult({
      ...payload,
      image: imageBlob,
    })
    if (res.success === false) return commandId
    await markScanCommandSynced(commandId)
    void refreshPendingSyncCount()
  } catch {
    // Offline-first: command stays pending for later sync.
  }
  return commandId
}

async function discardPendingEvidence() {
  const draft = pendingEvidence.value
  pendingEvidence.value = null
  if (draft?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(draft.previewUrl)
  await discardEvidenceFile(draft?.path)
}

async function commitPendingEvidence(commandId: string) {
  const draft = pendingEvidence.value
  if (!draft || !commandId) return
  await insertEvidenceMedia({
    id: draft.id,
    recordId: commandId,
    path: draft.path,
    mime: draft.mime,
    size: draft.size,
  })
  pendingEvidence.value = null
  if (draft.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(draft.previewUrl)
}

async function bindEvidenceIfMatching(commandId: string | null, vatNo: string) {
  const draft = pendingEvidence.value
  if (!commandId || !draft || draft.vatNo !== vatNo.trim()) return
  await commitPendingEvidence(commandId)
}

function toastNeedSession() {
  toast.add({
    severity: 'warn',
    summary: t('user.needSession'),
    life: 2500,
    closable: false,
  })
}

async function saveCode(
  value: string,
  kind: 'manual' | 'barcode',
  format: string,
): Promise<string | null> {
  const code = value.trim()
  if (!code || savingCode.value) return null
  savingCode.value = true
  manual.value = ''
  try {
    await refreshVatNoBeforeClassify(code)
    const matches = await lookupScanMatches(code)
    const outcome = await classifyScanResult(matches)
    const { scanResult, persistMatches, needsPositionPick, adoptRemoteComplete } = outcome

    if (scanResult === 'NotFound' || !outcome.primary) {
      const row: ScanTableRow = {
        sticker: code,
        qty: formatQty(1, 1),
        name: '',
        orderCode: '',
        originalWposition: '',
        status: 'notFound',
      }
      const payload = await buildScanCommandPayload(row, 'NotFound', 1, code)
      if (!payload) {
        toastNeedSession()
        return null
      }
      await persistScan(code, kind, format)
      const commandId = await queueAndMaybeSubmit(row, 'NotFound', 1, code)
      await refreshUnknownBadgeCount()
      await openResult('notFound', row)
      return commandId
    }

    const primary = outcome.primary
    const expect = expectCountOf(primary)
    const savedScan = parseQty(primary.qty).count
    const savedOrExpect = savedScan > 0 ? savedScan : expect

    // isComplete + other/missing scanBy: mirror BE into SQLite, upload with scanBy=me (no Exist dialog).
    if (adoptRemoteComplete && persistMatches.length) {
      const localStatus =
        statusFromScanFlags({
          isComplete: primary.asset?.isComplete,
          isSuccess: primary.asset?.isSuccess,
          isWarning: primary.asset?.isWarning,
          isError: primary.asset?.isError,
        }) ?? localStatusFromScanResult(scanResult)
      const displayCount = savedOrExpect
      const qty = formatQty(displayCount, expect)
      const status = rowStatusFromScanResult(scanResult)
      const row: ScanTableRow = {
        ...primary,
        qty,
        status,
        orderCode: primary.orderCode,
        originalWposition: primary.asset?.wPosition?.trim() || primary.originalWposition,
      }
      for (const match of persistMatches) {
        match.qty = qty
        applyLocalScanProgress(match, localStatus, qty)
      }
      await persistLocalProgress(persistMatches, localStatus, displayCount)
      await persistScan(code, kind, format)
      const commandId = await queueAndMaybeSubmit(row, scanResult, displayCount, code)
      if (currentScanFilters()) void loadToCheckAssets(true)
      else await refreshAssetCounts()
      return commandId
    }

    const status = rowStatusFromScanResult(scanResult)
    const complete = assetIsComplete(primary)
    // Success (no qty input): use SQLite/API saved scanCount, else count.
    // Exist complete: keep saved for dialog; incomplete non-Success: expect.
    const scannedCount = status === 'duplicate' ? savedScan || 1 : 1
    let displayCount =
      scanResult === 'Success' ? savedOrExpect : complete ? scannedCount : expect
    const qty = formatQty(displayCount, expect)
    const row: ScanTableRow = {
      ...primary,
      qty,
      status,
      orderCode: primary.orderCode,
      originalWposition: primary.asset?.wPosition?.trim() || primary.originalWposition,
    }

    // Needs position pick / Wrong / complete Dup: defer persist until dialog confirm.
    // Incomplete Dup/Ok: submit immediately.
    const deferSubmit =
      Boolean(needsPositionPick) ||
      scanResult === 'WrongWposition' ||
      (complete && scanResult === 'Exist')
    let submitScanCount =
      scanResult === 'Success' ? savedOrExpect : complete ? scannedCount : expect

    // Persist immediately unless waiting for pick or complete Dup qty input.
    if (!deferSubmit) {
      const payload = await buildScanCommandPayload(row, scanResult, submitScanCount, code)
      if (!payload) {
        toastNeedSession()
        return null
      }
      for (const match of persistMatches) {
        match.qty = qty
        match.status = status
      }
      await persistLocalProgress(
        persistMatches,
        localStatusFromScanResult(scanResult),
        displayCount,
      )
      await persistScan(code, kind, format)
      await openResult(status, row)
      return await queueAndMaybeSubmit(row, scanResult, submitScanCount, code)
    }

    await persistScan(code, kind, format)
    await openResult(status, row, { needsPositionPick: Boolean(needsPositionPick) })
    return null
  } finally {
    savingCode.value = false
  }
}

async function saveResultQty() {
  const status = resultStatus.value
  if (status !== 'duplicate' && status !== 'wrongWposition') return
  if (resultAwaitingPositionPick.value || !canConfirmResult.value) return
  if (status === 'duplicate' && !resultFromPositionPick.value && !resultIsComplete.value) return
  if (
    (status === 'wrongWposition' || resultFromPositionPick.value) &&
    !resultWrongPickId.value
  ) {
    return
  }

  const code = resultSticker.value

  // Online: refresh again before confirm so local flags match BE; still submit Exist with current user.
  if (online.value) {
    await refreshVatNoBeforeClassify(code)
  }

  let persistMatches: ScanTableRow[] = []
  let primary: ScanTableRow | undefined

  if (resultFromPositionPick.value || status === 'wrongWposition') {
    const picked = resultWrongOptions.value.find((item) => item.value === resultWrongPickId.value)
    primary = picked?.row
    if (!primary) return
    persistMatches = [primary]
  } else {
    const matches = await lookupScanMatches(code)
    const sessionFactoryId = session.value?.factoryId
    const sameFactory = matches.filter((row) => rowFactoryId(row) === sessionFactoryId)
    const pool = sameFactory.length ? sameFactory : matches
    const locationHits: ScanTableRow[] = []
    for (const row of pool) {
      if (await locationMatches(row)) locationHits.push(row)
    }
    persistMatches = locationHits.length ? locationHits : pool.slice(0, 1)
    primary = persistMatches[0]
    if (!primary) return
  }

  const needsEnteredCount =
    resultFromPositionPick.value || status === 'wrongWposition' || resultIsComplete.value
  // Empty input → resultScanMin (= count/expect); entered value → use as scanCount.
  let scanCount = needsEnteredCount
    ? resultCount.value == null || resultCount.value < 1
      ? resultScanMin.value
      : resultCount.value
    : resultExpect.value
  const qty = formatQty(scanCount, resultExpect.value)
  const scanResult: AiScanResultCode =
    resultFromPositionPick.value || resultWrongPicked.value || status === 'wrongWposition'
      ? 'WrongWposition'
      : status === 'duplicate'
        ? 'Exist'
        : 'WrongWposition'
  const localStatus = localStatusFromScanResult(scanResult)

  for (const match of persistMatches) {
    match.qty = qty
    match.status = status
  }
  const row: ScanTableRow = {
    ...primary,
    qty,
    status,
    orderCode: primary.orderCode,
    originalWposition: primary.asset?.wPosition?.trim() || primary.originalWposition,
  }
  const payload = await buildScanCommandPayload(row, scanResult, scanCount, code)
  if (!payload) {
    toastNeedSession()
    return
  }
  await persistLocalProgress(persistMatches, localStatus, scanCount)
  resultCount.value = scanCount
  resultOpen.value = false
  resultAwaitingPositionPick.value = false
  resultFromPositionPick.value = false
  const commandId = await queueAndMaybeSubmit(row, scanResult, scanCount, code)
  await bindEvidenceIfMatching(commandId, code)
}

function dismissWrongPositionDialog() {
  resultOpen.value = false
  resultAwaitingPositionPick.value = false
  resultFromPositionPick.value = false
}

function confirmResultDialog() {
  if (resultFromPositionPick.value || resultStatus.value === 'wrongWposition') {
    void saveResultQty()
    return
  }
  resultOpen.value = false
}

useBarcodeWedge(async (value) => {
  if (
    !canScan.value ||
    checking.value ||
    savingCode.value ||
    liveScanOpen.value ||
    resultOpen.value ||
    manualDialogOpen.value
  ) {
    return
  }
  await saveCode(value, 'barcode', 'WEDGE')
})

async function saveManual(): Promise<string | null> {
  if (!canScan.value || savingCode.value) return null
  return saveCode(manual.value, 'manual', 'MANUAL')
}

async function openManualDialog() {
  if (!canScan.value) return
  manualCloseAfterSubmit = false
  // Plain manual entry: never carry a draft photo.
  await discardPendingEvidence()
  manualDialogOpen.value = true
}

async function onManualDialogHide() {
  manual.value = ''
  if (manualCloseAfterSubmit) {
    manualCloseAfterSubmit = false
    return
  }
  await discardPendingEvidence()
}

function closeManualDialog() {
  manualDialogOpen.value = false
}

/** Toolbar camera: shoot first, then open dialog to type vatNo and bind photo. */
async function startEvidenceCaptureFlow() {
  if (!canScan.value || !draftPosition.value || capturingEvidence.value || savingCode.value) return
  const cycleId = session.value?.cycleId
  if (cycleId === undefined) {
    toastNeedSession()
    return
  }
  capturingEvidence.value = true
  try {
    if (pendingEvidence.value) await discardPendingEvidence()
    pendingEvidence.value = await captureEvidencePhoto({ cycleId, vatNo: 'pending' })
    manualCloseAfterSubmit = false
    manualDialogOpen.value = true
  } catch {
    await discardPendingEvidence()
    // toast.add({
    //   severity: 'warn',
    //   summary: t('scan.evidenceCaptureError'),
    //   life: 3000,
    //   closable: false,
    // })
  } finally {
    capturingEvidence.value = false
  }
}

async function clearManualEvidence() {
  await discardPendingEvidence()
  manualDialogOpen.value = false
}

async function submitManualDialog() {
  const code = manual.value.trim()
  if (!canScan.value || !code || savingCode.value) return
  if (pendingEvidence.value && pendingEvidence.value.vatNo !== code) {
    pendingEvidence.value = { ...pendingEvidence.value, vatNo: code }
  }
  const commandId = await saveManual()
  await bindEvidenceIfMatching(commandId, code)
  manualCloseAfterSubmit = true
  manualDialogOpen.value = false
  manual.value = ''
}

async function checkQR() {
  if (
    checking.value ||
    savingCode.value ||
    !canScan.value ||
    liveScanOpen.value ||
    resultOpen.value
  ) {
    return
  }
  checking.value = true
  try {
    let result: ScanResult
    try {
      if (preferLiveScan()) {
        result = await scanWithLiveFallback()
      } else {
        try {
          result = await scanOnce()
        } catch (err) {
          if (isScanCanceled(err)) return
          forcePreferLiveScan()
          result = await scanWithLiveFallback()
        }
      }
    } catch (err) {
      if (isScanCanceled(err)) return
      forcePreferLiveScan()
      toast.add({
        severity: 'warn',
        summary: t('scan.scanFallbackManual'),
        detail: err instanceof Error ? err.message : String(err),
        life: 3500,
        closable: false,
      })
      return
    }
    try {
      await saveCode(result.value, 'barcode', result.format || 'MLKIT')
    } catch (err) {
      toast.add({
        severity: 'warn',
        summary: err instanceof Error ? err.message : t('scan.commandError'),
        life: 3500,
        closable: false,
      })
    }
  } finally {
    checking.value = false
  }
}

</script>

<template>
  <div class="page-fill gap-2 overflow-hidden">
    <div class="page-fill-panel rounded-2xl border border-line bg-white p-2 shadow-panel">
      <div class="scan-location-bar flex min-w-0 items-center gap-3">
        <div class="min-w-0 flex-1">
          <p class="scan-location-bar__label m-0">{{ t('scan.locationTitle') }}</p>
          <p class="scan-location-bar__legend m-0">
            {{ t('scan.warehouse') }}
            <span aria-hidden="true"> -> </span>
            {{ t('scan.organization') }}
            <span aria-hidden="true"> -> </span>
            {{ t('scan.position') }}
          </p>
          <p class="scan-location-bar__value m-0" :title="locationSummary">
            {{ locationSummary }}
          </p>
        </div>
        <Button class="shrink-0" size="large" icon="pi pi-filter" @click="openLocationDialog" />
      </div>

      <Dialog v-model:visible="locationDialogOpen" modal class="scan-page-dialog scan-page-dialog--sm"
        :header="t('scan.changeLocationDialogTitle')" @hide="closeLocationDialog">
        <div class="mb-3 mt-2">
          <FloatLabel class="min-w-0">
            <Select input-id="warehouse" v-model="draftWarehouse" show-clear :options="warehouseOptions"
              option-label="label" option-value="value" class="w-full" :loading="loadingWarehouses"
              @before-show="loadWarehouses" @update:model-value="onDraftWarehouseChange" />
            <label for="warehouse">{{ t('scan.warehouse') }}</label>
          </FloatLabel>
        </div>

        <div class="mb-3 min-w-0">
          <FloatLabel class="min-w-0 w-full">
            <Select input-id="organization" v-model="draftOrganization" :options="organizationOptions"
              option-label="label" option-value="value" class="organization-select w-full" filter show-clear
              :disabled="!draftWarehouse" :loading="loadingOrganizations" :pt="{
                overlay: { class: 'organization-select-overlay', style: organizationOverlayStyle },
                listContainer: { class: 'w-full' },
                list: { class: 'w-full' },
                option: { class: 'organization-select-option w-full' },
                optionLabel: { class: 'organization-select-option-label' },
                label: { class: 'organization-select-label' },
              }" @before-show="onOrganizationShow">
              <template #option="slotProps">
                <span class="organization-select-option-row">
                  <i v-if="slotProps.option.complete" class="pi pi-check-circle position-select-option-check"
                    aria-hidden="true" />
                  <i v-else class="pi pi-clipboard" aria-hidden="true" />
                  <span class="organization-select-option-label">{{ slotProps.option.label }}</span>
                </span>
              </template>
            </Select>
            <label for="organization">{{ t('scan.organization') }}</label>
          </FloatLabel>
        </div>

        <div class="mb-3 min-w-0">
          <FloatLabel class="min-w-0 w-full">
            <Select input-id="position" v-model="draftPosition" :options="positionOptions" option-label="label"
              option-value="value" class="position-select w-full" filter show-clear :disabled="!draftWarehouse"
              :loading="loadingPositions" :pt="{
                overlay: { class: 'position-select-overlay', style: positionOverlayStyle },
                listContainer: { class: 'w-full' },
                list: { class: 'w-full' },
                option: { class: 'position-select-option w-full' },
                optionLabel: { class: 'position-select-option-label' },
                label: { class: 'position-select-label' },
              }" @before-show="onPositionShow">
              <template #option="slotProps">
                <span class="position-select-option-row">
                  <i v-if="slotProps.option.complete" class="pi pi-check-circle position-select-option-check"
                    aria-hidden="true" />
                  <i v-else class="pi pi-clipboard" aria-hidden="true" />
                  <span class="position-select-option-label">{{ slotProps.option.label }}</span>
                </span>
              </template>
            </Select>
            <label for="position">{{ t('scan.position') }}</label>
          </FloatLabel>
        </div>

        <div class="mt-4 flex justify-end gap-2">
          <Button :label="t('common.cancel')" size="large" severity="secondary" @click="closeLocationDialog" />
          <Button :label="t('scan.clearAllFilters')" size="large" severity="secondary" icon="pi pi-filter-slash"
            :disabled="!canClearDraftLocation" @click="clearAllLocationFilters" />
          <Button :label="t('scan.apply')" size="large" :disabled="!canApplyLocation" @click="applyLocation" />
        </div>
      </Dialog>

      <div class="scan-list flex min-h-0 flex-1 flex-col">
        <div class="scan-list__toolbar mb-2 flex flex-wrap items-center gap-2">
          <div class="scan-filter-chips flex min-w-0 flex-1 gap-2">
            <button v-for="opt in listFilterOptions" :key="opt.value" type="button" class="scan-filter-chip"
              :class="{ 'scan-filter-chip--active': listFilter === opt.value }" :disabled="filterDisabled"
              @click="selectListFilter(opt.value)">
              <span class="scan-filter-chip__label">{{ opt.label }}</span>
              <span class="scan-filter-chip__count">{{ opt.count }}</span>
            </button>
          </div>
          <span class="unknown-scan-btn">
            <Button icon="pi pi-exclamation-triangle" severity="danger" size="large" :disabled="!canScan"
              :loading="loadingAreaSummary" :aria-label="t('scan.areaSummaryTitle')" @click="openAreaSummary" />
            <span v-if="unknownBadgeCount > 0" class="scan-btn-badge scan-btn-badge--unknown"
              :class="{ 'scan-btn-badge--wide': unknownBadgeCount >= 100 }" aria-hidden="true">
              {{ unknownBadgeLabel }}
            </span>
          </span>
        </div>
        <div ref="tableWrapRef" class="table-wrap-fill">
          <DataTable :value="toCheckItems" :loading="loadingAssets" striped-rows row-hover scrollable
            scroll-height="flex" :row-class="toCheckRowClass">
            <template #empty>
              <div
                class="table-empty flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-muted">
                <i class="pi pi-inbox text-[1.75rem]" />
                <p class="m-0 font-semibold text-ink">{{ t('scan.emptyTitle') }}</p>
                <p class="m-0">{{ t('scan.emptyHint') }}</p>
              </div>
            </template>
            <Column :header="t('scan.index')" header-class="scan-col-tight-start" body-class="scan-col-tight-start">
              <template #body="{ index }">
                <span>{{ index + 1 }}</span>
              </template>
            </Column>
            <Column field="sticker" :header="t('scan.sticker')" header-class="scan-col-tight"
              body-class="scan-col-tight">
              <template #body="{ data }">
                <span>{{ data.sticker }}</span>
              </template>
            </Column>
            <Column field="qty" :header="t('scan.qty')">
              <template #body="{ data }">
                <span>{{ data.qty }}</span>
              </template>
            </Column>
            <Column field="name" :header="t('scan.name')"
              :style="toCheckItems ? undefined : { width: '350px', maxWidth: '350px' }" header-class="scan-col-name"
              body-class="scan-col-name">
              <template #body="{ data }">
                <span class="scan-col-name__text">{{ data.name }}</span>
              </template>
            </Column>
            <Column field="orderCode" :header="t('scan.orderCode')" header-class="scan-col-tight-end"
              body-class="scan-col-tight-end">
              <template #body="{ data }">
                <span>{{ data.orderCode }}</span>
              </template>
            </Column>
          </DataTable>
        </div>
      </div>
    </div>

    <div class="flex gap-2">
      <span class="unknown-scan-btn shrink-0">
        <Button icon="pi pi-cloud-upload" size="large" :loading="syncBusy" :disabled="!canStartSync"
          :aria-label="t('scan.syncTitle')" @click="openScanCommandSync" />
        <span v-if="pendingSyncCount > 0" class="scan-btn-badge scan-btn-badge--sync"
          :class="{ 'scan-btn-badge--wide': pendingSyncCount >= 100 }" aria-hidden="true">
          {{ pendingSyncBadgeLabel }}
        </span>
      </span>
      <Button icon="pi pi-camera" size="large" :aria-label="t('scan.captureEvidence')" :loading="capturingEvidence"
        :disabled="!canScan || !draftPosition || capturingEvidence || savingCode" @click="startEvidenceCaptureFlow" />
      <Button icon="pi pi-file-edit" size="large" :disabled="!canScan || !draftPosition"
        :aria-label="t('scan.manualTitle')" @click="openManualDialog" />
      <Button class="w-full" :label="t('scan.checkQRCode')" icon="pi pi-qrcode" size="large" :loading="checking"
        :disabled="checking || !canScan || !draftPosition" @click="checkQR" />
    </div>

    <Dialog v-model:visible="manualDialogOpen" modal class="scan-page-dialog scan-page-dialog--xs"
      :header="t('scan.manualTitle')" @hide="onManualDialogHide">
      <div v-if="pendingEvidence" class="manual-evidence-preview">
        <img :src="pendingEvidence.previewUrl" alt="" class="manual-evidence-preview__img" />
        <div class="manual-evidence-preview__meta">
          <p class="m-0 text-lg text-green-500">{{ t('scan.evidenceReady') }}</p>
        </div>
      </div>
      <div class="mt-2 flex items-center gap-2" :class="{ 'mt-4': pendingEvidence }">
        <FloatLabel class="min-w-0 flex-1">
          <InputText id="manual-input" name="manual-input" :model-value="manual" class="w-full uppercase"
            autocapitalize="characters" :disabled="!canScan"
            @update:model-value="manual = String($event ?? '').toUpperCase()" @keydown.enter="submitManualDialog" />
          <label for="manual-input">{{ pendingEvidence ? t('scan.pendingEvidencePlaceholder') :
            t('scan.manualPlaceholder')
          }}</label>
        </FloatLabel>
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <Button v-if="pendingEvidence" :label="t('common.cancel')" size="large" severity="secondary"
          @click="clearManualEvidence" />
        <Button v-else :label="t('common.cancel')" size="large" severity="secondary" @click="closeManualDialog" />
        <Button :label="t('scan.send')" size="large"
          :disabled="!pendingEvidence && !canScan || !manual.trim() || savingCode" @click="submitManualDialog" />
      </div>
    </Dialog>

    <Teleport to="body">
      <div v-if="liveScanOpen" class="live-scan-overlay" role="dialog" aria-modal="true"
        :aria-label="t('scan.liveScanTitle')">
        <div class="live-scan-overlay__bar">
          <p class="live-scan-overlay__hint m-0">{{ t('scan.liveScanHint') }}</p>
          <Button :label="t('scan.liveScanClose')" size="large" severity="secondary" @click="closeLiveScanOverlay" />
        </div>
        <div :id="LIVE_SCAN_ELEMENT_ID" class="live-scan-overlay__reader" />
      </div>
    </Teleport>

    <Dialog v-model:visible="resultOpen" modal :header="resultTitle"
      :class="['scan-page-dialog', 'scan-page-dialog--xs', 'scan-result-dialog', resultDialogStatusClass]">
      <div v-if="showPositionPickSelect" class="scan-result-wrong-pick">
        <FloatLabel class="scan-result-wrong-pick__field min-w-0 w-full">
          <Select input-id="result-wrong-position" v-model="resultWrongPickId" class="scan-result-wrong-select w-full"
            filter append-to="body" :options="resultWrongOptions" option-label="label" option-value="value" show-clear
            :loading="loadingWrongOptions" @update:model-value="onWrongPositionPick" />
          <label for="result-wrong-position">{{ t('scan.pickWrongPositionPlaceholder') }}</label>
        </FloatLabel>
      </div>
      <div v-if="resultSticker" class="scan-result-row">
        <p class="scan-result-label">{{ t('scan.sticker') }}</p>
        <p :class="['scan-result-value', resultValueClass]">{{ resultSticker }}</p>
      </div>
      <template v-if="showResultDetails">
        <div v-if="resultName" class="scan-result-row">
          <p class="scan-result-label">{{ t('scan.name') }}</p>
          <p :class="['scan-result-value', resultValueClass]">{{ resultName }}</p>
        </div>
        <template v-if="showResultOrigin">
          <div v-if="resultOriginalFactory" class="scan-result-row">
            <p class="scan-result-label">{{ t('scan.originFactory') }}</p>
            <p :class="['scan-result-value', resultValueClass]">{{ resultOriginalFactory }}</p>
          </div>
          <div v-if="resultOriginalWarehouse" class="scan-result-row">
            <p class="scan-result-label">{{ t('scan.originWarehouse') }}</p>
            <p :class="['scan-result-value', resultValueClass]">{{ resultOriginalWarehouse }}</p>
          </div>
          <div v-if="resultOriginalPosition" class="scan-result-row">
            <p class="scan-result-label">{{ t('scan.originalWposition') }}</p>
            <p :class="['scan-result-value', resultValueClass]">{{ resultOriginalPosition }}</p>
          </div>
          <div v-if="resultOriginalOrg" class="scan-result-row">
            <p class="scan-result-label">{{ t('scan.originOrganization') }}</p>
            <p :class="['scan-result-value', resultValueClass]">{{ resultOriginalOrg }}</p>
          </div>
        </template>
        <div class="scan-result-row">
          <p class="scan-result-label">{{ t('scan.qty') }}</p>
          <div v-if="editableResultQty" class="scan-result-qty">
            <InputNumber input-id="result-qty" v-model="resultCount" class="scan-result-qty-input" :use-grouping="false"
              :max-fraction-digits="0" inputmode="numeric" :placeholder="String(resultScanMin)" />
            <span :class="['scan-result-qty-expect', resultValueClass]">/{{ resultExpect }}</span>
          </div>
          <p v-else :class="['scan-result-value', resultValueClass]">{{ resultCount }}/{{ resultExpect }}</p>
        </div>
      </template>
      <template #footer>
        <Button v-if="resultSticker && resultStatus !== 'success' && resultStatus !== 'notFound'"
          :label="t('common.cancel')" size="large" severity="secondary"
          @click="resultStatus === 'wrongWposition' ? dismissWrongPositionDialog() : confirmResultDialog()" />
        <Button v-if="editableResultQty" :label="t('common.save')" size="large" :disabled="!canConfirmResult"
          @click="saveResultQty" />
        <Button v-else :label="t('common.ok')" size="large" :disabled="!canConfirmResult"
          @click="confirmResultDialog" />
      </template>
    </Dialog>

    <Dialog v-model:visible="areaSummaryOpen" modal dismissable-mask class="scan-page-dialog"
      :header="t('scan.areaSummaryTitle')" @hide="closeAreaSummary">
      <div v-if="loadingAreaSummary" class="py-4 text-center text-muted">
        <i class="pi pi-spin pi-spinner" />
      </div>
      <div v-else>
        <p v-if="!areaSummaryUnknownItems.length" class="m-0 text-sm text-muted">
          {{ t('scan.areaSummaryEmptyUnknown') }}
        </p>
        <DataTable v-else :value="areaSummaryUnknownItems" size="small" scrollable scroll-height="400px"
          class="scan-area-summary-table">
          <Column field="vatNo" :header="t('scan.sticker')" />
          <Column field="scanCount" :header="t('scan.areaSummaryScanCount')" />
          <Column :header="t('scan.areaSummaryPhoto')" style="width: 3.5rem">
            <template #body="{ data }">
              <i v-if="data.hasPhoto" class="pi pi-image text-muted" aria-hidden="true" />
            </template>
          </Column>
          <Column field="lastAt" :header="t('scan.time')">
            <template #body="{ data }">
              {{ formatVnTime(data.lastAt) }}
            </template>
          </Column>
        </DataTable>
      </div>

      <template #footer>
        <Button :label="t('common.ok')" size="large" @click="closeAreaSummary" />
      </template>
    </Dialog>
  </div>
</template>
