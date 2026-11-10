<script setup lang="ts">
import { computed, onActivated, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Button from '@/components/ui/AppButton.vue'
import Tag from '@/components/ui/AppTag.vue'
import Dialog from '@/components/ui/AppDialog.vue'
import InputText from '@/components/ui/AppInputText.vue'
import Select from '@/components/ui/AppSelect.vue'
import FloatLabel from '@/components/ui/AppFloatLabel.vue'
import { countScans, deleteAllScanLogs, deleteScanLog, listScanLogs } from '@/services/repositories/scans'
import { exportCsv, exportXlsx } from '@/services/export'
import dayjs from 'dayjs'
import { formatDateTime } from '@/utils/format'
import type { ScanDirection, ScanLog } from '@/types'

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const logs = ref<ScanLog[]>([])
const dbTotal = ref(0)
const filterCode = ref('')
const filterType = ref<'all' | ScanDirection>('all')
const page = ref(0)
const pageSize = 12
const exporting = ref(false)
const usbGuideOpen = ref(false)

const typeOptions = computed(() => [
  { label: t('scan.filterTypeAll'), value: 'all' as const },
  { label: t('scan.directionIn'), value: 'in' as const },
  { label: t('scan.directionOut'), value: 'out' as const },
])

const exportColumns = computed(() => [
  { key: 'index', header: '#', width: 8 },
  { key: 'barcode', header: 'Barcode', width: 28 },
  { key: 'type', header: 'Type', width: 12 },
  {
    key: 'datenow',
    header: 'DateNow',
    width: 22,
    numFmt: 'dd/mm/yyyy hh:mm:ss',
  },
])

function directionLabel(direction: ScanLog['direction']) {
  return direction === 'out' ? t('scan.directionOut') : t('scan.directionIn')
}

const filteredLogs = computed(() => {
  const code = filterCode.value.trim().toLowerCase()
  const type = filterType.value
  // logs from SQLite are newest-first; reverse so list shows #1 → n (oldest → newest)
  return logs.value
    .filter((row) => {
      if (code && !row.value.toLowerCase().includes(code)) return false
      if (type !== 'all' && row.direction !== type) return false
      return true
    })
    .slice()
    .reverse()
})

const hasFilter = computed(() => Boolean(filterCode.value.trim() || filterType.value !== 'all'))
const total = computed(() => filteredLogs.value.length)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const pageRows = computed(() => {
  const start = page.value * pageSize
  return filteredLogs.value.slice(start, start + pageSize)
})
const rangeLabel = computed(() => {
  if (!total.value) return `0-0 / 0`
  const low = page.value * pageSize + 1
  const high = Math.min(total.value, low + pageRows.value.length - 1)
  return `${low}->${high} / ${total.value}`
})

const countLabel = computed(() => {
  if (hasFilter.value && total.value !== dbTotal.value) {
    return t('scan.filteredOfTotal', { filtered: total.value, total: dbTotal.value })
  }
  return t('scan.totalCount', { n: dbTotal.value })
})

function rowIndex(index: number) {
  return page.value * pageSize + index + 1
}

watch([filterCode, filterType], () => {
  page.value = 0
})

watch(filteredLogs, () => {
  if (page.value > pageCount.value - 1) page.value = Math.max(0, pageCount.value - 1)
})

async function reload() {
  const [rows, count] = await Promise.all([listScanLogs(), countScans()])
  logs.value = rows
  dbTotal.value = count
  page.value = 0
}

onMounted(() => {
  void reload()
})

onActivated(() => {
  void reload()
})

function clearFilter() {
  filterCode.value = ''
  filterType.value = 'all'
  page.value = 0
}

function prevPage() {
  if (page.value > 0) page.value -= 1
}

function nextPage() {
  if (page.value < pageCount.value - 1) page.value += 1
}

function buildExportRows(source: ScanLog[], asExcelDate: boolean) {
  return source.map((row, index) => ({
    index: index + 1,
    barcode: row.value,
    type: directionLabel(row.direction),
    datenow: asExcelDate ? new Date(row.createdAt) : formatDateTime(row.createdAt),
  }))
}

async function loadAllForExport(): Promise<ScanLog[]> {
  const rows = await listScanLogs()
  logs.value = rows
  dbTotal.value = rows.length
  return rows
}

async function doExport(kind: 'csv' | 'xlsx') {
  exporting.value = true
  try {
    const all = await loadAllForExport()
    if (!all.length) {
      toast.add({ severity: 'warn', summary: t('scan.emptyTitle'), life: 2500, closable: false })
      return
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = kind === 'csv' ? `scan-logs-${stamp}.csv` : `scan-logs-${stamp}.xlsx`
    // Export full DB (oldest → newest), ignore UI filter so nothing is dropped.
    const rows = buildExportRows([...all].reverse(), kind === 'xlsx')
    if (kind === 'csv') await exportCsv(filename, exportColumns.value, rows)
    else await exportXlsx(filename, exportColumns.value, rows)
    toast.add({
      severity: 'success',
      summary: t('sync.exported', { file: filename }),
      detail: t('scan.totalCount', { n: all.length }),
      life: 5000,
      closable: false,
    })
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: err instanceof Error ? err.message : String(err),
      life: 4000,
      closable: false,
    })
  } finally {
    exporting.value = false
  }
}

function remove(row: ScanLog) {
  confirm.require({
    header: t('scan.deleteTitle'),
    message: t('scan.deleteMessage', { value: row.value }),
    acceptLabel: t('common.delete'),
    rejectLabel: t('common.cancel'),
    acceptIcon: 'pi pi-trash',
    acceptClass: 'p-button-danger',
    rejectClass: 'p-button-secondary',
    acceptProps: {
      raised: true,
      ripple: false,
      icon: 'pi pi-trash',
    },
    rejectProps: {
      text: true,
      raised: false,
      ripple: false,
    },
    accept: async () => {
      try {
        await deleteScanLog(row.id)
        toast.add({ severity: 'success', summary: t('scan.deleted'), life: 2000, closable: false })
        await reload()
      } catch (err) {
        toast.add({
          severity: 'error',
          summary: err instanceof Error ? err.message : t('scan.deleteError'),
          life: 3500,
          closable: false,
        })
      }
    },
  })
}

function deleteAll() {
  if (!logs.value.length) {
    toast.add({ severity: 'warn', summary: t('scan.emptyTitle'), life: 2500, closable: false })
    return
  }
  confirm.require({
    header: t('scan.deleteAllTitle'),
    message: t('scan.deleteAllMessage'),
    acceptLabel: t('common.deleteAll'),
    rejectLabel: t('common.cancel'),
    acceptIcon: 'pi pi-trash',
    acceptClass: 'p-button-danger',
    rejectClass: 'p-button-secondary',
    acceptProps: {
      raised: true,
      ripple: false,
      icon: 'pi pi-trash',
    },
    rejectProps: {
      text: true,
      raised: false,
      ripple: false,
    },
    accept: async () => {
      exporting.value = true
      try {
        const all = await loadAllForExport()
        if (!all.length) {
          toast.add({ severity: 'warn', summary: t('scan.emptyTitle'), life: 2500, closable: false })
          return
        }
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const filename = `scan-logs-backup-${stamp}.xlsx`
        await exportXlsx(
          filename,
          exportColumns.value,
          buildExportRows([...all].reverse(), true),
        )
        await deleteAllScanLogs()
        toast.add({
          severity: 'success',
          summary: t('scan.deleteAllDone'),
          detail: `${t('sync.exported', { file: filename })} · ${t('scan.totalCount', { n: all.length })}`,
          life: 5000,
          closable: false,
        })
        await reload()
      } catch (err) {
        toast.add({
          severity: 'error',
          summary: err instanceof Error ? err.message : t('scan.deleteError'),
          life: 4000,
          closable: false,
        })
      } finally {
        exporting.value = false
      }
    },
  })
}
</script>

<template>
  <div class="page-fill gap-3 overflow-hidden">
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap gap-2">
        <!-- <Button icon="pi pi-refresh" :aria-label="t('common.search')" :disabled="exporting" @click="reload" /> -->
        <Button icon="pi pi-file-export" :loading="exporting" @click="doExport('csv')" />
        <Button icon="pi pi-file-excel" :loading="exporting" @click="doExport('xlsx')" />
        <Button icon="pi pi-info-circle" severity="help" outlined @click="usbGuideOpen = true" />
      </div>
      <div class="flex flex-wrap gap-2 justify-end">
        <Button icon="pi pi-trash" severity="danger" outlined :loading="exporting" :aria-label="t('common.deleteAll')"
          :disabled="!logs.length || exporting" @click="deleteAll" />
        <Button icon="pi pi-filter-slash" outlined :disabled="!hasFilter" :aria-label="t('common.clearFilter')"
          @click="clearFilter" />
      </div>
    </div>

    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <FloatLabel class="min-w-28 flex-1">
        <InputText id="history-filter-code" name="history-filter-code" v-model="filterCode" class="w-full" />
        <label for="history-filter-code">{{ t('scan.filterCode') }}</label>
      </FloatLabel>
      <FloatLabel class="min-w-28 w-36">
        <Select input-id="history-filter-type" name="history-filter-type" v-model="filterType" :options="typeOptions"
          option-label="label" option-value="value" class="w-full" />
        <label for="history-filter-type">{{ t('scan.filterType') }}</label>
      </FloatLabel>
      <span class="shrink-0 text-sm font-semibold text-ink">{{ countLabel }}</span>
    </div>

    <div class="page-fill-panel rounded-2xl border border-line bg-white p-2 shadow-panel">
      <div class="min-h-0 flex-1 overflow-auto">
        <div v-if="!pageRows.length"
          class="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-muted">
          <i class="pi pi-inbox text-[1.75rem]" />
          <p class="m-0 font-semibold text-ink">{{ t('scan.emptyTitle') }}</p>
          <p class="m-0">{{ t('scan.emptyHint') }}</p>
        </div>

        <table v-else class="w-full border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-line text-muted">
              <th class="px-1.5 py-2 font-semibold">#</th>
              <th class="px-1.5 py-2 font-semibold">{{ t('scan.code') }}</th>
              <th class="px-1.5 py-2 font-semibold">{{ t('scan.type') }}</th>
              <th class="px-1.5 py-2 font-semibold">{{ t('scan.dateNow') }}</th>
              <th class="px-1.5 py-2 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in pageRows" :key="row.id" class="border-b border-line last:border-b-0">
              <td class="px-1.5 py-2 align-middle">{{ rowIndex(index) }}</td>
              <td class="px-1.5 py-2 align-middle break-all font-medium text-ink">{{ row.value }}</td>
              <td class="px-1.5 py-2 align-middle">
                <Tag :value="directionLabel(row.direction)" :severity="row.direction === 'out' ? 'warn' : 'success'" />
              </td>
              <td class="px-1.5 py-2 align-middle whitespace-nowrap text-muted">
                <div class="flex flex-col leading-tight">
                  <span>{{ dayjs(row.createdAt).format('DD/MM/YYYY') }}</span>
                  <span>{{ dayjs(row.createdAt).format('HH:mm:ss') }}</span>
                </div>
              </td>
              <td class="px-1.5 py-2 align-middle">
                <Button icon="pi pi-trash" severity="danger" text rounded :aria-label="t('common.delete')"
                  @click="remove(row)" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="total" class="mt-2 mb-2 flex shrink-0 items-center justify-center gap-3 text-sm text-muted">
        <Button icon="pi pi-chevron-left" text rounded :disabled="page <= 0" :aria-label="t('common.back')"
          @click="prevPage" />
        <span>{{ rangeLabel }}</span>
        <Button icon="pi pi-chevron-right" text rounded :disabled="page >= pageCount - 1" aria-label="Next"
          @click="nextPage" />
      </div>
    </div>

    <Dialog v-model:visible="usbGuideOpen" modal dismissable-mask :header="t('mobile.usbGuideTitle')"
      :style="{ width: 'min(420px, 96vw)' }">
      <p class="m-0 whitespace-pre-line text-sm leading-relaxed text-ink">{{ t('mobile.usbGuideSteps') }}</p>
      <div class="mt-4 flex justify-end">
        <Button :label="t('common.cancel')" @click="usbGuideOpen = false" />
      </div>
    </Dialog>
  </div>
</template>
