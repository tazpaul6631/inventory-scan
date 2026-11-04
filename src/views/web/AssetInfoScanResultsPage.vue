<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import DataTable from 'primevue/datatable'
import Button from 'primevue/button'
import Column from 'primevue/column'
import { queryAssetInfoScanResult } from '@/services/api/asset'
import { readApiFailure } from '@/services/api/error'
import type { ViewAssetInfoScanResult } from '@/types/api'

const { t } = useI18n()
const toast = useToast()
const loading = ref(false)
const rows = ref<ViewAssetInfoScanResult[]>([])
const total = ref(0)
const page = ref(0)
const pageSize = ref(20)

async function load() {
  loading.value = true
  try {
    const res = await queryAssetInfoScanResult({
      page: page.value + 1,
      pageSize: pageSize.value,
    })
    rows.value = res.data?.items ?? []
    total.value = res.data?.totalCount ?? rows.value.length
    if (res.success === false) {
      toast.add({
        severity: 'warn',
        summary: res.message || t('assetScanResult.loadError'),
        life: 2500,
        closable: false,
      })
    }
  } catch (err) {
    rows.value = []
    total.value = 0
    toast.add({
      severity: 'warn',
      summary: readApiFailure(err) || t('assetScanResult.loadError'),
      life: 2500,
      closable: false,
    })
  } finally {
    loading.value = false
  }
}

function onPage(event: { page: number; rows: number }) {
  page.value = event.page
  pageSize.value = event.rows
  void load()
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="asset-scan-results-page page-fill gap-3 overflow-hidden pt-2"
    :style="{ paddingBottom: 'var(--safe-bottom)' }">
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <Button icon="pi pi-sync" :label="t('assetScanResult.sync')" />
    </div>
    <div class="page-fill-panel table-wrap-fill rounded-2xl border border-line bg-white p-2 shadow-panel">
      <DataTable :value="rows" :loading="loading" striped-rows row-hover lazy paginator scrollable scroll-height="flex"
        :rows="pageSize" :total-records="total" :first="page * pageSize" @page="onPage">
        <template #empty>
          <div class="table-empty flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-muted">
            <i class="pi pi-inbox text-[1.75rem]" />
            <p class="m-0 font-semibold text-ink">{{ t('assetScanResult.emptyTitle') }}</p>
            <p class="m-0">{{ t('assetScanResult.emptyHint') }}</p>
          </div>
        </template>
        <Column field="factoryName" :header="t('assetScanResult.factoryName')" />
        <Column field="warehouseName" :header="t('assetScanResult.warehouseName')" />
        <Column field="wPosition" :header="t('assetScanResult.wPosition')" />
        <Column field="vatNo" :header="t('assetScanResult.vatNo')" />
        <Column field="orderCode" :header="t('assetScanResult.orderCode')" />
        <Column field="styleCode" :header="t('assetScanResult.styleCode')" />
        <Column field="materialCode" :header="t('assetScanResult.materialCode')" />
        <Column field="materialName" :header="t('assetScanResult.materialName')" />
        <Column field="materialClass" :header="t('assetScanResult.materialClass')" />
        <Column field="materialSubClass" :header="t('assetScanResult.materialSubClass')" />
        <Column field="assetState" :header="t('assetScanResult.assetState')" />
        <Column field="quality" :header="t('assetScanResult.quality')" />
        <Column field="rollNo" :header="t('assetScanResult.rollNo')" />
        <Column field="batchNo" :header="t('assetScanResult.batchNo')" />
        <Column field="count" :header="t('assetScanResult.count')" />
        <Column field="cycleId" :header="t('assetScanResult.cycleId')" />
        <Column field="scanResult" :header="t('assetScanResult.scanResult')" />
      </DataTable>
    </div>
  </div>
</template>
