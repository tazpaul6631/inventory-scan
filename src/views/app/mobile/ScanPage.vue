<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import dayjs from 'dayjs'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
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
import { scanOnce } from '@/adapters/barcode'
import { useAuthStore } from '@/stores/auth'
import { getAreaList, getWarehouseList } from '@/services/api/category'
import { createAiScanResult, queryAssetInfoViewResult } from '@/services/api/asset'
import { readApiFailure } from '@/services/api/error'
import type { AiScanResultCode, ViewAssetInfo } from '@/types/api'
import type { ScanDirection, ScanResult } from '@/types'

type ScanRowStatus = 'pending' | 'success' | 'duplicate' | 'notFound' | 'wrongWposition' | 'multiItems'
type ResultStatus = 'success' | 'duplicate' | 'notFound' | 'wrongWposition' | 'multiItems'

interface ScanTableRow {
  sticker: string
  qty: string
  name: string
  originalWposition: string
  status: ScanRowStatus
  wPositionId?: number
  asset?: ViewAssetInfo
}

const { t } = useI18n()
const toast = useToast()
const { session } = storeToRefs(useAuthStore())

const direction = ref<ScanDirection>('in')
const { remember } = useScan(direction)
const checking = ref(false)
const warehouse = ref<string | null>(null)
const position = ref<string | null>(null)
const warehouseOptions = ref<{ label: string; value: string }[]>([])
const positionOptions = ref<{ label: string; value: string }[]>([])
const loadingWarehouses = ref(false)
const loadingPositions = ref(false)
const loadingAssets = ref(false)
const positionOverlayStyle = ref<Record<string, string>>({})
const manual = ref('')
const sessionItems = ref<ScanResult[]>([])
const activeTab = ref('current')
const resultOpen = ref(false)
const resultStatus = ref<ResultStatus>('success')
const resultSticker = ref('')
const resultName = ref('')
const resultCount = ref<number | null>(1)
const resultExpect = ref(1)
const toCheckItems = ref<ScanTableRow[]>([])
const currentRows = ref<ScanTableRow[]>([])

const factoryId = computed(() => session.value?.factoryId)

function formatQty(count: number, expect: number) {
  return `${count}/${expect}`
}

async function loadWarehouses() {
  if (loadingWarehouses.value) return
  loadingWarehouses.value = true
  try {
    const res = await getWarehouseList(
      factoryId.value === undefined ? {} : { factoryId: factoryId.value },
    )
    warehouseOptions.value = (res.data ?? [])
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

function onWarehouseChange() {
  position.value = null
  positionOptions.value = []
  toCheckItems.value = []
}

async function loadToCheckAssets() {
  const fid = factoryId.value
  const warehouseId = warehouse.value ? Number(warehouse.value) : NaN
  const wPositionId = position.value ? Number(position.value) : NaN
  if (fid === undefined || Number.isNaN(warehouseId) || Number.isNaN(wPositionId)) {
    toCheckItems.value = []
    return
  }
  if (loadingAssets.value) return
  loadingAssets.value = true
  try {
    const res = await queryAssetInfoViewResult({
      page: 1,
      pageSize: 1000,
      factoryId: fid,
      warehouseId,
      wPositionId,
    })
    toCheckItems.value = (res.data?.items ?? []).map((item) => ({
      sticker: item.vatNo?.trim() || '',
      qty: formatQty(0, item.count || 1),
      name: item.materialName?.trim() || '',
      originalWposition: item.wPosition?.trim() || '',
      status: 'pending' as const,
      wPositionId: item.wPositionId,
      asset: item,
    }))
    if (res.success === false) {
      toast.add({
        severity: 'warn',
        summary: res.message || t('auth.invalid'),
        life: 2500,
        closable: false,
      })
    }
  } catch (err) {
    toCheckItems.value = []
    toast.add({
      severity: 'warn',
      summary: readApiFailure(err) || t('auth.invalid'),
      life: 2500,
      closable: false,
    })
  } finally {
    loadingAssets.value = false
  }
}

function onPositionChange() {
  void loadToCheckAssets()
}

function syncPositionOverlayWidth() {
  const el = document.querySelector('.position-select') as HTMLElement | null
  if (!el) return
  const width = `${Math.round(el.getBoundingClientRect().width)}px`
  positionOverlayStyle.value = { width, minWidth: width, maxWidth: width }
}

async function onPositionShow() {
  if (!warehouse.value) return
  syncPositionOverlayWidth()
  await loadPositions()
}

async function loadPositions() {
  if (loadingPositions.value || !warehouse.value) return
  loadingPositions.value = true
  try {
    const res = await getAreaList({
      ...(factoryId.value === undefined ? {} : { factoryId: factoryId.value }),
      warehouseId: Number(warehouse.value),
    })
    positionOptions.value = (res.data ?? [])
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

const factoryLabel = computed(
  () => session.value?.abbr?.trim() || session.value?.factory?.trim() || '',
)
const cycleLabel = computed(() => {
  const cycle = session.value?.cycle?.trim()
  if (!cycle) return ''
  const parsed = dayjs(cycle)
  return parsed.isValid() ? parsed.format('DD/MM/YYYY') : cycle
})

const toCheckRemaining = computed(
  () => toCheckItems.value.filter((row) => row.status === 'pending').length,
)
const toCheckTotal = computed(() => toCheckItems.value.length)
const canScan = computed(() => Boolean(position.value) && toCheckItems.value.length > 0)

const resultTitle = computed(() => {
  if (resultStatus.value === 'duplicate') return t('scan.resultDuplicate')
  if (resultStatus.value === 'notFound') return t('scan.resultNotFound')
  if (resultStatus.value === 'wrongWposition') return t('scan.resultWrongWposition')
  if (resultStatus.value === 'multiItems') return t('scan.resultMultiItems')
  return t('scan.resultSuccess')
})

const resultValueClass = computed(() => `scan-status-${resultStatus.value}`)

function parseQty(qty: string) {
  const [count = '0', expect = '1'] = qty.split('/')
  return {
    count: Number(count) || 0,
    expect: Number(expect) || 1,
  }
}

function statusClass(status: ScanRowStatus) {
  return status === 'pending' ? '' : `scan-status-${status}`
}

function findToCheckMatches(code: string) {
  return toCheckItems.value.filter((row) => row.sticker === code)
}

function resolveScanResult(matches: ScanTableRow[]): AiScanResultCode {
  if (matches.length > 1) return 'MultiItems'
  const selectedPositionId = position.value ? Number(position.value) : NaN
  const assetPositionId = matches[0]?.wPositionId
  if (
    assetPositionId !== undefined &&
    !Number.isNaN(selectedPositionId) &&
    assetPositionId === selectedPositionId
  ) {
    return 'Ok'
  }
  return 'WrongWposition'
}

function rowStatusFromScanResult(scanResult: AiScanResultCode): Exclude<ScanRowStatus, 'pending' | 'duplicate' | 'notFound'> {
  if (scanResult === 'Ok') return 'success'
  if (scanResult === 'WrongWposition') return 'wrongWposition'
  return 'multiItems'
}

function resultStatusFromScanResult(scanResult: AiScanResultCode): Exclude<ResultStatus, 'duplicate' | 'notFound'> {
  return rowStatusFromScanResult(scanResult)
}

function upsertCurrent(row: ScanTableRow) {
  const index = currentRows.value.findIndex((item) => item.sticker === row.sticker)
  if (index >= 0) {
    currentRows.value[index] = { ...currentRows.value[index], ...row }
    return
  }
  currentRows.value.unshift(row)
}

function openResult(status: ResultStatus, row: ScanTableRow) {
  const qty = parseQty(row.qty)
  resultStatus.value = status
  resultSticker.value = row.sticker
  resultName.value = row.name
  resultCount.value = qty.count
  resultExpect.value = qty.expect
  resultOpen.value = true
}

async function persistScan(value: string, kind: ScanResult['kind'], format: string) {
  const item: ScanResult = { value, format, kind, direction: direction.value }
  await remember(item)
  sessionItems.value.unshift(item)
}

async function submitScanCommand(row: ScanTableRow, scanResult: AiScanResultCode, count: number) {
  const asset = row.asset
  const createdBy = session.value?.userId?.trim() ?? ''
  const cycleId = session.value?.cycleId
  if (!asset || !createdBy || cycleId === undefined) {
    toast.add({
      severity: 'warn',
      summary: t('user.needSession'),
      life: 2500,
      closable: false,
    })
    return
  }
  try {
    const res = await createAiScanResult({
      factoryId: asset.factoryId ?? session.value?.factoryId ?? 0,
      tenantId: asset.tenantId ?? null,
      warehouseId: asset.warehouseId ?? (warehouse.value ? Number(warehouse.value) : 0),
      factoryName: asset.factoryName ?? session.value?.factoryName ?? null,
      warehouseName: asset.warehouseName ?? warehouseOptions.value.find((item) => item.value === warehouse.value)?.label ?? null,
      wPositionId: asset.wPositionId ?? 0,
      wPosition: asset.wPosition ?? null,
      vatNo: asset.vatNo ?? row.sticker,
      styleDocTreeId: asset.styleDocTreeId,
      orderCode: asset.orderCode ?? null,
      styleCode: asset.styleCode ?? null,
      materialId: asset.materialId,
      materialName: asset.materialName ?? null,
      materialEnName: asset.materialEnName ?? null,
      materialCode: asset.materialCode ?? null,
      materialClass: asset.materialClass ?? null,
      materialSubClass: asset.materialSubClass ?? null,
      responsibleUnit: asset.responsibleUnit ?? null,
      materialUnitId: asset.materialUnitId,
      materialUnitNo: asset.materialUnitNo ?? null,
      managementAccounting: asset.managementAccounting ?? null,
      assetState: asset.assetState ?? null,
      quality: asset.quality ?? null,
      rollNo: asset.rollNo ?? null,
      batchNo: asset.batchNo ?? null,
      count,
      cycleId,
      scanResult,
      createdBy,
    })
    if (res.success === false) {
      toast.add({
        severity: 'warn',
        summary: res.message || t('scan.commandError'),
        life: 2500,
        closable: false,
      })
    }
  } catch (err) {
    toast.add({
      severity: 'warn',
      summary: readApiFailure(err) || t('scan.commandError'),
      life: 2500,
      closable: false,
    })
  }
}

async function saveCode(value: string, kind: 'manual' | 'barcode', format: string) {
  const code = value.trim()
  if (!code) return
  manual.value = ''

  const matches = findToCheckMatches(code)
  if (!matches.length) {
    const row: ScanTableRow = {
      sticker: code,
      qty: formatQty(1, 1),
      name: '',
      originalWposition: '',
      status: 'notFound',
    }
    upsertCurrent(row)
    await persistScan(code, kind, format)
    openResult('notFound', row)
    return
  }

  const primary = matches[0]
  const alreadyScanned = matches.some((row) => row.status !== 'pending')
  if (alreadyScanned) {
    const scanResult = resolveScanResult(matches)
    const count = Math.max(1, parseQty(primary.qty).count)
    await submitScanCommand(
      {
        ...primary,
        originalWposition: primary.asset?.wPosition?.trim() || primary.originalWposition,
      },
      scanResult,
      count,
    )
    openResult('duplicate', primary)
    return
  }

  const scanResult = resolveScanResult(matches)
  const rowStatus = rowStatusFromScanResult(scanResult)
  const qty = formatQty(1, parseQty(primary.qty).expect)
  for (const match of matches) {
    match.qty = qty
    match.status = rowStatus
  }
  const row: ScanTableRow = {
    ...primary,
    qty,
    status: rowStatus,
    originalWposition: primary.asset?.wPosition?.trim() || primary.originalWposition,
  }
  upsertCurrent(row)
  await persistScan(code, kind, format)
  await submitScanCommand(row, scanResult, 1)
  openResult(resultStatusFromScanResult(scanResult), row)
}

async function saveDuplicateQty() {
  const code = resultSticker.value
  const matches = findToCheckMatches(code)
  const primary = matches[0]
  if (!primary) return
  const count = resultCount.value == null || resultCount.value < 1 ? 1 : resultCount.value
  const qty = formatQty(count, resultExpect.value)
  const scanResult = resolveScanResult(matches)
  for (const match of matches) {
    match.qty = qty
    match.status = 'duplicate'
  }
  const row: ScanTableRow = {
    ...primary,
    qty,
    status: 'duplicate',
    originalWposition: primary.asset?.wPosition?.trim() || primary.originalWposition,
  }
  upsertCurrent(row)
  await submitScanCommand(row, scanResult, count)
  resultCount.value = count
  resultOpen.value = false
}

useBarcodeWedge(async (value) => {
  if (!canScan.value) return
  await saveCode(value, 'barcode', 'WEDGE')
})

async function saveManual() {
  if (!canScan.value) return
  await saveCode(manual.value, 'manual', 'MANUAL')
}

function isScanCanceled(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  return /cancel/i.test(message)
}

async function checkQR() {
  if (checking.value || !canScan.value) return
  checking.value = true
  try {
    const result = await scanOnce()
    await saveCode(result.value, 'barcode', result.format || 'MLKIT')
  } catch (err) {
    if (isScanCanceled(err)) return
    toast.add({
      severity: 'warn',
      summary: err instanceof Error ? err.message : String(err),
      life: 2500,
      closable: false,
    })
  } finally {
    checking.value = false
  }
}
</script>

<template>
  <div class="page-fill gap-3 overflow-hidden" :style="{ paddingBottom: 'var(--safe-bottom)' }">
    <div class="page-fill-panel rounded-2xl border border-line bg-white p-3 shadow-panel">
      <div class="mb-3 grid grid-cols-[auto_auto_auto] items-center justify-center gap-2">
        <span
          class="text-center m-auto border bg-background border-line rounded-xl px-2 py-1 text-lg font-bold text-ink">
          {{ factoryLabel }}
        </span>
        <span class="text-center m-auto text-lg font-bold text-ink">-</span>
        <span
          class="text-center m-auto border bg-background border-line rounded-xl px-2 py-1 text-lg font-bold text-ink">
          {{ cycleLabel }}
        </span>
      </div>

      <div class="mb-3">
        <FloatLabel class="min-w-0">
          <Select input-id="warehouse" v-model="warehouse" :options="warehouseOptions" option-label="label"
            option-value="value" class="w-full" :loading="loadingWarehouses" @before-show="loadWarehouses"
            @update:model-value="onWarehouseChange" />
          <label for="warehouse">{{ t('scan.warehouse') }}</label>
        </FloatLabel>
      </div>

      <div class="mb-3 min-w-0">
        <FloatLabel class="min-w-0 w-full">
          <Select input-id="position" v-model="position" :options="positionOptions" option-label="label"
            option-value="value" class="position-select w-full" filter :disabled="!warehouse"
            :loading="loadingPositions || loadingAssets" :pt="{
              overlay: { class: 'position-select-overlay', style: positionOverlayStyle },
              listContainer: { class: 'w-full' },
              list: { class: 'w-full' },
              option: { class: 'position-select-option w-full' },
              optionLabel: { class: 'position-select-option-label' },
              label: { class: 'position-select-label' },
            }" @before-show="onPositionShow" @update:model-value="onPositionChange">
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

      <div class="flex shrink-0 items-center gap-2">
        <FloatLabel class="min-w-0 flex-1">
          <InputText id="manual-input" name="manual-input" v-model="manual" class="w-full" :disabled="!canScan"
            @keydown.enter="saveManual" />
          <label for="manual-input">{{ t('scan.manualPlaceholder') }}</label>
        </FloatLabel>
        <Button class="shrink-0" :label="t('common.save')" :disabled="!canScan || !manual.trim()" @click="saveManual" />
      </div>

      <Tabs v-model:value="activeTab" scrollable class="scan-tabs mt-3 min-h-0 flex-1 overflow-hidden">
        <TabList :pt="{
          activeBar: {
            class: '!top-1 !z-0 !h-[calc(100%-8px)] !rounded-md transition-[left,width]',
          },
        }">
          <Tab value="current">{{ t('scan.tabCurrent') }}</Tab>
          <Tab value="tocheck">{{ t('scan.tabToCheck', { scanned: toCheckRemaining, total: toCheckTotal }) }}</Tab>
        </TabList>
        <TabPanels>
          <TabPanel value="current">
            <div class="table-wrap-fill">
              <DataTable :value="currentRows" striped-rows row-hover scrollable scroll-height="flex">
                <Column field="sticker" :header="t('scan.sticker')">
                  <template #body="{ data }">
                    <span :class="statusClass(data.status)">{{ data.sticker }}</span>
                  </template>
                </Column>
                <Column field="qty" :header="t('scan.qty')">
                  <template #body="{ data }">
                    <span :class="statusClass(data.status)">{{ data.qty }}</span>
                  </template>
                </Column>
                <Column field="name" :header="t('scan.name')">
                  <template #body="{ data }">
                    <span :class="statusClass(data.status)">{{ data.name }}</span>
                  </template>
                </Column>
                <Column field="originalWposition" :header="t('scan.originalWposition')">
                  <template #body="{ data }">
                    <span :class="statusClass(data.status)">{{ data.originalWposition }}</span>
                  </template>
                </Column>
              </DataTable>
            </div>
          </TabPanel>
          <TabPanel value="tocheck">
            <div class="table-wrap-fill">
              <DataTable :value="toCheckItems" :loading="loadingAssets" striped-rows row-hover scrollable
                scroll-height="flex">
                <Column field="sticker" :header="t('scan.sticker')">
                  <template #body="{ data }">
                    <span :class="statusClass(data.status)">{{ data.sticker }}</span>
                  </template>
                </Column>
                <Column field="qty" :header="t('scan.qty')">
                  <template #body="{ data }">
                    <span :class="statusClass(data.status)">{{ data.qty }}</span>
                  </template>
                </Column>
                <Column field="name" :header="t('scan.name')">
                  <template #body="{ data }">
                    <span :class="statusClass(data.status)">{{ data.name }}</span>
                  </template>
                </Column>
              </DataTable>
            </div>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>

    <Button class="w-full" :label="t('scan.checkQR')" icon="pi pi-qrcode" size="large" :loading="checking"
      :disabled="checking || !canScan" @click="checkQR" />

    <Dialog v-model:visible="resultOpen" modal dismissable-mask :header="resultTitle"
      :class="['scan-result-dialog', `scan-result-${resultStatus}`]" :style="{ width: 'min(400px, 96vw)' }">
      <div v-if="resultSticker" class="scan-result-row">
        <p class="scan-result-label">{{ t('scan.sticker') }}</p>
        <p :class="['scan-result-value', resultValueClass]">{{ resultSticker }}</p>
      </div>
      <div v-if="resultName" class="scan-result-row">
        <p class="scan-result-label">{{ t('scan.name') }}</p>
        <p :class="['scan-result-value', resultValueClass]">{{ resultName }}</p>
      </div>
      <div class="scan-result-row">
        <p class="scan-result-label">{{ t('scan.qty') }}</p>
        <div v-if="resultStatus === 'duplicate'" class="scan-result-qty">
          <InputNumber input-id="result-qty" v-model="resultCount" :use-grouping="false" :min="1"
            :max-fraction-digits="0" />
          <span :class="resultValueClass">/{{ resultExpect }}</span>
        </div>
        <p v-else :class="['scan-result-value', resultValueClass]">{{ resultCount }}/{{ resultExpect }}</p>
      </div>
      <div class="mt-4 flex justify-end">
        <Button v-if="resultStatus === 'duplicate'" :label="t('common.save')" @click="saveDuplicateQty" />
        <Button v-else :label="t('common.ok')" @click="resultOpen = false" />
      </div>
    </Dialog>
  </div>
</template>
