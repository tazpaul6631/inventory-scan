<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Button from '@/components/ui/AppButton.vue'
import LocaleSelect from '@/components/layout/LocaleSelect.vue'
import UserMenu from '@/components/layout/UserMenu.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import { useAuthStore } from '@/stores/auth'
import {
  detectDeviceShell,
  homePathForShell,
  isNative,
  pathMatchesShell,
  type DeviceShell,
} from '@/adapters/platform'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const open = ref(false)
const collapsed = ref(false)
const hoverOpen = ref(false)
const shell = ref<DeviceShell>(detectDeviceShell())
const platformIsNative = computed(isNative)
const appShell = computed(() => platformIsNative.value || shell.value === 'mobile')
const isDrawer = computed(() => shell.value !== 'web' || platformIsNative.value)
const webIconRail = computed(() => !isDrawer.value && collapsed.value)
const showBackdrop = computed(() => (isDrawer.value && open.value) || (webIconRail.value && hoverOpen.value))
const localeSelect = ref<{ hide?: () => void }>()
let hoverCloseTimer: ReturnType<typeof setTimeout> | null = null

function dismissChromePopups() {
  localeSelect.value?.hide?.()
}

function refreshShell() {
  shell.value = detectDeviceShell()
}

function clearHoverTimer() {
  if (!hoverCloseTimer) return
  clearTimeout(hoverCloseTimer)
  hoverCloseTimer = null
}

function canHoverExpand() {
  return webIconRail.value && window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

function closeSidebar() {
  open.value = false
  hoverOpen.value = false
  clearHoverTimer()
}

function toggleSidebar() {
  if (isDrawer.value) {
    open.value = !open.value
    return
  }
  hoverOpen.value = false
  collapsed.value = !collapsed.value
}

function onSidebarEnter() {
  if (!canHoverExpand()) return
  clearHoverTimer()
  dismissChromePopups()
  hoverOpen.value = true
}

function onSidebarLeave() {
  if (!canHoverExpand()) return
  clearHoverTimer()
  hoverCloseTimer = setTimeout(() => {
    hoverOpen.value = false
  }, 160)
}

function onBackdrop() {
  closeSidebar()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeSidebar()
}

onMounted(() => {
  refreshShell()
  window.addEventListener('resize', refreshShell)
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('resize', refreshShell)
  window.removeEventListener('keydown', onKeydown)
  clearHoverTimer()
})

watch(isDrawer, (drawer) => {
  if (drawer) closeSidebar()
})

watch(() => route.fullPath, () => {
  closeSidebar()
})

watch(appShell, () => {
  if (!auth.isLoggedIn) return
  if (!pathMatchesShell(route.path)) void router.replace(homePathForShell())
})

const navGroups = computed(() => {
  if (appShell.value) {
    return [
      {
        key: 'mobile',
        label: t('nav.app'),
        items: [
          { to: '/app/mobile/scan', icon: 'pi pi-qrcode', label: t('nav.mobileScan') },
          { to: '/app/mobile/history', icon: 'pi pi-list', label: t('nav.mobileHistory') },
        ],
      },
    ]
  }
  return [
    {
      key: 'web',
      label: t('nav.web'),
      items: [{ to: '/web/users', icon: 'pi pi-users', label: t('nav.users') }],
    },
  ]
})

const homeTo = computed(() => (appShell.value ? '/app/mobile/scan' : '/web/users'))

const title = computed(() =>
  navGroups.value.flatMap((group) => group.items).find((link) => link.to === route.path)?.label || t('app.name'),
)
</script>

<template>
  <div class="shell-wrap">
    <div class="sidebar-backdrop" :class="{ show: showBackdrop }" :aria-hidden="!showBackdrop" @click="onBackdrop" />
    <div class="shell" :class="{ drawer: isDrawer, collapsed: webIconRail, 'sidebar-hover': webIconRail && hoverOpen }">
      <div class="shell-body">
        <div v-if="webIconRail" class="sidebar-rail-spacer" aria-hidden="true" />
        <aside class="sidebar" :class="{ open, hover: webIconRail && hoverOpen }" @mouseenter="onSidebarEnter"
          @mouseleave="onSidebarLeave" @click.stop>
          <RouterLink :to="homeTo" class="brand brand-btn" :title="hoverOpen ? undefined : t('app.name')"
            @click="closeSidebar">
            <img class="brand-mark" src="/logo-icon.jpg" :alt="t('app.name')" />
            <div>
              <h1>{{ t('app.name') }}</h1>
              <!-- <p>{{ settings.current.companyName }}</p> -->
            </div>
          </RouterLink>
          <nav class="sidebar-nav">
            <div v-for="group in navGroups" :key="group.key" class="sidebar-nav-group">
              <div class="sidebar-nav-label">{{ group.label }}</div>
              <RouterLink v-for="link in group.items" :key="link.to" :to="link.to" class="nav-link"
                :title="hoverOpen ? undefined : link.label" @click="closeSidebar">
                <i :class="link.icon" />
                <span>{{ link.label }}</span>
              </RouterLink>
            </div>
          </nav>
          <div v-if="!open && !webIconRail" class="sidebar-brand-foot">
            <img class="sidebar-brand-foot-logo" src="/logo-company.png" :alt="t('app.name')" />
            <p class="sidebar-brand-foot-copy">{{ t('footer.copyright') }}</p>
          </div>
        </aside>
        <div class="main">
          <header class="topbar">
            <div class="flex min-w-0 items-center gap-2 text-cyan-700">
              <Button class="menu-btn" icon="pi pi-bars" :aria-label="t('nav.menu')" @click="toggleSidebar" />
              <strong class="min-w-0 truncate text-xl">{{ title }}</strong>
            </div>
            <div class="flex min-w-0 shrink items-center gap-2">
              <LocaleSelect ref="localeSelect" :compact="shell === 'mobile'" />
              <UserMenu ref="userMenu" :compact="shell === 'mobile'" />
            </div>
          </header>
          <section class="content">
            <RouterView />
          </section>
          <AppFooter />
        </div>
      </div>
    </div>
  </div>
</template>
