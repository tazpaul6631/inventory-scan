<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
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
import {
  cancelLiveScan,
  isScanCanceled,
  preferLiveScan,
  scanOnce,
  scanOnceLive,
} from '@/adapters/barcode'
import type { ScanResult } from '@/types'
import { getFactoryList, queryCycleResult } from '@/services/api/category'
import { readApiFailure } from '@/services/api/error'
import {
  replaceCycles,
  replaceFactories,
} from '@/services/repositories/offline-catalog'
import { useOfflineDownload } from '@/composables/useOfflineDownload'
import OfflineDownloadDialog from '@/components/offline/OfflineDownloadDialog.vue'
import type { ViewCycle, ViewFactory } from '@/types/api'

const { t, locale } = useI18n()
const toast = useToast()
const route = useRoute()
const router = useRouter()
const settings = useSettingsStore()
const auth = useAuthStore()
const { runOfflineDownload, busy: offlineDownloading } = useOfflineDownload()
const submitting = ref(false)
const scanning = ref(false)
const credentialError = ref('')
const shell = ref<DeviceShell>(detectDeviceShell())
const isMobileLogin = computed(() => shell.value === 'mobile')
const factoryRows = ref<ViewFactory[]>([])
const latestCycle = ref<ViewCycle | null>(null)

function refreshShell() {
  shell.value = detectDeviceShell()
}

const liveScanOpen = ref(false)
const LIVE_SCAN_ELEMENT_ID = 'login-live-reader'

async function closeLiveScanOverlay() {
  liveScanOpen.value = false
  await cancelLiveScan().catch(() => undefined)
}

async function scanWithLiveFallback(): Promise<ScanResult> {
  liveScanOpen.value = true
  await nextTick()
  try {
    return await scanOnceLive(LIVE_SCAN_ELEMENT_ID)
  } finally {
    await closeLiveScanOverlay()
  }
}

onMounted(() => {
  refreshShell()
  window.addEventListener('resize', refreshShell)
})

onUnmounted(() => {
  window.removeEventListener('resize', refreshShell)
  void closeLiveScanOverlay()
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
    factoryRows.value = res.data ?? []
    factoryOptions.value = factoryRows.value
      .map((item) => {
        const name = item.name?.trim() || ''
        const abbr = item.abbr?.trim() || ''
        return { label: name || abbr, value: abbr || name, id: item.id, abbr }
      })
      .filter((item) => item.value)
  } catch (err) {
    factoryRows.value = []
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
    latestCycle.value = null
    return
  }
  try {
    const res = await queryCycleResult()
    latestCycle.value = res.data ?? null
    cycle.value = formatScanDate(res.data?.scanDate)
    cycleId.value = res.data?.id
  } catch (err) {
    cycle.value = ''
    cycleId.value = undefined
    latestCycle.value = null
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

function fieldValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function hasFactoryAndCycle() {
  return Boolean(fieldValue(factory.value) && fieldValue(cycle.value))
}

const canSubmit = computed(() => {
  const staff = fieldValue(staffId.value)
  if (!staff) return false
  if (isMobileLogin.value) return hasFactoryAndCycle()
  return Boolean(fieldValue(password.value))
})

function redirectAfterLogin() {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
  return redirect.startsWith('/') && !redirect.startsWith('/login')
    ? redirect
    : homePathForShell()
}

async function persistLoginCatalog() {
  if (factoryRows.value.length) {
    await replaceFactories(factoryRows.value)
  }
  if (latestCycle.value) {
    await replaceCycles([latestCycle.value])
  }
}

async function onOfflineDownloadFinished() {
  toast.add({
    severity: 'success',
    summary: t('offlineDownload.success'),
    life: 2500,
    closable: false,
  })
  await router.replace(redirectAfterLogin())
}

async function continueAfterAuthSuccess(factoryValue: string, cycleValue: string) {
  if (!isMobileLogin.value) {
    await router.replace(redirectAfterLogin())
    return
  }
  const selectedFactory = factoryOptions.value.find((item) => item.value === factoryValue)
  const selectedFactoryId = selectedFactory?.id
  const selectedCycleId = cycleId.value
  await auth.setLoginSelection(
    factoryValue,
    cycleValue,
    selectedFactory?.label,
    selectedFactoryId,
    selectedFactory?.abbr,
    selectedCycleId,
  )
  try {
    await persistLoginCatalog()
  } catch (err) {
    credentialError.value = readApiFailure(err) || t('offlineDownload.error')
    return
  }
  if (selectedFactoryId == null || selectedCycleId == null) {
    credentialError.value = t('offlineDownload.missingContext')
    return
  }
  await runOfflineDownload({ factoryId: selectedFactoryId, cycleId: selectedCycleId })
}

async function scanStaffId() {
  if (scanning.value || submitting.value || offlineDownloading.value || liveScanOpen.value) return
  scanning.value = true
  credentialError.value = ''
  try {
    let result: ScanResult
    if (preferLiveScan()) {
      result = await scanWithLiveFallback()
    } else {
      try {
        result = await scanOnce()
      } catch (err) {
        if (isScanCanceled(err)) return
        result = await scanWithLiveFallback()
      }
    }
    const code = result.value.trim()
    if (!code) return
    staffId.value = code

    if (isMobileLogin.value && !hasFactoryAndCycle()) {
      credentialError.value = t('validation.factoryRequired')
      return
    }

    const res = await auth.login(code, { platform: 'Mobile' })
    if (res.success && auth.isLoggedIn) {
      await continueAfterAuthSuccess(fieldValue(factory.value), fieldValue(cycle.value))
      return
    }
    credentialError.value = res.message || t('auth.invalid')
  } catch (err) {
    if (isScanCanceled(err)) return
    credentialError.value =
      readApiFailure(err) || t('scan.scanFallbackManual')
  } finally {
    scanning.value = false
  }
}

const submit = handleSubmit(async (values) => {
  credentialError.value = ''
  submitting.value = true
  try {
    const code = String(values.staffId ?? '').trim()
    if (!code) {
      credentialError.value = t('auth.invalid')
      return
    }

    const res = isMobileLogin.value
      ? await auth.login(code, { platform: 'Mobile' })
      : await auth.login(code, {
        password: String(values.password ?? ''),
        platform: 'Website',
        requireAllowWeb: true,
      })

    if (res.success && auth.isLoggedIn) {
      await continueAfterAuthSuccess(String(values.factory ?? ''), String(values.cycle ?? ''))
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
          <Button v-if="isMobileLogin" type="button" icon="pi pi-qrcode" size="large" class="shrink-0"
            :aria-label="t('scan.checkQR')" :loading="scanning" :disabled="scanning || submitting || offlineDownloading"
            @click="scanStaffId" />
        </div>
        <small class="p-error">{{ errors.staffId }}</small>
      </div>
      <div v-if="!isMobileLogin">
        <FloatLabel variant="on">
          <Password input-id="password" v-model="password" v-bind="passwordAttrs" :invalid="Boolean(errors.password)"
            class="w-full" @update:model-value="clearCredentialError" />
          <label for="password">{{ t('auth.password') }}</label>
        </FloatLabel>
        <small class="p-error">{{ errors.password }}</small>
      </div>

      <Message v-if="credentialError" severity="error">{{ credentialError }}</Message>
      <Button type="submit" :label="t('auth.login')" icon="pi pi-sign-in" size="large"
        :loading="submitting || offlineDownloading" :disabled="!canSubmit || submitting || offlineDownloading" />
      <p class="m-0 text-center text-xs text-muted">{{ t('footer.copyright') }}</p>
    </form>

    <OfflineDownloadDialog v-if="isMobileLogin" @finished="onOfflineDownloadFinished" />

    <Teleport to="body">
      <div v-if="liveScanOpen" class="live-scan-overlay" role="dialog" aria-modal="true"
        :aria-label="t('scan.liveScanTitle')">
        <div class="live-scan-overlay__bar">
          <p class="live-scan-overlay__hint m-0">{{ t('scan.liveScanHint') }}</p>
          <Button type="button" :label="t('scan.liveScanClose')" severity="secondary" size="large"
            @click="closeLiveScanOverlay" />
        </div>
        <div :id="LIVE_SCAN_ELEMENT_ID" class="live-scan-overlay__reader" />
      </div>
    </Teleport>
  </div>
</template>