<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Avatar from 'primevue/avatar'
import Menu from 'primevue/menu'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth'
import { useNetworkStore } from '@/stores/network'
import { personInitials } from '@/utils/format'
import ChangePasswordDialog from '@/components/user/ChangePasswordDialog.vue'
import LocaleSelect from '@/components/layout/LocaleSelect.vue'
import ScanCommandSyncDialog from '@/components/sync/ScanCommandSyncDialog.vue'
import { useOfflineScanCommandSync } from '@/composables/useOfflineScanCommandSync'
import { countPendingScanCommands } from '@/services/repositories/offline-catalog'
import type { MenuItem } from 'primevue/menuitem'

const { compact } = defineProps<{ compact?: boolean }>()

const { t } = useI18n()
const router = useRouter()
const confirm = useConfirm()
const toast = useToast()
const auth = useAuthStore()
const network = useNetworkStore()
const { startSync } = useOfflineScanCommandSync()
const menu = ref<InstanceType<typeof Menu>>()
const passwordOpen = ref(false)
const logoutAfterSync = ref(false)

const displayName = computed(() => auth.session?.name?.trim() || auth.session?.email || t('app.name'))
const displayCode = computed(() => auth.session?.code?.trim() || auth.session?.email || '—')
const initials = computed(() => personInitials(displayName.value))

const items = computed<MenuItem[]>(() => {
  const rows: MenuItem[] = [
    {
      label: t('auth.changePassword'),
      icon: 'pi pi-key',
      class: 'user-menu-item user-menu-item-change-password',
      command: openChangePassword,
    },
  ]
  if (compact) {
    rows.push({
      key: 'locale',
      class: 'user-menu-item user-menu-item-locale',
    })
  }
  rows.push(
    { separator: true },
    {
      label: t('auth.logout'),
      icon: 'pi pi-sign-out',
      class: 'user-menu-item user-menu-item-logout',
      disabled: !network.online,
      command: logout,
    },
  )
  return rows
})

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

async function performLogout() {
  logoutAfterSync.value = false
  await auth.logout()
  await router.replace({ name: 'login' })
}

async function onSyncFinished() {
  // Cancel / close without Continue — abort logout, stay logged in.
  if (logoutAfterSync.value) {
    logoutAfterSync.value = false
    return
  }
}

async function onReadyForLogout() {
  if (!logoutAfterSync.value) return
  const cycleId = auth.session?.cycleId
  const pending = await countPendingScanCommands(cycleId)
  if (pending > 0) {
    toast.add({
      severity: 'warn',
      summary: t('auth.logoutNeedSync'),
      life: 3500,
      closable: false,
    })
    return
  }
  await performLogout()
}

function logout() {
  if (!network.online) return
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
      const cycleId = auth.session?.cycleId
      const pending = await countPendingScanCommands(cycleId)
      if (pending <= 0) {
        await performLogout()
        return
      }
      logoutAfterSync.value = true
      await startSync(cycleId, { logoutGate: true })
      const left = await countPendingScanCommands(cycleId)
      if (left <= 0) {
        // Dialog stays open in finished + logoutGate; Continue / 5s handles logout.
        return
      }
      toast.add({
        severity: 'warn',
        summary: t('auth.logoutNeedSync'),
        life: 3500,
        closable: false,
      })
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
  <Menu ref="menu" class="user-menu" :model="items" popup>
    <template #item="{ item, props }">
      <div v-if="item.key === 'locale' || item.item?.key === 'locale'" class="user-menu-locale" @click.stop>
        <LocaleSelect />
      </div>
      <a v-else v-bind="props.action" :class="{ 'p-disabled': item.disabled || item.item?.disabled }"
        :aria-disabled="item.disabled || item.item?.disabled ? 'true' : undefined"
        @click="(item.disabled || item.item?.disabled) && $event.preventDefault()">
        <span v-if="item.icon || item.item?.icon" :class="item.icon || item.item?.icon" />
        <span>{{ item.label || item.item?.label }}</span>
      </a>
    </template>
  </Menu>
  <ChangePasswordDialog v-model:visible="passwordOpen" />
  <ScanCommandSyncDialog @finished="onSyncFinished" @ready-for-logout="onReadyForLogout" />
</template>
