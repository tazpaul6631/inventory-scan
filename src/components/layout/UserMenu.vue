<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Avatar from 'primevue/avatar'
import Menu from 'primevue/menu'
import { useConfirm } from 'primevue/useconfirm'
import { useAuthStore } from '@/stores/auth'
import { useNetworkStore } from '@/stores/network'
import { personInitials } from '@/utils/format'
import ChangePasswordDialog from '@/components/user/ChangePasswordDialog.vue'
import type { MenuItem } from 'primevue/menuitem'

const { compact } = defineProps<{ compact?: boolean }>()

const { t } = useI18n()
const router = useRouter()
const confirm = useConfirm()
const auth = useAuthStore()
const network = useNetworkStore()
const menu = ref<InstanceType<typeof Menu>>()
const passwordOpen = ref(false)

const displayName = computed(() => auth.session?.name?.trim() || auth.session?.email || t('app.name'))
const displayCode = computed(() => auth.session?.code?.trim() || auth.session?.email || '—')
const initials = computed(() => personInitials(displayName.value))

const items = computed<MenuItem[]>(() => [
  {
    label: t('auth.changePassword'),
    icon: 'pi pi-key',
    class: 'user-menu-item user-menu-item-change-password',
    command: openChangePassword,
  },
  { separator: true },
  {
    label: t('auth.logout'),
    icon: 'pi pi-sign-out',
    class: 'user-menu-item user-menu-item-logout',
    command: logout,
  },
])

function openChangePassword() {
  passwordOpen.value = true
}

function toggleMenu(event: Event) {
  menu.value?.toggle(event)
}

function hideMenu() {
  menu.value?.hide()
}

defineExpose({ hide: hideMenu })

function logout() {
  confirm.require({
    header: t('auth.logout'),
    message: t('auth.confirmLogout'),
    acceptLabel: t('auth.logout'),
    rejectLabel: t('common.cancel'),
    acceptIcon: 'pi pi-sign-out',
    acceptClass: 'p-button-danger',
    rejectClass: 'p-button-secondary',
    acceptProps: {
      raised: true,
      ripple: false,
      icon: 'pi pi-sign-out',
    },
    rejectProps: {
      text: true,
      raised: false,
      ripple: false,
    },
    accept: async () => {
      await auth.logout()
      await router.replace({ name: 'login' })
    },
    reject: async () => {
      confirm.close()
    },
  })
}
</script>

<template>
  <button type="button" class="user-chip" :class="{ compact }" :aria-label="displayName" @click="toggleMenu">
    <span class="user-avatar-wrap">
      <Avatar :label="initials" shape="circle" class="user-avatar" />
      <i class="user-net-dot" :class="network.online ? 'online' : 'offline'"
        :title="`${network.online ? t('common.online') : t('common.offline')} · ${network.connectionType}`"
        aria-hidden="true" />
    </span>
    <span v-if="!compact" class="user-chip-text">
      <strong>{{ displayName }}</strong>
      <small>{{ displayCode }}</small>
    </span>
    <i v-if="!compact" class="pi pi-angle-down user-chip-caret" aria-hidden="true" />
  </button>
  <Menu ref="menu" class="user-menu" :model="items" popup />
  <ChangePasswordDialog v-model:visible="passwordOpen" />
</template>