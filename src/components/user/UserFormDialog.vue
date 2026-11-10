<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import ToggleSwitch from 'primevue/toggleswitch'
import Dialog from '@/components/ui/AppDialog.vue'
import Button from '@/components/ui/AppButton.vue'
import FloatLabel from '@/components/ui/AppFloatLabel.vue'
import InputText from '@/components/ui/AppInputText.vue'
import Password from '@/components/ui/AppPassword.vue'
import Message from '@/components/ui/AppMessage.vue'
import { createUserFormSchema, type UserFormMode } from '@/schemas/user'
import { queryUserGetOne, updateUser, userCreate } from '@/services/api/user'
import { readApiFailure } from '@/services/api/error'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{
  mode: UserFormMode
  userId?: string
}>()

const visible = defineModel<boolean>('visible', { default: false })
const emit = defineEmits<{
  saved: []
}>()

const { t, locale } = useI18n()
const toast = useToast()
const auth = useAuthStore()
const loading = ref(false)
const saving = ref(false)
const formError = ref('')

const emptyValues = {
  code: '',
  name: '',
  password: '',
  allowWeb: true,
  isActive: true,
}

const { defineField, handleSubmit, errors, resetForm } = useForm({
  validationSchema: computed(() => {
    void locale.value
    return toTypedSchema(createUserFormSchema(props.mode))
  }),
  initialValues: emptyValues,
  validateOnMount: false,
})

const [code, codeAttrs] = defineField('code', { validateOnModelUpdate: true })
const [name, nameAttrs] = defineField('name', { validateOnModelUpdate: true })
const [password, passwordAttrs] = defineField('password', { validateOnModelUpdate: true })
const [allowWeb] = defineField('allowWeb')
const [isActive] = defineField('isActive')

const title = computed(() => (props.mode === 'create' ? t('user.addTitle') : t('user.editTitle')))

function actorId() {
  return auth.session?.userId?.trim() ?? ''
}

function close() {
  visible.value = false
}

async function loadUser(id: string) {
  loading.value = true
  try {
    const res = await queryUserGetOne(id)
    const user = res.data
    if (!user || res.success === false) {
      toast.add({
        severity: 'warn',
        summary: res.message || t('user.notFound'),
        life: 2500,
        closable: false,
      })
      close()
      return
    }
    resetForm({
      values: {
        code: user.code ?? '',
        name: user.name ?? '',
        password: '',
        allowWeb: user.allowWeb ?? false,
        isActive: user.isActive ?? false,
      },
    })
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
  formError.value = ''
  if (!open) return
  resetForm({ values: { ...emptyValues } })
  if (props.mode === 'edit' && props.userId) {
    await loadUser(props.userId)
  }
})

const submit = handleSubmit(async (values) => {
  const updatedBy = actorId()
  if (!updatedBy) {
    formError.value = t('user.needSession')
    return
  }
  saving.value = true
  formError.value = ''
  try {
    const res =
      props.mode === 'create'
        ? await userCreate({
          code: String(values.code ?? '').trim(),
          name: String(values.name ?? '').trim(),
          password: String(values.password ?? ''),
          allowWeb: Boolean(values.allowWeb),
          isActive: Boolean(values.isActive),
          createdBy: updatedBy,
          updatedBy,
        })
        : await updateUser(props.userId ?? '', {
          code: String(values.code ?? '').trim(),
          name: String(values.name ?? '').trim(),
          allowWeb: Boolean(values.allowWeb),
          isActive: Boolean(values.isActive),
          updatedBy,
        })
    if (res.success === false) {
      formError.value = res.message || t('user.saveError')
      return
    }
    toast.add({
      severity: 'success',
      summary: props.mode === 'create' ? t('user.saved') : t('user.updated'),
      life: 2500,
      closable: false,
    })
    emit('saved')
    close()
  } catch (err) {
    formError.value = readApiFailure(err) || t('user.saveError')
  } finally {
    saving.value = false
  }
})
</script>

<template>
  <Dialog v-model:visible="visible" dismissable-mask :header="title" :style="{ width: 'min(420px, 96vw)' }">
    <form class="grid gap-3 pt-2" @submit.prevent="submit">
      <div v-if="loading" class="flex justify-center py-6">
        <i class="pi pi-spinner pi-spin text-xl" />
      </div>
      <template v-else>
        <div>
          <FloatLabel variant="on">
            <InputText id="user-code" v-model="code" v-bind="codeAttrs" :invalid="Boolean(errors.code)"
              class="w-full" />
            <label for="user-code">{{ t('user.code') }}</label>
          </FloatLabel>
          <small class="p-error">{{ errors.code }}</small>
        </div>
        <div>
          <FloatLabel variant="on">
            <InputText id="user-name" v-model="name" v-bind="nameAttrs" :invalid="Boolean(errors.name)"
              class="w-full" />
            <label for="user-name">{{ t('user.name') }}</label>
          </FloatLabel>
          <small class="p-error">{{ errors.name }}</small>
        </div>
        <div v-if="mode === 'create'">
          <FloatLabel variant="on">
            <Password input-id="user-password" v-model="password" v-bind="passwordAttrs"
              :invalid="Boolean(errors.password)" class="w-full" />
            <label for="user-password">{{ t('user.password') }}</label>
          </FloatLabel>
          <small class="p-error">{{ errors.password }}</small>
        </div>
        <div class="flex items-center justify-between gap-3">
          <label for="user-allow-web">{{ t('user.allowWeb') }}</label>
          <ToggleSwitch input-id="user-allow-web" v-model="allowWeb" />
        </div>
        <div class="flex items-center justify-between gap-3">
          <label for="user-active">{{ t('user.active') }}</label>
          <ToggleSwitch input-id="user-active" v-model="isActive" />
        </div>
        <Message v-if="formError" severity="error">{{ formError }}</Message>
      </template>
      <div class="mt-1 flex justify-end gap-2">
        <Button type="button" :label="t('common.cancel')" size="large" :raised="false" text severity="secondary"
          :disabled="saving" @click="close" />
        <Button type="submit" :label="t('common.save')" icon="pi pi-check" size="large" :loading="saving"
          :disabled="loading || saving" />
      </div>
    </form>
  </Dialog>
</template>
