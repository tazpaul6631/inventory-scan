<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import Dialog from '@/components/ui/AppDialog.vue'
import Button from '@/components/ui/AppButton.vue'
import FloatLabel from '@/components/ui/AppFloatLabel.vue'
import Password from '@/components/ui/AppPassword.vue'
import Message from '@/components/ui/AppMessage.vue'
import { createChangePasswordSchema } from '@/schemas/user'
import { changePasswordUser } from '@/services/api/user'
import { readApiFailure } from '@/services/api/error'
import { useAuthStore } from '@/stores/auth'

const visible = defineModel<boolean>('visible', { default: false })
const { t, locale } = useI18n()
const toast = useToast()
const auth = useAuthStore()
const saving = ref(false)
const formError = ref('')

const emptyValues = {
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
}

const { defineField, handleSubmit, errors, resetForm } = useForm({
  validationSchema: computed(() => {
    void locale.value
    return toTypedSchema(createChangePasswordSchema())
  }),
  initialValues: emptyValues,
  validateOnMount: false,
})

const [oldPassword, oldPasswordAttrs] = defineField('oldPassword', { validateOnModelUpdate: true })
const [newPassword, newPasswordAttrs] = defineField('newPassword', { validateOnModelUpdate: true })
const [confirmPassword, confirmPasswordAttrs] = defineField('confirmPassword', { validateOnModelUpdate: true })

function close() {
  visible.value = false
}

watch(visible, (open) => {
  formError.value = ''
  if (open) resetForm({ values: { ...emptyValues } })
})

const submit = handleSubmit(async (values) => {
  const userId = auth.session?.userId?.trim() ?? ''
  if (!userId) {
    formError.value = t('user.needSession')
    return
  }
  saving.value = true
  formError.value = ''
  try {
    const res = await changePasswordUser(userId, {
      oldPassword: String(values.oldPassword ?? ''),
      newPassword: String(values.newPassword ?? ''),
    })
    if (res.success === false) {
      formError.value = res.message || t('auth.changePasswordError')
      return
    }
    toast.add({
      severity: 'success',
      summary: t('auth.changePasswordSuccess'),
      life: 2500,
      closable: false,
    })
    close()
  } catch (err) {
    formError.value = readApiFailure(err) || t('auth.changePasswordError')
  } finally {
    saving.value = false
  }
})
</script>

<template>
  <Dialog v-model:visible="visible" dismissable-mask :header="t('auth.changePassword')"
    :style="{ width: 'min(420px, 96vw)' }">
    <form class="grid gap-3" @submit.prevent="submit">
      <div>
        <FloatLabel variant="on">
          <Password input-id="change-old-password" v-model="oldPassword" v-bind="oldPasswordAttrs"
            :invalid="Boolean(errors.oldPassword)" class="w-full" />
          <label for="change-old-password">{{ t('auth.currentPassword') }}</label>
        </FloatLabel>
        <small class="p-error">{{ errors.oldPassword }}</small>
      </div>
      <div>
        <FloatLabel variant="on">
          <Password input-id="change-new-password" v-model="newPassword" v-bind="newPasswordAttrs"
            :invalid="Boolean(errors.newPassword)" class="w-full" />
          <label for="change-new-password">{{ t('auth.newPassword') }}</label>
        </FloatLabel>
        <small class="p-error">{{ errors.newPassword }}</small>
      </div>
      <div>
        <FloatLabel variant="on">
          <Password input-id="change-confirm-password" v-model="confirmPassword" v-bind="confirmPasswordAttrs"
            :invalid="Boolean(errors.confirmPassword)" class="w-full" />
          <label for="change-confirm-password">{{ t('auth.confirmPassword') }}</label>
        </FloatLabel>
        <small class="p-error">{{ errors.confirmPassword }}</small>
      </div>
      <Message v-if="formError" severity="error">{{ formError }}</Message>
      <div class="mt-1 flex justify-end gap-2">
        <Button type="button" :label="t('common.cancel')" :raised="false" text severity="secondary" :disabled="saving"
          @click="close" />
        <Button type="submit" :label="t('common.save')" icon="pi pi-check" :loading="saving" :disabled="saving" />
      </div>
    </form>
  </Dialog>
</template>
