<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import dayjs from 'dayjs'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from '@/components/ui/AppButton.vue'
import CycleFormDialog from '@/components/cycle/CycleFormDialog.vue'
import CycleViewDialog from '@/components/cycle/CycleViewDialog.vue'
import CycleDeleteDialog from '@/components/cycle/CycleDeleteDialog.vue'
import SyncProgressDialog from '@/components/sync/SyncProgressDialog.vue'
import { useWebCategorySync } from '@/composables/useWebCategorySync'
import { queryCyclesResult } from '@/services/api/category'
import { readApiFailure } from '@/services/api/error'
import { useAuthStore } from '@/stores/auth'
import type { CycleFormMode } from '@/schemas/cycle'
import type { ViewCycle } from '@/types/api'

const { t } = useI18n()
const toast = useToast()
const auth = useAuthStore()
const { runPipeline } = useWebCategorySync()
const loading = ref(false)
const rows = ref<ViewCycle[]>([])
const total = ref(0)
const page = ref(0)
const pageSize = ref(50)

const formOpen = ref(false)
const formMode = ref<CycleFormMode>('create')
const formCycleId = ref<number>()
const viewOpen = ref(false)
const viewCycleId = ref<number>()
const deleteOpen = ref(false)
const deleteCycleRow = ref<ViewCycle | null>(null)

function formatDate(value?: string | null) {
  if (!value) return ''
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('DD/MM/YYYY HH:mm:ss') : value
}

async function load() {
  loading.value = true
  try {
    const res = await queryCyclesResult({
      page: page.value + 1,
      pageSize: pageSize.value,
    })
    rows.value = res.data?.items ?? []
    total.value = res.data?.totalCount ?? rows.value.length
    if (res.success === false) {
      toast.add({
        severity: 'warn',
        summary: res.message || t('cycle.loadError'),
        life: 2500,
        closable: false,
      })
    }
  } catch (err) {
    rows.value = []
    total.value = 0
    toast.add({
      severity: 'warn',
      summary: readApiFailure(err) || t('cycle.loadError'),
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

function requireSession() {
  if (auth.session?.userId?.trim()) return true
  toast.add({
    severity: 'warn',
    summary: t('user.needSession'),
    life: 2500,
    closable: false,
  })
  return false
}

function openCreate() {
  if (!requireSession()) return
  formMode.value = 'create'
  formCycleId.value = undefined
  formOpen.value = true
}

function openView(row: ViewCycle) {
  viewCycleId.value = row.id
  viewOpen.value = true
}

function openEdit(row: ViewCycle) {
  if (!requireSession()) return
  formMode.value = 'edit'
  formCycleId.value = row.id
  formOpen.value = true
}

function openDelete(row: ViewCycle) {
  if (!requireSession()) return
  deleteCycleRow.value = row
  deleteOpen.value = true
}

function syncAllInCycles() {
  if (!requireSession()) return
  void runPipeline()
}

function onFormSaved() {
  if (formMode.value === 'create') page.value = 0
  void load()
}

function onDeleteSaved() {
  if (rows.value.length <= 1 && page.value > 0) page.value -= 1
  void load()
}

function onCycleCreated() {
  void runPipeline()
}

function onSyncFinished() {
  void load()
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="cycles-page page-fill gap-3 overflow-hidden pt-2" :style="{ paddingBottom: 'var(--safe-bottom)' }">
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <Button icon="pi pi-sync" :label="t('cycle.sync')" size="large" :disabled="rows.length === 0"
        @click="syncAllInCycles" />
      <Button icon="pi pi-plus" :label="t('cycle.create')" size="large" @click="openCreate" />
    </div>
    <div class="page-fill-panel table-wrap-fill rounded-2xl border border-line bg-white p-2 shadow-panel">
      <DataTable :value="rows" :loading="loading" striped-rows row-hover lazy paginator scrollable scroll-height="flex"
        :rows="pageSize" :total-records="total" :first="page * pageSize" data-key="id"
        paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown CurrentPageReport"
        currentPageReportTemplate="Showing {first} to {last} of {totalRecords} entries"
        :rowsPerPageOptions="[50, 100, 200]" @page="onPage">
        <template #empty>
          <div class="table-empty flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-muted">
            <i class="pi pi-inbox text-[1.75rem]" />
            <p class="m-0 font-semibold text-ink">{{ t('cycle.emptyTitle') }}</p>
            <p class="m-0">{{ t('cycle.emptyHint') }}</p>
          </div>
        </template>
        <Column field="code" :header="t('cycle.code')" />
        <Column :header="t('cycle.scanDate')">
          <template #body="{ data }">
            {{ formatDate(data.scanDate) }}
          </template>
        </Column>
        <Column field="description" :header="t('cycle.description')" />
        <Column :header="t('cycle.createdAt')">
          <template #body="{ data }">
            {{ formatDate(data.createdAt) }}
          </template>
        </Column>
        <Column :header="t('cycle.updatedAt')">
          <template #body="{ data }">
            {{ formatDate(data.updatedAt) }}
          </template>
        </Column>
        <Column :header="t('common.actions')">
          <template #body="{ data }">
            <div class="flex flex-nowrap items-center gap-1">
              <Button icon="pi pi-eye" size="large" :raised="false" text rounded severity="secondary"
                :aria-label="t('cycle.viewTitle')" @click="openView(data)" />
              <Button icon="pi pi-pencil" size="large" :raised="false" text rounded severity="secondary"
                :aria-label="t('cycle.editTitle')" @click="openEdit(data)" />
              <Button icon="pi pi-trash" size="large" :raised="false" text rounded severity="danger"
                :aria-label="t('cycle.deleteTitle')" @click="openDelete(data)" />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <CycleFormDialog v-model:visible="formOpen" :mode="formMode" :cycle-id="formCycleId" @saved="onFormSaved"
      @created="onCycleCreated" />
    <CycleViewDialog v-model:visible="viewOpen" :cycle-id="viewCycleId" />
    <CycleDeleteDialog v-model:visible="deleteOpen" :cycle="deleteCycleRow" @saved="onDeleteSaved" />
    <SyncProgressDialog @finished="onSyncFinished" />
  </div>
</template>
