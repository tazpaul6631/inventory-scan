<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Dialog from '@/components/ui/AppDialog.vue'
import Button from '@/components/ui/AppButton.vue'
import Tag from '@/components/ui/AppTag.vue'
import { queryUserGetOne } from '@/services/api/user'
import { readApiFailure } from '@/services/api/error'
import type { ViewUser } from '@/types/api'

const props = defineProps<{
  userId?: string
}>()

const visible = defineModel<boolean>('visible', { default: false })
const { t } = useI18n()
const toast = useToast()
const loading = ref(false)
const user = ref<ViewUser | null>(null)

function close() {
  visible.value = false
}

function flagTag(value?: boolean) {
  return value ? t('common.yes') : t('common.no')
}

async function loadUser(id: string) {
  loading.value = true
  user.value = null
  try {
    const res = await queryUserGetOne(id)
    if (!res.data || res.success === false) {
      toast.add({
        severity: 'warn',
        summary: res.message || t('user.notFound'),
        life: 2500,
        closable: false,
      })
      close()
      return
    }
    user.value = res.data
  } catch (err) {
    toast.add({
      severity: 'warn',
      summary: readApiFailure(err) || t('user.loadError'),
      life: 2500,
      closable: false,
    })
    close()
  } finally {
    loading.value = false
  }
}

watch(visible, async (open) => {
  if (!open) {
    user.value = null
    return
  }
  if (!props.userId) {
    toast.add({
      severity: 'warn',
      summary: t('user.notFound'),
      life: 2500,
      closable: false,
    })
    close()
    return
  }
  await loadUser(props.userId)
})
</script>

<template>
  <Dialog v-model:visible="visible" dismissable-mask :header="t('user.viewTitle')"
    :style="{ width: 'min(420px, 96vw)' }">
    <div v-if="loading" class="flex justify-center py-6">
      <i class="pi pi-spinner pi-spin text-xl" />
    </div>
    <div v-else-if="user" class="grid gap-3">
      <div>
        <p class="m-0 text-sm text-muted">{{ t('user.code') }}</p>
        <p class="m-0 font-semibold text-ink">{{ user.code || '—' }}</p>
      </div>
      <div>
        <p class="m-0 text-sm text-muted">{{ t('user.name') }}</p>
        <p class="m-0 font-semibold text-ink">{{ user.name || '—' }}</p>
      </div>
      <div class="flex items-center justify-between gap-3">
        <p class="m-0 text-sm text-muted">{{ t('user.allowWeb') }}</p>
        <Tag :value="flagTag(user.allowWeb)" :severity="user.allowWeb ? 'success' : 'secondary'" />
      </div>
      <div class="flex items-center justify-between gap-3">
        <p class="m-0 text-sm text-muted">{{ t('user.active') }}</p>
        <Tag :value="flagTag(user.isActive)" :severity="user.isActive ? 'success' : 'secondary'" />
      </div>
    </div>
    <div class="mt-4 flex justify-end">
      <Button :label="t('common.ok')" size="large" :disabled="loading" @click="close" />
    </div>
  </Dialog>
</template>
