<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from '@/components/ui/AppButton.vue'
import InputText from '@/components/ui/AppInputText.vue'
import FloatLabel from '@/components/ui/AppFloatLabel.vue'
import Tag from '@/components/ui/AppTag.vue'
import UserFormDialog from '@/components/user/UserFormDialog.vue'
import UserViewDialog from '@/components/user/UserViewDialog.vue'
import UserDeleteDialog from '@/components/user/UserDeleteDialog.vue'
import { queryUserResult } from '@/services/api/user'
import { readApiFailure } from '@/services/api/error'
import { useAuthStore } from '@/stores/auth'
import type { UserFormMode } from '@/schemas/user'
import type { ViewUser } from '@/types/api'

const { t } = useI18n()
const toast = useToast()
const auth = useAuthStore()
const loading = ref(false)
const keyword = ref('')
const rows = ref<ViewUser[]>([])
const total = ref(0)
const page = ref(0)
const pageSize = ref(20)

const formOpen = ref(false)
const formMode = ref<UserFormMode>('create')
const formUserId = ref<string>()
const viewOpen = ref(false)
const viewUserId = ref<string>()
const deleteOpen = ref(false)
const deleteUserRow = ref<ViewUser | null>(null)

async function load() {
  loading.value = true
  try {
    const res = await queryUserResult({
      page: page.value + 1,
      pageSize: pageSize.value,
      keyword: keyword.value.trim() || null,
    })
    rows.value = res.data?.items ?? []
    total.value = res.data?.totalCount ?? rows.value.length
    if (res.success === false) {
      toast.add({
        severity: 'warn',
        summary: res.message || t('user.loadError'),
        life: 2500,
        closable: false,
      })
    }
  } catch (err) {
    rows.value = []
    total.value = 0
    toast.add({
      severity: 'warn',
      summary: readApiFailure(err) || t('user.loadError'),
      life: 2500,
      closable: false,
    })
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 0
  void load()
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
  formUserId.value = undefined
  formOpen.value = true
}

function openView(row: ViewUser) {
  viewUserId.value = row.id
  viewOpen.value = true
}

function openEdit(row: ViewUser) {
  if (!requireSession()) return
  formMode.value = 'edit'
  formUserId.value = row.id
  formOpen.value = true
}

function openDelete(row: ViewUser) {
  if (!requireSession()) return
  deleteUserRow.value = row
  deleteOpen.value = true
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="users-page page-fill gap-3 overflow-hidden pt-2" :style="{ paddingBottom: 'var(--safe-bottom)' }">
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <FloatLabel class="min-w-48 flex-1">
        <InputText id="user-search" v-model="keyword" class="w-full" @keydown.enter="search" />
        <label for="user-search">{{ t('user.searchPlaceholder') }}</label>
      </FloatLabel>
      <Button icon="pi pi-search" :label="t('common.search')" :loading="loading" @click="search" />
      <Button icon="pi pi-plus" :label="t('user.add')" @click="openCreate" />
    </div>

    <div class="page-fill-panel table-wrap-fill rounded-2xl border border-line bg-white p-2 shadow-panel">
      <DataTable :value="rows" :loading="loading" striped-rows row-hover lazy paginator scrollable scroll-height="flex"
        :rows="pageSize" :total-records="total" :first="page * pageSize" data-key="id" @page="onPage">
        <template #empty>
          <div class="table-empty flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-muted">
            <i class="pi pi-inbox text-[1.75rem]" />
            <p class="m-0 font-semibold text-ink">{{ t('user.emptyTitle') }}</p>
            <p class="m-0">{{ t('user.emptyHint') }}</p>
          </div>
        </template>
        <Column field="code" :header="t('user.code')" />
        <Column field="name" :header="t('user.name')" />
        <Column :header="t('user.allowWeb')">
          <template #body="{ data }">
            <Tag :value="data.allowWeb ? t('common.yes') : t('common.no')"
              :severity="data.allowWeb ? 'success' : 'secondary'" />
          </template>
        </Column>
        <Column :header="t('user.active')">
          <template #body="{ data }">
            <Tag :value="data.isActive ? t('common.yes') : t('common.no')"
              :severity="data.isActive ? 'success' : 'secondary'" />
          </template>
        </Column>
        <Column :header="t('common.actions')">
          <template #body="{ data }">
            <div class="flex flex-nowrap items-center gap-1">
              <Button icon="pi pi-eye" size="small" :raised="false" text rounded severity="secondary"
                :aria-label="t('user.viewTitle')" @click="openView(data)" />
              <Button icon="pi pi-pencil" size="small" :raised="false" text rounded severity="secondary"
                :aria-label="t('user.editTitle')" @click="openEdit(data)" />
              <Button icon="pi pi-trash" size="small" :raised="false" text rounded severity="danger"
                :aria-label="t('user.deleteTitle')" @click="openDelete(data)" />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <UserFormDialog v-model:visible="formOpen" :mode="formMode" :user-id="formUserId" @saved="load" />
    <UserViewDialog v-model:visible="viewOpen" :user-id="viewUserId" />
    <UserDeleteDialog v-model:visible="deleteOpen" :user="deleteUserRow" @saved="load" />
  </div>
</template>
