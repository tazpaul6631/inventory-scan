<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import dayjs from 'dayjs'
import Dialog from '@/components/ui/AppDialog.vue'
import Button from '@/components/ui/AppButton.vue'
import FloatLabel from '@/components/ui/AppFloatLabel.vue'
import InputText from '@/components/ui/AppInputText.vue'
import DatePicker from '@/components/ui/AppDatePicker.vue'
import Message from '@/components/ui/AppMessage.vue'
import { createCycleFormSchema, type CycleFormMode } from '@/schemas/cycle'
import { createCycle, queryCycleGetOne, updateCycle } from '@/services/api/category'
import { readApiFailure } from '@/services/api/error'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{
  mode: CycleFormMode
  cycleId?: number
}>()

const visible = defineModel<boolean>('visible', { default: false })
const emit = defineEmits<{
  saved: []
  created: []
}>()

const { t, locale } = useI18n()
const toast = useToast()
const auth = useAuthStore()
const loading = ref(false)
const saving = ref(false)
const formError = ref('')

const emptyValues = {
  scanDate: null as Date | null,
  description: '',
}

const { defineField, handleSubmit, errors, resetForm } = useForm({
  validationSchema: computed(() => {
    void locale.value
    return toTypedSchema(createCycleFormSchema())
  }),
  initialValues: emptyValues,
  validateOnMount: false,
})

const [scanDate, scanDateAttrs] = defineField('scanDate', { validateOnModelUpdate: true })
const [description, descriptionAttrs] = defineField('description', { validateOnModelUpdate: true })

const title = computed(() => (props.mode === 'create' ? t('cycle.createTitle') : t('cycle.editTitle')))

function actorId() {
  return auth.session?.userId?.trim() ?? ''
}

/** Date-only picker → persist as 07:30 local on the chosen day. */
function atMorningDefault(value: Date) {
  return dayjs(value).hour(7).minute(30).second(0).millisecond(0).toDate()
}

/** Local wall-clock 07:30 — do not convert to UTC via toISOString(). */
function toLocalScanDate(value: Date) {
  return dayjs(atMorningDefault(value)).format('YYYY-MM-DDTHH:mm:ss')
}

function defaultCreateScanDate() {
  return atMorningDefault(new Date())
}

function close() {
  visible.value = false
}

async function loadCycle(id: number) {
  loading.value = true
  try {
    const res = await queryCycleGetOne(id)
    const cycle = res.data
    if (!cycle || res.success === false) {
      toast.add({
        severity: 'warn',
        summary: res.message || t('cycle.notFound'),
        life: 2500,
        closable: false,
      })
      close()
      return
    }
    const parsed = cycle.scanDate ? dayjs(cycle.scanDate) : null
    resetForm({
      values: {
        scanDate: parsed?.isValid() ? parsed.toDate() : null,
        description: cycle.description ?? '',
      },
    })
  } catch (err) {
    toast.add({
      severity: 'warn',
      summary: readApiFailure(err) || t('cycle.loadError'),
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
  if (props.mode === 'edit' && props.cycleId != null) {
    resetForm({ values: { ...emptyValues } })
    await loadCycle(props.cycleId)
    return
  }
  resetForm({
    values: {
      scanDate: defaultCreateScanDate(),
      description: '',
    },
  })
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
    const payload = {
      scanDate: toLocalScanDate(values.scanDate),
      description: String(values.description ?? '').trim(),
      updatedBy,
    }
    const res =
      props.mode === 'create'
        ? await createCycle({
          ...payload,
          createdBy: updatedBy,
        })
        : await updateCycle(props.cycleId ?? 0, payload)
    if (res.success === false) {
      formError.value = res.message || t('cycle.saveError')
      return
    }
    toast.add({
      severity: 'success',
      summary: props.mode === 'create' ? t('cycle.saveSuccess') : t('cycle.updateSuccess'),
      life: 2500,
      closable: false,
    })
    emit('saved')
    if (props.mode === 'create') emit('created')
    close()
  } catch (err) {
    formError.value = readApiFailure(err) || t('cycle.saveError')
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
            <DatePicker input-id="cycle-scan-date" v-model="scanDate" v-bind="scanDateAttrs" class="w-full"
              :invalid="Boolean(errors.scanDate)" date-format="dd/mm/yy" show-icon show-button-bar />
            <label for="cycle-scan-date">{{ t('cycle.scanDate') }}</label>
          </FloatLabel>
          <small class="p-error">{{ errors.scanDate }}</small>
        </div>
        <div>
          <FloatLabel variant="on">
            <InputText id="cycle-description" v-model="description" v-bind="descriptionAttrs" class="w-full"
              :invalid="Boolean(errors.description)" />
            <label for="cycle-description">{{ t('cycle.description') }}</label>
          </FloatLabel>
          <small class="p-error">{{ errors.description }}</small>
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
