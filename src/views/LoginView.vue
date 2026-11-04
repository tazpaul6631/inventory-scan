<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import dayjs from 'dayjs'
import Select from '@/components/ui/AppSelect.vue'
import FloatLabel from '@/components/ui/AppFloatLabel.vue'
import Button from '@/components/ui/AppButton.vue'
import Message from '@/components/ui/AppMessage.vue'
import InputText from '@/components/ui/AppInputText.vue'
import Password from '@/components/ui/AppPassword.vue'
import { createLoginSchema } from '@/schemas/login'
import { useSettingsStore } from '@/stores/settings'
import LocaleSelect from '@/components/layout/LocaleSelect.vue'
import { detectDeviceShell, homePathForShell, type DeviceShell } from '@/adapters/platform'
import { useAuthStore } from '@/stores/auth'
import { scanOnce } from '@/adapters/barcode'
import { getFactoryList, queryCycleResult } from '@/services/api/category'
import { readApiFailure } from '@/services/api/error'

const { t, locale } = useI18n()
const toast = useToast()
const route = useRoute()
const router = useRouter()
const settings = useSettingsStore()
const auth = useAuthStore()
const submitting = ref(false)
const scanning = ref(false)
const credentialError = ref('')
const shell = ref<DeviceShell>(detectDeviceShell())
const isMobileLogin = computed(() => shell.value === 'mobile')

function refreshShell() {
  shell.value = detectDeviceShell()
}

onMounted(() => {
  refreshShell()
  window.addEventListener('resize', refreshShell)
})

onUnmounted(() => {
  window.removeEventListener('resize', refreshShell)
})

const { defineField, handleSubmit, errors } = useForm({
  validationSchema: computed(() => {
    void locale.value
    return toTypedSchema(createLoginSchema(isMobileLogin.value ? 'mobile' : 'web'))
  }),
  initialValues: { factory: '', cycle: '', staffId: '', password: '' },
  validateOnMount: false,
})

const [factory, factoryAttrs] = defineField('factory', { validateOnModelUpdate: true })
const [cycle, cycleAttrs] = defineField('cycle', { validateOnModelUpdate: true })
const [staffId, staffIdAttrs] = defineField('staffId', { validateOnModelUpdate: true })
const [password, passwordAttrs] = defineField('password', { validateOnModelUpdate: true })
const factoryOptions = ref<{ label: string; value: string; id: number | undefined; abbr: string }[]>([])
const loadingFactories = ref(false)
const cycleId = ref<number | undefined>()

function clearCredentialError() {
  if (credentialError.value) credentialError.value = ''
}

function formatScanDate(value?: string | null) {
  if (!value) return ''
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('DD/MM/YYYY') : ''
}

async function loadFactories() {
  if (loadingFactories.value) return
  loadingFactories.value = true
  try {
    const res = await getFactoryList()
    factoryOptions.value = (res.data ?? []).map((item) => {
      const name = item.name?.trim() || ''
      const abbr = item.abbr?.trim() || ''
      return { label: name || abbr, value: abbr || name, id: item.id, abbr }
    }).filter((item) => item.value)
  } catch (err) {
    factoryOptions.value = []
    toast.add({
      severity: 'warn',
      summary: readApiFailure(err) || t('auth.invalid'),
      life: 2500,
      closable: false,
    })
  } finally {
    loadingFactories.value = false
  }
}

async function loadCycle() {
  const factoryValue = typeof factory.value === 'string' ? factory.value.trim() : ''
  if (!factoryValue) {
    cycle.value = ''
    cycleId.value = undefined
    return
  }
  try {
    const res = await queryCycleResult()
    cycle.value = formatScanDate(res.data?.scanDate)
    cycleId.value = res.data?.id
  } catch (err) {
    cycle.value = ''
    cycleId.value = undefined
    toast.add({
      severity: 'warn',
      summary: readApiFailure(err) || t('auth.invalid'),
      life: 2500,
      closable: false,
    })
  }
}

function onFactoryChange() {
  clearCredentialError()
  void loadCycle()
}

function onFactoryShow() {
  void loadFactories()
}

function isScanCanceled(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  return /cancel/i.test(message)
}

function fieldValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function hasFactoryAndCycle() {
  return Boolean(fieldValue(factory.value) && fieldValue(cycle.value))
}

const canSubmit = computed(() => {
  const staff = fieldValue(staffId.value)
  const pwd = fieldValue(password.value)
  if (!staff || !pwd) return false
  return isMobileLogin.value ? hasFactoryAndCycle() : true
})

async function scanStaffId() {
  if (scanning.value || submitting.value) return
  scanning.value = true
  try {
    const result = await scanOnce()
    const code = result.value.trim()
    if (!code) return
    staffId.value = code
    if (canSubmit.value) await submit()
  } catch (err) {
    if (isScanCanceled(err)) return
    toast.add({
      severity: 'warn',
      summary: err instanceof Error ? err.message : String(err),
      life: 2500,
      closable: false,
    })
  } finally {
    scanning.value = false
  }
}

function redirectAfterLogin() {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
  return redirect.startsWith('/') && !redirect.startsWith('/login')
    ? redirect
    : homePathForShell()
}

const submit = handleSubmit(async (values) => {
  credentialError.value = ''
  submitting.value = true
  try {
    const res = await auth.login(String(values.staffId ?? ''), String(values.password ?? ''), {
      requireAllowWeb: !isMobileLogin.value,
    })
    if (res.success && auth.isLoggedIn) {
      if (isMobileLogin.value) {
        const factoryValue = String(values.factory ?? '')
        const selectedFactory = factoryOptions.value.find((item) => item.value === factoryValue)
        await auth.setLoginSelection(
          factoryValue,
          String(values.cycle ?? ''),
          selectedFactory?.label,
          selectedFactory?.id,
          selectedFactory?.abbr,
          cycleId.value,
        )
      }
      await router.replace(redirectAfterLogin())
      return
    }
    credentialError.value = res.message || t('auth.invalid')
  } catch (err) {
    credentialError.value = readApiFailure(err) || t('auth.invalid')
  } finally {
    submitting.value = false
  }
})
</script>

<template>
  <div
    class="grid min-h-dvh max-h-dvh grid-rows-1 place-items-center overflow-y-auto lg:grid-cols-[minmax(280px,1fr)_minmax(360px,1fr)] lg:grid-rows-[1fr_auto] lg:place-items-stretch lg:!p-0"
    :style="{ padding: 'calc(16px + var(--safe-top)) calc(16px + var(--safe-right)) calc(16px + var(--safe-bottom)) calc(16px + var(--safe-left))' }"
    :data-shell="shell">
    <section
      class="hidden flex-col items-center justify-center bg-linear-to-b from-sidebar to-sidebar-2 px-10 py-12 text-[#e7f6f1] lg:flex lg:row-start-1"
      :style="{ paddingTop: 'calc(48px + var(--safe-top))', paddingLeft: 'calc(40px + var(--safe-left))' }">
      <img class="brand-mark size-[72px] rounded-[10px]" src="/logo-icon.jpg" :alt="t('app.name')" />
      <h1 class="mt-4 mb-2 text-4xl">{{ t('app.name') }}</h1>
      <p class="m-0 opacity-80">{{ settings.current.companyName }}</p>
      <p class="mt-4 font-semibold opacity-100">{{ t(`nav.${shell}`) }}</p>
    </section>

    <form
      class="mx-auto grid w-full max-w-[420px] gap-3.5 rounded-2xl border border-line bg-white p-2.5 shadow-panel md:max-w-[460px] md:p-7 lg:row-start-1 lg:mt-[calc(24px+var(--safe-top))] lg:mr-[calc(24px+var(--safe-right))] lg:mb-6 lg:ml-6 lg:max-w-[420px] lg:self-center lg:justify-self-center"
      @submit.prevent="submit">
      <div class="flex flex-wrap-reverse items-center justify-center gap-3">
        <div>
          <h2 class="m-0 text-2xl">{{ t('auth.login') }}</h2>
        </div>

        <div class="flex w-full flex-row flex-wrap items-center justify-between gap-2">
          <img class="h-7 w-auto max-w-42 object-contain" src="/logo-company.png" :alt="t('app.name')" />
          <LocaleSelect :compact="shell === 'mobile'" />
        </div>
      </div>

      <template v-if="isMobileLogin">
        <div>
          <FloatLabel variant="on">
            <Select input-id="factory" v-model="factory" v-bind="factoryAttrs" :options="factoryOptions"
              option-label="label" option-value="value" :invalid="Boolean(errors.factory)" class="w-full"
              :loading="loadingFactories" @before-show="onFactoryShow" @update:model-value="onFactoryChange" />
            <label for="factory">{{ t('auth.factory') }}</label>
          </FloatLabel>
          <small class="p-error">{{ errors.factory }}</small>
        </div>
        <div>
          <FloatLabel variant="on">
            <InputText id="cycle" v-model="cycle" v-bind="cycleAttrs" readonly :invalid="Boolean(errors.cycle)"
              class="w-full" />
            <label for="cycle">{{ t('auth.cycle') }}</label>
          </FloatLabel>
          <small class="p-error">{{ errors.cycle }}</small>
        </div>
      </template>
      <div>
        <div class="flex items-center gap-2">
          <FloatLabel variant="on" class="min-w-0 flex-1">
            <InputText id="staff-id" v-model="staffId" v-bind="staffIdAttrs" :invalid="Boolean(errors.staffId)"
              class="w-full" @update:model-value="clearCredentialError" />
            <label for="staff-id">{{ t('scan.staffId') }}</label>
          </FloatLabel>
          <Button v-if="isMobileLogin" type="button" icon="pi pi-qrcode" class="shrink-0"
            :aria-label="t('scan.checkQR')" :loading="scanning" :disabled="scanning || submitting"
            @click="scanStaffId" />
        </div>
        <small class="p-error">{{ errors.staffId }}</small>
      </div>
      <div>
        <FloatLabel variant="on">
          <Password input-id="password" v-model="password" v-bind="passwordAttrs" :invalid="Boolean(errors.password)"
            class="w-full" @update:model-value="clearCredentialError" />
          <label for="password">{{ t('auth.password') }}</label>
        </FloatLabel>
        <small class="p-error">{{ errors.password }}</small>
      </div>

      <Message v-if="credentialError" severity="error">{{ credentialError }}</Message>
      <Button type="submit" :label="t('auth.login')" icon="pi pi-sign-in" :loading="submitting"
        :disabled="!canSubmit || submitting" />
      <p class="m-0 text-center text-xs text-muted">{{ t('footer.copyright') }}</p>
    </form>
  </div>
</template>