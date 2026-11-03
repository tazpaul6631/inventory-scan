<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Dialog from '@/components/ui/AppDialog.vue'
import Button from '@/components/ui/AppButton.vue'
import Message from '@/components/ui/AppMessage.vue'
import { deleteUser } from '@/services/api/user'
import { readApiFailure } from '@/services/api/error'
import { useAuthStore } from '@/stores/auth'
import type { ViewUser } from '@/types/api'

const props = defineProps<{
  user?: ViewUser | null
}>()

const visible = defineModel<boolean>('visible', { default: false })
const emit = defineEmits<{
  saved: []
}>()

const { t } = useI18n()
const toast = useToast()
const auth = useAuthStore()
const deleting = ref(false)
const formError = ref('')

const displayName = computed(() => props.user?.name?.trim() || props.user?.code?.trim() || '—')

function close() {
  formError.value = ''
  visible.value = false
}

async function confirmDelete() {
  const id = props.user?.id
  const updatedBy = auth.session?.userId?.trim() ?? ''
  if (!id) {
    formError.value = t('user.notFound')
    return
  }
  if (!updatedBy) {
    formError.value = t('user.needSession')
    return
  }
  deleting.value = true
  formError.value = ''
  try {
    const res = await deleteUser(id, { updatedBy })
    if (res.success === false) {
      formError.value = res.message || t('user.deleteError')
      return
    }
    toast.add({
      severity: 'success',
      summary: t('user.deleted'),
      life: 2500,
      closable: false,
    })
    emit('saved')
    close()
  } catch (err) {
    formError.value = readApiFailure(err) || t('user.deleteError')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" dismissable-mask :header="t('user.deleteTitle')"
    :style="{ width: 'min(420px, 96vw)' }">
    <p class="m-0">{{ t('user.deleteMessage', { name: displayName }) }}</p>
    <Message v-if="formError" class="mt-3" severity="error">{{ formError }}</Message>
    <div class="mt-4 flex justify-end gap-2">
      <Button type="button" :label="t('common.cancel')" :raised="false" text severity="secondary" :disabled="deleting"
        @click="close" />
      <Button :label="t('common.delete')" icon="pi pi-trash" severity="danger" :loading="deleting" :disabled="deleting"
        @click="confirmDelete" />
    </div>
  </Dialog>
</template>
