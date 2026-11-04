<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import DataTable from 'primevue/datatable'
import Button from 'primevue/button'
import Column from 'primevue/column'
import { queryWarehouseResult } from '@/services/api/category'
import { readApiFailure } from '@/services/api/error'
import type { ViewWarehouse } from '@/types/api'

const { t } = useI18n()
const toast = useToast()
const loading = ref(false)
const rows = ref<ViewWarehouse[]>([])
const total = ref(0)
const page = ref(0)
const pageSize = ref(20)

async function load() {
  loading.value = true
  try {
    const res = await queryWarehouseResult({
      page: page.value + 1,
      pageSize: pageSize.value,
    })
    rows.value = res.data?.items ?? []
    total.value = res.data?.totalCount ?? rows.value.length
    if (res.success === false) {
      toast.add({
        severity: 'warn',
        summary: res.message || t('warehouse.loadError'),
        life: 2500,
        closable: false,
      })
    }
  } catch (err) {
    rows.value = []
    total.value = 0
    toast.add({
      severity: 'warn',
      summary: readApiFailure(err) || t('warehouse.loadError'),
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
  <div class="warehouses-page page-fill gap-3 overflow-hidden pt-2" :style="{ paddingBottom: 'var(--safe-bottom)' }">
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <Button icon="pi pi-sync" :label="t('warehouse.sync')" />
    </div>
    <div class="page-fill-panel table-wrap-fill rounded-2xl border border-line bg-white p-2 shadow-panel">
      <DataTable :value="rows" :loading="loading" striped-rows row-hover lazy paginator scrollable scroll-height="flex"
        :rows="pageSize" :total-records="total" :first="page * pageSize" data-key="id" @page="onPage">
        <template #empty>
          <div class="table-empty flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-muted">
            <i class="pi pi-inbox text-[1.75rem]" />
            <p class="m-0 font-semibold text-ink">{{ t('warehouse.emptyTitle') }}</p>
            <p class="m-0">{{ t('warehouse.emptyHint') }}</p>
          </div>
        </template>
        <Column field="sno" :header="t('warehouse.sno')" />
        <Column field="factoryId" :header="t('warehouse.factoryId')" />
        <Column field="name" :header="t('warehouse.name')" />
        <Column field="remark" :header="t('warehouse.remark')" />
      </DataTable>
    </div>
  </div>
</template>
