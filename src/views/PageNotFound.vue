<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Button from '@/components/ui/AppButton.vue'
import LocaleSelect from '@/components/layout/LocaleSelect.vue'
import { detectDeviceShell, homePathForShell, type DeviceShell } from '@/adapters/platform'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const shell = ref<DeviceShell>(detectDeviceShell())

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

function goHome() {
    if (auth.isLoggedIn) {
        void router.replace(homePathForShell())
        return
    }
    void router.replace({ name: 'login' })
}
</script>

<template>
    <div class="grid min-h-dvh max-h-dvh place-items-center overflow-y-auto"
        :style="{ padding: 'calc(16px + var(--safe-top)) calc(16px + var(--safe-right)) calc(16px + var(--safe-bottom)) calc(16px + var(--safe-left))' }">
        <div
            class="mx-auto grid w-full max-w-[420px] gap-3.5 rounded-2xl border border-line bg-white p-2.5 text-center shadow-panel md:max-w-[460px] md:p-7">
            <div class="flex items-center justify-between gap-2">
                <img class="h-7 w-auto max-w-42 object-contain" src="/logo-company.png" :alt="t('app.name')" />
                <LocaleSelect :compact="shell === 'mobile'" />
            </div>
            <p class="m-0 text-4xl font-bold tracking-tight text-[#06755b]">404</p>
            <h1 class=" m-0 text-2xl">{{ t('errors.pageNotFound') }}</h1>
            <p class="m-0 text-muted">{{ t('errors.pageNotFoundHint') }}</p>
            <Button :label="auth.isLoggedIn ? t('nav.dashboard') : t('auth.login')"
                :icon="auth.isLoggedIn ? 'pi pi-home' : 'pi pi-sign-in'" size="large" @click="goHome" />
        </div>
    </div>
</template>
