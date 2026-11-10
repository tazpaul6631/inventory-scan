<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import { queryAssetInfoResult } from '@/services/api/asset'
import { readApiFailure } from '@/services/api/error'
import type { ViewAssetInfo } from '@/types/api'

const { t } = useI18n()
const toast = useToast()
const loading = ref(false)
const rows = ref<ViewAssetInfo[]>([])
const total = ref(0)
const page = ref(0)
const pageSize = ref(50)

async function load() {
  loading.value = true
  try {
    const res = await queryAssetInfoResult({
      page: page.value + 1,
      pageSize: pageSize.value,
    })
    rows.value = res.data?.items ?? []
    total.value = res.data?.totalCount ?? rows.value.length
    if (res.success === false) {
      toast.add({
        severity: 'warn',
        summary: res.message || t('assetInfo.loadError'),
        life: 2500,
        closable: false,
      })
    }
  } catch (err) {
    rows.value = []
    total.value = 0
    toast.add({
      severity: 'warn',
      summary: readApiFailure(err) || t('assetInfo.loadError'),
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
  <div class="asset-info-page page-fill gap-3 overflow-hidden pt-2" :style="{ paddingBottom: 'var(--safe-bottom)' }">
    <div class="page-fill-panel table-wrap-fill rounded-2xl border border-line bg-white p-2 shadow-panel">
      <DataTable :value="rows" :loading="loading" striped-rows row-hover lazy paginator scrollable scroll-height="flex"
        :rows="pageSize" :total-records="total" :first="page * pageSize"
        paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown CurrentPageReport"
        currentPageReportTemplate="Showing {first} to {last} of {totalRecords} entries"
        :rowsPerPageOptions="[50, 100, 200]" @page="onPage">
        <template #empty>
          <div class="table-empty flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-muted">
            <i class="pi pi-inbox text-[1.75rem]" />
            <p class="m-0 font-semibold text-ink">{{ t('assetInfo.emptyTitle') }}</p>
            <p class="m-0">{{ t('assetInfo.emptyHint') }}</p>
          </div>
        </template>
        <Column field="vatNo" :header="t('assetInfo.vatNo')" />
        <Column field="materialCode" :header="t('assetInfo.materialCode')" />
        <Column field="materialName" :header="t('assetInfo.materialName')" />
        <Column field="count" :header="t('assetInfo.count')" class="w-12" />
        <Column field="wPosition" :header="t('assetInfo.wPosition')" />
        <Column field="warehouseName" :header="t('assetInfo.warehouseName')" />
        <Column field="materialUnitNo" :header="t('assetInfo.materialUnitNo')" />
        <Column field="orderCode" :header="t('assetInfo.orderCode')" />
        <Column field="rollNo" :header="t('assetInfo.rollNo')" class="w-auto" />
      </DataTable>
    </div>
  </div>
</template>
