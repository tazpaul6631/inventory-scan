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
import { createAiScanResult } from '@/services/api/asset'
import { readApiFailure } from '@/services/api/error'
import {
  countOfflineAssetScans,
  countPendingScanCommands,
  enqueueScanCommand,
  getOfflineFactoryName,
  getOfflineFactoryTenantId,
  getOfflineWarehouseName,
  listOfflineAssetScans,
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
  type OfflineAssetScanItem,
  type OfflineLocalScanStatus,
  type OfflineScanCommandPayload,
  type OfflineScanListFilter,
  type OfflineUnknownScanCode,
} from '@/services/repositories/offline-catalog'
import { useOfflineScanCommandSync } from '@/composables/useOfflineScanCommandSync'
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
const positionOptions = ref<{ label: string; value: string }[]>([])
const organizationOptions = ref<{ label: string; value: string }[]>([])
const loadingWarehouses = ref(false)
const loadingPositions = ref(false)
const loadingOrganizations = ref(false)
const loadingAssets = ref(false)
const positionOverlayStyle = ref<Record<string, string>>({})
const organizationOverlayStyle = ref<Record<string, string>>({})
const manual = ref('')
const manualDialogOpen = ref(false)
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
    pendingSyncCount.value = await countPendingScanCommands(cycleId)
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
  if (!value) return '...'
  return options.find((item) => item.value === value)?.label || value
}

const locationSummary = computed(
  () =>
    `${optionLabel(warehouseOptions.value, warehouse.value)} -> ${optionLabel(positionOptions.value, position.value)} -> ${optionLabel(organizationOptions.value, organization.value)}`,
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
}

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
    void loadToCheckAssets(true)
    return
  }

  warehouse.value = draftWarehouse.value
  position.value = draftPosition.value
  organization.value = draftOrganization.value
  locationDialogOpen.value = false
  void loadToCheckAssets(true)
  void refreshUnknownBadgeCount()
}

async function loadPositions(warehouseId: string | null = draftWarehouse.value) {
  if (loadingPositions.value || !warehouseId) return
  const fid = factoryId.value
  if (fid === undefined) {
    positionOptions.value = []
    return
  }
  loadingPositions.value = true
  try {
    const rows = await listOfflinePositions(fid, Number(warehouseId))
    positionOptions.value = rows
      .map((item) => {
        const wposition = item.wposition?.trim() || ''
        return { label: wposition, value: String(item.id) }
      })
      .filter((item) => item.label)
  } catch (err) {
    positionOptions.value = []
    toast.add({
      severity: 'warn',
      summary: readApiFailure(err) || t('auth.invalid'),
      life: 2500,
      closable: false,
    })
  } finally {
    loadingPositions.value = false
  }
}

async function loadOrganizations() {
  if (loadingOrganizations.value) return
  const fid = factoryId.value
  if (fid === undefined) {
    organizationOptions.value = []
    return
  }
  loadingOrganizations.value = true
  try {
    const rows = await listOfflineOrganizations(fid)
    organizationOptions.value = rows
      .map((item) => {
        const code = item.code?.trim() || ''
        const name = item.name?.trim() || ''
        return { label: name || code, value: name }
      })
      .filter((item) => item.value)
  } catch (err) {
    organizationOptions.value = []
    toast.add({
      severity: 'warn',
      summary: readApiFailure(err) || t('auth.invalid'),
      life: 2500,
      closable: false,
    })
  } finally {
    loadingOrganizations.value = false
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

const resultDialogStatusClass = computed(() => {
  if (resultAwaitingPositionPick.value) return undefined
  return `scan-result-${resultStatus.value}`
})

const resultValueClass = computed(() => {
  if (resultAwaitingPositionPick.value) return ''
  return `scan-status-${resultStatus.value}`
})

const resultWrongPicked = computed(() => Boolean(resultWrongPickId.value))

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
  () => resultStatus.value === 'wrongWposition' && resultWrongPicked.value,
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
) {
  const existing = {
    isComplete: row.asset?.isComplete ?? null,
    isSuccess: row.asset?.isSuccess ?? null,
    isWarning: row.asset?.isWarning ?? null,
    isError: row.asset?.isError ?? null,
  }
  const merged = mergeScanFlags(existing, status)
  const effective = (statusFromScanFlags(merged) ?? status) as ScanRowStatus
  row.status = effective
  row.qty = qty
  row.asset = {
    ...(row.asset ?? {}),
    isComplete: merged.isComplete,
    isSuccess: merged.isSuccess,
    isWarning: merged.isWarning,
    isError: merged.isError,
  }
  return effective
}

async function persistLocalProgress(
  matches: ScanTableRow[],
  status: OfflineLocalScanStatus,
  count: number,
) {
  const ids = matches.map((row) => row.id).filter((id): id is string => Boolean(id))
  await updateOfflineAssetScanProgress(ids, status, count)

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
    effective = applyLocalScanProgress(match, status, qty)
  }
  for (const row of toCheckItems.value) {
    if (row.sticker !== sticker) continue
    effective = applyLocalScanProgress(row, status, qty)
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
  /** Same-factory miss: open neutral Select; Dup vs Wrong decided after pick by isComplete. */
  needsPositionPick?: boolean
}

/**
 * Full-list vatNo classify (both factories):
 * A NotFound | B Ok / Duplicate (same factory + location) |
 * C same-factory wrong location → needsPositionPick |
 * D other-factory WrongWposition | E Duplicate only after pick when complete.
 */
async function classifyScanResult(matches: ScanTableRow[]): Promise<ClassifyOutcome> {
  if (!matches.length) {
    return { scanResult: 'NotFound', primary: null, persistMatches: [] }
  }

  const sessionFactoryId = session.value?.factoryId
  const sameFactory = matches.filter((row) => rowFactoryId(row) === sessionFactoryId)
  const otherFactory = matches.filter((row) => rowFactoryId(row) !== sessionFactoryId)

  if (sameFactory.length) {
    const locationHits: ScanTableRow[] = []
    for (const row of sameFactory) {
      if (await locationMatches(row)) locationHits.push(row)
    }

    if (locationHits.length) {
      const primary = locationHits[0]
      if (primary.status !== 'pending') {
        return { scanResult: 'Duplicate', primary, persistMatches: sameFactory }
      }
      return { scanResult: 'Ok', primary, persistMatches: locationHits }
    }

    // Wrong location: defer Dup vs Wrong until user picks a position.
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
  if (scanResult === 'Ok') return 'success'
  if (scanResult === 'Duplicate') return 'duplicate'
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
  resultIsComplete.value = complete
  resultName.value = row.name
  // Placeholder + empty-save fallback: scanCount defaults to asset.count.
  resultScanMin.value = expect
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

  const complete = assetIsComplete(selected.row)
  const nextStatus: ResultStatus = complete ? 'duplicate' : 'wrongWposition'
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
    scanAt: new Date().toISOString(),
    scanBy,
  }
}

async function queueAndMaybeSubmit(
  row: ScanTableRow | null,
  scanResult: AiScanResultCode,
  scanCount: number,
  vatNo: string,
) {
  const payload = await buildScanCommandPayload(row, scanResult, scanCount, vatNo)
  if (!payload) {
    toast.add({
      severity: 'warn',
      summary: t('user.needSession'),
      life: 2500,
      closable: false,
    })
    return false
  }
  const commandId = await enqueueScanCommand(payload)
  void refreshPendingSyncCount()
  // NotFound stays local (area summary); never upload / sync.
  if (scanResult === 'NotFound' || !online.value) return true
  try {
    const res = await createAiScanResult(payload)
    // Enqueued already — keep pending on sync failure (no warn; avoids false "scan failed").
    if (res.success === false) return true
    await markScanCommandSynced(commandId)
    void refreshPendingSyncCount()
  } catch {
    // Offline-first: command stays pending for later sync.
  }
  return true
}

function toastNeedSession() {
  toast.add({
    severity: 'warn',
    summary: t('user.needSession'),
    life: 2500,
    closable: false,
  })
}

async function saveCode(value: string, kind: 'manual' | 'barcode', format: string) {
  const code = value.trim()
  if (!code || savingCode.value) return
  savingCode.value = true
  manual.value = ''
  try {
    const matches = await lookupScanMatches(code)
    const outcome = await classifyScanResult(matches)
    const { scanResult, persistMatches, needsPositionPick } = outcome

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
        return
      }
      await persistScan(code, kind, format)
      await queueAndMaybeSubmit(row, 'NotFound', 1, code)
      await refreshUnknownBadgeCount()
      await openResult('notFound', row)
      return
    }

    const primary = outcome.primary
    const status = rowStatusFromScanResult(scanResult)
    const complete = assetIsComplete(primary)
    const expect = expectCountOf(primary)
    const scannedCount = status === 'duplicate' ? parseQty(primary.qty).count || 1 : 1
    // Incomplete: UI + API both use expect (scanCount = count). Complete Ok uses 1.
    const displayCount = complete ? scannedCount : expect
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
      (complete && scanResult === 'Duplicate')
    const submitScanCount = complete ? (scanResult === 'Ok' ? 1 : scannedCount) : expect

    // Persist immediately unless waiting for pick or complete Dup qty input.
    if (!deferSubmit) {
      const payload = await buildScanCommandPayload(row, scanResult, submitScanCount, code)
      if (!payload) {
        toastNeedSession()
        return
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
      await queueAndMaybeSubmit(row, scanResult, submitScanCount, code)
      return
    }

    await persistScan(code, kind, format)
    await openResult(status, row, { needsPositionPick: Boolean(needsPositionPick) })
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
    persistMatches = sameFactory.length ? sameFactory : matches
    primary = persistMatches[0]
    if (!primary) return
  }

  const needsEnteredCount =
    resultFromPositionPick.value || status === 'wrongWposition' || resultIsComplete.value
  const scanCount = needsEnteredCount
    ? resultCount.value == null || resultCount.value < 1
      ? resultScanMin.value
      : resultCount.value
    : resultExpect.value
  const qty = formatQty(scanCount, resultExpect.value)
  const scanResult: AiScanResultCode = status === 'duplicate' ? 'Duplicate' : 'WrongWposition'
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
  await queueAndMaybeSubmit(row, scanResult, scanCount, code)
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

async function saveManual() {
  if (!canScan.value || savingCode.value) return
  await saveCode(manual.value, 'manual', 'MANUAL')
}

function openManualDialog() {
  if (!canScan.value) return
  manualDialogOpen.value = true
}

function closeManualDialog() {
  manualDialogOpen.value = false
  manual.value = ''
}

async function submitManualDialog() {
  if (!canScan.value || !manual.value.trim() || savingCode.value) return
  await saveManual()
  closeManualDialog()
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
  <div class="page-fill gap-3 overflow-hidden">
    <div class="page-fill-panel rounded-2xl border border-line bg-white p-2 shadow-panel">
      <div class="scan-location-bar flex min-w-0 items-center gap-3">
        <div class="min-w-0 flex-1">
          <p class="scan-location-bar__label m-0">{{ t('scan.locationTitle') }}</p>
          <p class="scan-location-bar__legend m-0">
            {{ t('scan.warehouse') }}
            <span aria-hidden="true"> -› </span>
            {{ t('scan.position') }}
            <span aria-hidden="true"> -› </span>
            {{ t('scan.organization') }}
          </p>
          <p class="scan-location-bar__value m-0" :title="locationSummary">
            {{ locationSummary }}
          </p>
        </div>
        <Button class="shrink-0" size="large" icon="pi pi-filter" @click="openLocationDialog" />
      </div>

      <Dialog v-model:visible="locationDialogOpen" modal dismissable-mask class="scan-page-dialog scan-page-dialog--sm"
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
                  <span class="position-select-option-dot" aria-hidden="true" />
                  <span class="position-select-option-label">{{ slotProps.option.label }}</span>
                </span>
              </template>
            </Select>
            <label for="position">{{ t('scan.position') }}</label>
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
                  <span class="organization-select-option-dot" aria-hidden="true" />
                  <span class="organization-select-option-label">{{ slotProps.option.label }}</span>
                </span>
              </template>
            </Select>
            <label for="organization">{{ t('scan.organization') }}</label>
          </FloatLabel>
        </div>

        <div class="mt-4 flex justify-end gap-2">
          <Button :label="t('scan.clearAllFilters')" size="large" severity="secondary" icon="pi pi-trash"
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
      <Button icon="pi pi-clipboard" size="large" :disabled="!canScan" :aria-label="t('scan.manualTitle')"
        @click="openManualDialog" />
      <Button class="w-full" :label="t('scan.checkQR')" icon="pi pi-qrcode" size="large" :loading="checking"
        :disabled="checking || !canScan" @click="checkQR" />
    </div>

    <Dialog v-model:visible="manualDialogOpen" modal dismissable-mask class="scan-page-dialog scan-page-dialog--xs"
      :header="t('scan.manualTitle')" @hide="closeManualDialog">
      <div class="mt-2">
        <FloatLabel class="min-w-0 w-full">
          <InputText id="manual-input" name="manual-input" v-model="manual" class="w-full" :disabled="!canScan"
            @keydown.enter="submitManualDialog" />
          <label for="manual-input">{{ t('scan.manualPlaceholder') }}</label>
        </FloatLabel>
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <Button :label="t('common.cancel')" size="large" severity="secondary" @click="closeManualDialog" />
        <Button :label="t('scan.send')" size="large" :disabled="!canScan || !manual.trim()"
          @click="submitManualDialog" />
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

    <Dialog v-model:visible="resultOpen" modal dismissable-mask :header="resultTitle"
      :class="['scan-page-dialog', 'scan-page-dialog--xs', 'scan-result-dialog', resultDialogStatusClass]">
      <div v-if="resultSticker" class="scan-result-row">
        <p class="scan-result-label">{{ t('scan.sticker') }}</p>
        <p :class="['scan-result-value', resultValueClass]">{{ resultSticker }}</p>
      </div>
      <div v-if="showPositionPickSelect" class="scan-result-wrong-pick">
        <FloatLabel class="scan-result-wrong-pick__field min-w-0 w-full">
          <Select input-id="result-wrong-position" v-model="resultWrongPickId" class="scan-result-wrong-select w-full"
            filter append-to="body" :options="resultWrongOptions" option-label="label" option-value="value"
            :loading="loadingWrongOptions" @update:model-value="onWrongPositionPick" />
          <label for="result-wrong-position">{{ t('scan.pickWrongPositionPlaceholder') }}</label>
        </FloatLabel>
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
