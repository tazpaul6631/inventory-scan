<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import DataTable from 'primevue/datatable'
import Button from 'primevue/button'
import Column from 'primevue/column'
import Checkbox from 'primevue/checkbox'
import Drawer from 'primevue/drawer'
import InputIcon from 'primevue/inputicon'
import IconField from 'primevue/iconfield'
import dayjs from 'dayjs'
import Select from '@/components/ui/AppSelect.vue'
import FloatLabel from '@/components/ui/AppFloatLabel.vue'
import DatePicker from '@/components/ui/AppDatePicker.vue'
import InputText from '@/components/ui/AppInputText.vue'
import Tag from '@/components/ui/AppTag.vue'
import { skeletonRows } from '@/composables/useTableSkeleton'
import { exportAssetInfoScanResultExcel, queryAssetInfoScanResult } from '@/services/api/asset'
import {
  getAreaList,
  getCycleBaseList,
  getFactoryList,
  getOrganizationList,
  getWarehouseList,
} from '@/services/api/category'
import { readApiFailure } from '@/services/api/error'
import { getUserBaseList } from '@/services/api/user'
import { resolveApiUrl } from '@/services/repositories/settings'
import { useSettingsStore } from '@/stores/settings'
import type { AssetQueryResultRequest, ViewAssetInfoScanResult } from '@/types/api'

const { t } = useI18n()

/** Split scan time into date (line 1) and time (line 2). Invalid values keep the raw text on line 1. */
function scanAtParts(value?: string | null): { date: string; time: string } {
  if (!value) return { date: '', time: '' }
  const parsed = dayjs(value)
  if (!parsed.isValid()) return { date: value, time: '' }
  return { date: parsed.format('DD/MM/YYYY'), time: parsed.format('HH:mm:ss') }
}

/** Local wall-clock datetime sent to the API (no UTC conversion). */
const API_LOCAL_DATETIME = 'YYYY-MM-DDTHH:mm:ss'

const toast = useToast()
const settings = useSettingsStore()
const loading = ref(false)
const exporting = ref(false)
const rows = ref<ViewAssetInfoScanResult[]>([])
const total = ref(0)
const page = ref(0)
const pageSize = ref(50)

const cycleId = ref<number | null>(null)
const factoryId = ref<number | null>(null)
const warehouseId = ref<number | null>(null)
const orderCode = ref<string | null>(null)
const wPosition = ref<number | null>(null)
const scanWPosition = ref<number | null>(null)
const dates = ref<Date[] | null>(null)
const scanBy = ref<string | null>(null)
const scanResult = ref<string | null>(null)
const vatNo = ref('')
const responsibleUnit = ref('')
/** Ticked (default): send isComplete = true. Unticked: isComplete is not sent. */
const isCompleteOnly = ref(true)
const filterDrawerVisible = ref(false)

const cycleOptions = ref<{ label: string; value: number }[]>([])
const factoryOptions = ref<{ label: string; value: number }[]>([])
const warehouseOptions = ref<{ label: string; value: number }[]>([])
const orderCodeOptions = ref<{ label: string; value: string }[]>([])
const wPositionOptions = ref<{ label: string; value: number }[]>([])
const scanWPositionOptions = ref<{ label: string; value: number }[]>([])
const loadingCycles = ref(false)
const loadingFactories = ref(false)
const loadingWarehouses = ref(false)
const loadingOrderCodes = ref(false)
const loadingwPosition = ref(false)
const loadingScanWPosition = ref(false)
const scanByOptions = ref<{ label: string; value: string }[]>([])
const loadingScanBy = ref(false)
/** Hardcoded scan-result filter. Label WrongPosition is sent as WrongWposition. */
const scanResultOptions = [
  { label: 'Success', value: 'Success' },
  { label: 'Exist', value: 'Exist' },
  { label: 'WrongWposition', value: 'WrongWposition' },
] as const

let cyclesLoaded = false
let factoriesLoaded = false
/** Factory key (`''` = no factory) the current option lists were loaded for; null = not loaded. */
let warehousesLoadedFor: string | null = null
let orderCodesLoadedFor: string | null = null
/** `factoryId|warehouseId` key the current position options were loaded for; null = not loaded. */
let wPositionsLoadedFor: string | null = null
/** Same key as `wPositionsLoadedFor`, for the scanned-position options. */
let scanWPositionsLoadedFor: string | null = null
let scanByLoaded = false
let loadRequestId = 0

/**
 * Typed text filters (vatNo / responsibleUnit). The inputs are only drafts; they are applied when the
 * drawer closes. Every other filter (select, date range, checkbox) is applied as soon as it changes.
 */
let appliedVatNo = ''
let appliedResponsibleUnit = ''

/** Filters actually sent to the API, so paging and export always match the table. */
type AppliedFilters = Omit<AssetQueryResultRequest, 'cycleId' | 'page' | 'pageSize'>
let appliedFilters: AppliedFilters = buildAppliedFilters()

function warnToast(summary: string) {
  toast.add({ severity: 'warn', summary, life: 2500, closable: false })
}

function factoryKey() {
  return factoryId.value == null ? '' : String(factoryId.value)
}

function factoryParams() {
  return factoryId.value == null ? {} : { factoryId: factoryId.value }
}

async function loadCycleOptions() {
  if (cyclesLoaded || loadingCycles.value) return
  loadingCycles.value = true
  try {
    const res = await getCycleBaseList()
    if (res.success === false) {
      warnToast(res.message || t('assetScanResult.loadCyclesError'))
      return
    }
    cycleOptions.value = (res.data ?? []).map((item) => ({
      label: item.name?.trim() || item.code?.trim() || String(item.id),
      value: item.id,
    }))
    cyclesLoaded = true
  } catch (err) {
    warnToast(readApiFailure(err) || t('assetScanResult.loadCyclesError'))
  } finally {
    loadingCycles.value = false
  }
}

async function loadFactoryOptions() {
  if (factoriesLoaded || loadingFactories.value) return
  loadingFactories.value = true
  try {
    const res = await getFactoryList()
    if (res.success === false) {
      warnToast(res.message || t('assetScanResult.loadFactoriesError'))
      return
    }
    factoryOptions.value = (res.data ?? []).map((item) => ({
      label: item.name?.trim() || item.abbr?.trim() || String(item.id),
      value: item.id,
    }))
    factoriesLoaded = true
  } catch (err) {
    warnToast(readApiFailure(err) || t('assetScanResult.loadFactoriesError'))
  } finally {
    loadingFactories.value = false
  }
}

async function loadWarehouseOptions() {
  const key = factoryKey()
  if (warehousesLoadedFor === key || loadingWarehouses.value) return
  loadingWarehouses.value = true
  try {
    const res = await getWarehouseList(factoryParams())
    if (key !== factoryKey()) return
    if (res.success === false) {
      warnToast(res.message || t('assetScanResult.loadWarehousesError'))
      return
    }
    warehouseOptions.value = (res.data ?? []).map((item) => ({
      label: item.name?.trim() || String(item.id),
      value: item.id,
    }))
    warehousesLoadedFor = key
  } catch (err) {
    warnToast(readApiFailure(err) || t('assetScanResult.loadWarehousesError'))
  } finally {
    loadingWarehouses.value = false
  }
}

async function loadOrderCodeOptions() {
  const key = factoryKey()
  if (orderCodesLoadedFor === key || loadingOrderCodes.value) return
  loadingOrderCodes.value = true
  try {
    const res = await getOrganizationList(factoryParams())
    if (key !== factoryKey()) return
    if (res.success === false) {
      warnToast(res.message || t('assetScanResult.loadOrderCodesError'))
      return
    }
    const names = new Set<string>()
    for (const item of res.data ?? []) {
      const name = item.name?.trim()
      if (name) names.add(name)
    }
    orderCodeOptions.value = [...names].map((name) => ({ label: name, value: name }))
    orderCodesLoadedFor = key
  } catch (err) {
    warnToast(readApiFailure(err) || t('assetScanResult.loadOrderCodesError'))
  } finally {
    loadingOrderCodes.value = false
  }
}

function wPositionKey() {
  return `${factoryId.value ?? ''}|${warehouseId.value ?? ''}`
}

async function loadwPositionOptions() {
  const key = wPositionKey()
  if (wPositionsLoadedFor === key || loadingwPosition.value) return
  loadingwPosition.value = true
  try {
    const res = await getAreaList({
      ...(factoryId.value != null ? { factoryId: factoryId.value } : {}),
      ...(warehouseId.value != null ? { warehouseId: warehouseId.value } : {}),
    })
    if (key !== wPositionKey()) return
    if (res.success === false) {
      warnToast(res.message || t('assetScanResult.loadPositionsError'))
      return
    }
    wPositionOptions.value = (res.data ?? []).map((item) => ({
      label: item.wposition?.trim() || String(item.id),
      value: item.id,
    }))
    wPositionsLoadedFor = key
  } catch (err) {
    warnToast(readApiFailure(err) || t('assetScanResult.loadPositionsError'))
  } finally {
    loadingwPosition.value = false
  }
}

async function loadScanWPositionOptions() {
  const key = wPositionKey()
  if (scanWPositionsLoadedFor === key || loadingScanWPosition.value) return
  loadingScanWPosition.value = true
  try {
    const res = await getAreaList({
      ...(factoryId.value != null ? { factoryId: factoryId.value } : {}),
      ...(warehouseId.value != null ? { warehouseId: warehouseId.value } : {}),
    })
    if (key !== wPositionKey()) return
    if (res.success === false) {
      warnToast(res.message || t('assetScanResult.loadPositionsError'))
      return
    }
    scanWPositionOptions.value = (res.data ?? []).map((item) => ({
      label: item.wposition?.trim() || String(item.id),
      value: item.id,
    }))
    scanWPositionsLoadedFor = key
  } catch (err) {
    warnToast(readApiFailure(err) || t('assetScanResult.loadPositionsError'))
  } finally {
    loadingScanWPosition.value = false
  }
}

async function loadScanByOptions() {
  if (scanByLoaded || loadingScanBy.value) return
  loadingScanBy.value = true
  try {
    const res = await getUserBaseList()
    if (res.success === false) {
      warnToast(res.message || t('assetScanResult.loadUsersError'))
      return
    }
    scanByOptions.value = (res.data ?? []).map((item) => {
      const code = item.code?.trim()
      const name = item.name?.trim()
      return {
        label: [code, name].filter(Boolean).join(' - ') || String(item.id),
        value: item.id,
      }
    })
    scanByLoaded = true
  } catch (err) {
    warnToast(readApiFailure(err) || t('assetScanResult.loadUsersError'))
  } finally {
    loadingScanBy.value = false
  }
}

function resetWPositionFilter() {
  wPosition.value = null
  wPositionOptions.value = []
  wPositionsLoadedFor = null
}

function resetScanWPositionFilter() {
  scanWPosition.value = null
  scanWPositionOptions.value = []
  scanWPositionsLoadedFor = null
}

function clearRows() {
  rows.value = []
  total.value = 0
}

/** scanAtFrom / scanAtTo only when both ends of the range are picked. */
function scanRangeParams(): { scanAtFrom?: string; scanAtTo?: string } {
  const [from, to] = dates.value ?? []
  if (!from || !to) return {}
  return {
    scanAtFrom: dayjs(from).startOf('day').format(API_LOCAL_DATETIME),
    scanAtTo: dayjs(to).endOf('day').format(API_LOCAL_DATETIME),
  }
}

/** Live select / date / checkbox values plus the already-applied text filters, as API filters. */
function buildAppliedFilters(): AppliedFilters {
  return {
    ...(factoryId.value != null ? { factoryId: factoryId.value } : {}),
    ...(warehouseId.value != null ? { warehouseId: warehouseId.value } : {}),
    ...(wPosition.value != null ? { wPositionId: wPosition.value } : {}),
    ...(scanWPosition.value != null ? { scanWPositionId: scanWPosition.value } : {}),
    ...(orderCode.value ? { orderCode: orderCode.value } : {}),
    ...(scanBy.value ? { scanBy: scanBy.value } : {}),
    ...(scanResult.value ? { scanResult: scanResult.value } : {}),
    ...(appliedVatNo ? { vatNo: appliedVatNo } : {}),
    ...(appliedResponsibleUnit ? { responsibleUnit: appliedResponsibleUnit } : {}),
    ...(isCompleteOnly.value ? { isComplete: true } : {}),
    ...scanRangeParams(),
  }
}

function commitFilters() {
  appliedFilters = buildAppliedFilters()
}

/** Filters applied to the table. Omits paging so export covers the full result. */
function scanResultFilterParams(selectedCycleId: number): AssetQueryResultRequest {
  return { cycleId: selectedCycleId, ...appliedFilters }
}

function exportDownloadName(filePath: string, fileName?: string | null): string {
  const named = fileName?.trim()
  if (named) return named
  const segment = filePath.split(/[\\/]/).pop()?.split('?')[0]?.trim()
  return segment || 'scan-results.xlsx'
}

/** Absolute filePath is used as-is. A relative path is joined to the API base. */
function exportFileUrl(filePath: string): string {
  if (/^https?:\/\//i.test(filePath)) return filePath
  const base = resolveApiUrl(settings.current.apiUrl).replace(/\/$/, '')
  const path = filePath.startsWith('/') ? filePath : `/${filePath}`
  return `${base}${path}`
}

function downloadExportFile(filePath: string, fileName?: string | null) {
  const frame = document.createElement('iframe')
  frame.hidden = true
  frame.src = exportFileUrl(filePath)
  frame.title = exportDownloadName(filePath, fileName)
  document.body.appendChild(frame)
  window.setTimeout(() => frame.remove(), 60_000)
}

async function onExportExcel() {
  const selectedCycleId = cycleId.value
  if (selectedCycleId == null || exporting.value) return
  exporting.value = true
  try {
    const res = await exportAssetInfoScanResultExcel(scanResultFilterParams(selectedCycleId))
    const filePath = res.data?.filePath?.trim()
    if (res.success === false || !filePath) {
      warnToast(res.message || t('assetScanResult.exportError'))
      return
    }
    await downloadExportFile(filePath, res.data?.fileName)
  } catch (err) {
    warnToast(readApiFailure(err) || t('assetScanResult.exportError'))
  } finally {
    exporting.value = false
  }
}

async function load() {
  const selectedCycleId = cycleId.value
  if (selectedCycleId == null) {
    loadRequestId += 1
    loading.value = false
    clearRows()
    return
  }
  const requestId = ++loadRequestId
  loading.value = true
  try {
    const res = await queryAssetInfoScanResult({
      page: page.value + 1,
      pageSize: pageSize.value,
      ...scanResultFilterParams(selectedCycleId),
    })
    if (requestId !== loadRequestId) return
    rows.value = res.data?.items ?? []
    total.value = res.data?.totalCount ?? rows.value.length
    if (res.success === false) {
      warnToast(res.message || t('assetScanResult.loadError'))
    }
  } catch (err) {
    if (requestId !== loadRequestId) return
    clearRows()
    warnToast(readApiFailure(err) || t('assetScanResult.loadError'))
  } finally {
    if (requestId === loadRequestId) loading.value = false
  }
}

function reloadFromFirstPage() {
  page.value = 0
  void load()
}

function resetFilters() {
  factoryId.value = null
  warehouseId.value = null
  orderCode.value = null
  dates.value = null
  scanBy.value = null
  scanResult.value = null
  isCompleteOnly.value = true
  vatNo.value = ''
  appliedVatNo = ''
  responsibleUnit.value = ''
  appliedResponsibleUnit = ''
  warehouseOptions.value = []
  orderCodeOptions.value = []
  warehousesLoadedFor = null
  orderCodesLoadedFor = null
  resetWPositionFilter()
  resetScanWPositionFilter()
}

function onCycleChange() {
  // Filters are unavailable when no cycle is picked; drop them (and close the drawer) so they cannot linger.
  if (cycleId.value == null) {
    resetFilters()
    commitFilters()
    filterDrawerVisible.value = false
  }
  reloadFromFirstPage()
}

/** Clear every filter except the cycle, then reload from the first page. */
function onResetFilters() {
  resetFilters()
  commitFilters()
  reloadFromFirstPage()
}

/** Select / checkbox changed: apply right away and reload from the first page. */
function onFilterChange() {
  commitFilters()
  reloadFromFirstPage()
}

function onFactoryChange() {
  warehouseId.value = null
  orderCode.value = null
  warehouseOptions.value = []
  orderCodeOptions.value = []
  warehousesLoadedFor = null
  orderCodesLoadedFor = null
  resetWPositionFilter()
  resetScanWPositionFilter()
  onFilterChange()
}

function onWarehouseChange() {
  resetWPositionFilter()
  resetScanWPositionFilter()
  onFilterChange()
}

function onDatesChange(value: unknown) {
  const range = Array.isArray(value) ? value : null
  const hasStart = Boolean(range?.[0])
  const hasEnd = Boolean(range?.[1])
  // Wait for both ends; also reload when the range is cleared.
  if (hasStart && !hasEnd) return
  onFilterChange()
}

/** Drawer closed: apply the typed vatNo / responsibleUnit; no request when nothing changed. */
function applyTextFilters() {
  appliedVatNo = vatNo.value.trim()
  appliedResponsibleUnit = responsibleUnit.value.trim()
  const next = buildAppliedFilters()
  if (JSON.stringify(next) === JSON.stringify(appliedFilters)) return
  appliedFilters = next
  reloadFromFirstPage()
}

watch(filterDrawerVisible, (open) => {
  if (!open) applyTextFilters()
})

/** Chip color follows isError > isWarning > isSuccess. Null means plain text. */
function scanResultSeverity(row: ViewAssetInfoScanResult): 'danger' | 'warn' | 'success' | null {
  if (row.isError) return 'danger'
  if (row.isWarning) return 'warn'
  if (row.isSuccess) return 'success'
  return null
}

function onPage(event: { page: number; rows: number }) {
  page.value = event.page
  pageSize.value = event.rows
  void load()
}
</script>

<template>
  <div class="asset-scan-results-page page-fill gap-3 overflow-hidden" :style="{ paddingBottom: 'var(--safe-bottom)' }">
    <div class="flex flex-wrap items-center justify-between gap-2 pt-2">
      <div class="flex items-center gap-2">
        <FloatLabel class="w-full min-w-70 max-w-70 flex-1">
          <Select input-id="scan-result-cycle" v-model="cycleId" :options="cycleOptions" option-label="label"
            option-value="value" show-clear class="w-full" :loading="loadingCycles" @before-show="loadCycleOptions"
            @update:model-value="onCycleChange" />
          <label for="scan-result-cycle">{{ t('assetScanResult.cycle') }}</label>
        </FloatLabel>
      </div>
      <template v-if="cycleId != null">
        <div class="flex shrink-0 items-center gap-2">
          <Button icon="pi pi-filter-fill" size="small" :aria-label="t('assetScanResult.filtersTitle')" outlined
            @click="filterDrawerVisible = true" />
          <Button icon="pi pi-refresh" size="small" severity="secondary" outlined
            :aria-label="t('assetScanResult.resetFiltersTitle')" @click="onResetFilters" />
          <Button icon="pi pi-file-excel" size="small" :aria-label="t('assetScanResult.exportTitle')"
            :loading="exporting" :disabled="exporting" @click="onExportExcel" />
        </div>
      </template>
    </div>

    <Drawer v-model:visible="filterDrawerVisible" position="right" :header="t('assetScanResult.filtersTitle')">
      <div class="flex items-center gap-2 text-sm">
        <Checkbox v-model="isCompleteOnly" :binary="true" input-id="scan-result-is-complete"
          @update:model-value="onFilterChange" />
        <label for="scan-result-is-complete" class="cursor-pointer select-none whitespace-nowrap">
          {{ t('assetScanResult.isComplete') }}
        </label>
      </div>
      <div class="grid grid-cols-1 gap-5 pt-5 md:grid-cols-1">
        <FloatLabel class="w-full">
          <IconField>
            <InputText id="scan-result-vat-no" v-model="vatNo" class="w-full" autocomplete="off"
              @keyup.enter="filterDrawerVisible = false" />
            <InputIcon v-if="vatNo" class="cursor-pointer" @click="vatNo = ''">
              <i class="pi pi-times" />
            </InputIcon>
          </IconField>
          <label for="scan-result-vat-no">{{ t('assetScanResult.vatNo') }}</label>
        </FloatLabel>
        <FloatLabel class="w-full">
          <Select input-id="scan-result-factory" v-model="factoryId" :options="factoryOptions" option-label="label"
            option-value="value" show-clear class="w-full" :loading="loadingFactories" @before-show="loadFactoryOptions"
            @update:model-value="onFactoryChange" />
          <label for="scan-result-factory">{{ t('assetScanResult.factory') }}</label>
        </FloatLabel>
        <FloatLabel class="w-full">
          <IconField>
            <InputText id="scan-result-responsible-unit" v-model="responsibleUnit" class="w-full" autocomplete="off"
              @keyup.enter="filterDrawerVisible = false" />
            <InputIcon v-if="responsibleUnit" class="cursor-pointer" @click="responsibleUnit = ''">
              <i class="pi pi-times" />
            </InputIcon>
          </IconField>
          <label for="scan-result-responsible-unit">{{ t('assetScanResult.responsibleUnit') }}</label>
        </FloatLabel>
        <FloatLabel class="w-full">
          <Select input-id="scan-result-order-code" v-model="orderCode" :options="orderCodeOptions" option-label="label"
            option-value="value" show-clear filter class="w-full" :loading="loadingOrderCodes"
            @before-show="loadOrderCodeOptions" @update:model-value="onFilterChange" />
          <label for="scan-result-order-code">{{ t('assetScanResult.orderCode') }}</label>
        </FloatLabel>
        <FloatLabel class="w-full">
          <Select input-id="scan-result-warehouse" v-model="warehouseId" :options="warehouseOptions"
            option-label="label" option-value="value" show-clear class="w-full" :loading="loadingWarehouses"
            @before-show="loadWarehouseOptions" @update:model-value="onWarehouseChange" />
          <label for="scan-result-warehouse">{{ t('assetScanResult.warehouse') }}</label>
        </FloatLabel>
        <FloatLabel class="w-full">
          <Select input-id="scan-result-wPosition" v-model="wPosition" :options="wPositionOptions" option-label="label"
            option-value="value" show-clear filter class="w-full" :loading="loadingwPosition"
            @before-show="loadwPositionOptions" @update:model-value="onFilterChange" />
          <label for="scan-result-wPosition">{{ t('assetScanResult.wPosition') }}</label>
        </FloatLabel>
        <FloatLabel class="w-full">
          <Select input-id="scan-result-scan-wPosition" v-model="scanWPosition" :options="scanWPositionOptions"
            option-label="label" option-value="value" show-clear filter class="w-full" :loading="loadingScanWPosition"
            @before-show="loadScanWPositionOptions" @update:model-value="onFilterChange" />
          <label for="scan-result-scan-wPosition">{{ t('assetScanResult.scanWPosition') }}</label>
        </FloatLabel>
        <FloatLabel class="w-full">
          <Select input-id="scan-result-scan-by" v-model="scanBy" :options="scanByOptions" option-label="label"
            option-value="value" show-clear filter class="w-full" :loading="loadingScanBy"
            @before-show="loadScanByOptions" @update:model-value="onFilterChange" />
          <label for="scan-result-scan-by">{{ t('assetScanResult.scanName') }}</label>
        </FloatLabel>
        <FloatLabel class="w-full">
          <Select input-id="scan-result-scan-result" v-model="scanResult" :options="scanResultOptions"
            option-label="label" option-value="value" show-clear class="w-full" @update:model-value="onFilterChange" />
          <label for="scan-result-scan-result">{{ t('assetScanResult.scanResult') }}</label>
        </FloatLabel>
        <FloatLabel class="w-full">
          <DatePicker input-id="scan-result-scan-at" v-model="dates" selection-mode="range" :manual-input="false"
            date-format="dd/mm/yy" show-clear class="w-full" @update:model-value="onDatesChange" />
          <label for="scan-result-scan-at">{{ t('assetScanResult.scanDateRange') }}</label>
        </FloatLabel>
      </div>
    </Drawer>

    <div class="page-fill-panel table-wrap-fill rounded-2xl border border-line bg-white p-2 shadow-panel">
      <DataTable :value="loading ? skeletonRows : rows" :class="{ 'table-skeleton': loading }" striped-rows row-hover
        lazy paginator scrollable scroll-height="flex" :rows="pageSize" :total-records="total" :first="page * pageSize"
        paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown CurrentPageReport"
        currentPageReportTemplate="Showing {first} to {last} of {totalRecords} entries"
        :rowsPerPageOptions="[50, 100, 200]" @page="onPage">
        <template #empty>
          <div class="table-empty flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-muted">
            <i class="pi pi-inbox text-[1.75rem]" />
            <template v-if="cycleId == null">
              <p class="m-0 font-semibold text-ink">{{ t('assetScanResult.selectCycleTitle') }}</p>
              <p class="m-0">{{ t('assetScanResult.selectCycleHint') }}</p>
            </template>
            <template v-else>
              <p class="m-0 font-semibold text-ink">{{ t('assetScanResult.emptyTitle') }}</p>
              <p class="m-0">{{ t('assetScanResult.emptyHint') }}</p>
            </template>
          </div>
        </template>
        <Column field="vatNo" :header="t('assetScanResult.vatNo')" />
        <Column field="materialCode" :header="t('assetScanResult.materialCode')" />
        <Column field="materialName" :header="t('assetScanResult.materialName')" />
        <Column field="materialEnName" :header="t('assetScanResult.materialEnName')" />
        <Column field="wPosition" :header="t('assetScanResult.wPosition')" />
        <Column field="warehouseName" :header="t('assetScanResult.warehouseName')" />
        <Column field="materialUnitNo" :header="t('assetScanResult.materialUnitNo')" />
        <Column field="orderCode" :header="t('assetScanResult.orderCode')" />
        <Column field="responsibleUnit" :header="t('assetScanResult.responsibleUnit')"
          header-class="!max-w-30 !whitespace-normal" />
        <Column field="count" :header="t('assetScanResult.count')" />
        <Column field="scanCount" :header="t('assetScanResult.scanCount')" />
        <Column field="scanWPosition" :header="t('assetScanResult.scanWPosition')">
          <template #body="{ data }">
            <span v-if="!loading">{{ data.scanWPosition || '—' }}</span>
          </template>
        </Column>
        <Column field="scanResult" :header="t('assetScanResult.scanResult')">
          <template #body="{ data }">
            <Tag v-if="!loading && scanResultSeverity(data)" :value="data.scanResult"
              :severity="scanResultSeverity(data)" />
            <span v-else-if="!loading">{{ data.scanResult || '—' }}</span>
          </template>
        </Column>
        <Column field="scanName" :header="t('assetScanResult.scanName')">
          <template #body="{ data }">
            <span v-if="!loading">{{ data.scanName || '—' }}</span>
          </template>
        </Column>
        <Column field="scanAt" :header="t('assetScanResult.scanAt')">
          <template #body="{ data }">
            <span v-if="!loading && !data.scanAt">—</span>
            <div v-else class="flex flex-col whitespace-nowrap leading-tight">
              <span>{{ scanAtParts(data.scanAt).date }}</span>
              <span>{{ scanAtParts(data.scanAt).time }}</span>
            </div>
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>
