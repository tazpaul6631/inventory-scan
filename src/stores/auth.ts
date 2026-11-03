import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import dayjs from 'dayjs'
import type { Session } from '@/types'
import type { ApiResponse, ViewValidateUser } from '@/types/api'
import { i18n } from '@/i18n'
import { userLogout, userValidate } from '@/services/api/user'
import {
  clearSession,
  loadSession,
  saveSession,
} from '@/services/repositories/session'

function vietnamLoginAt(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  const ms = String(date.getMilliseconds()).padStart(3, '0')
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}:${pick('second')}.${ms}+07:00`
}

function sessionFromUser(user: ViewValidateUser): Session | null {
  const userId = user.id?.trim()
  const code = user.code?.trim()
  if (!userId && !code) return null
  return {
    email: user.email?.trim() || code || userId || '',
    loggedInAt: Date.now(),
    userId: userId || undefined,
    code: code || undefined,
    name: user.name?.trim() || undefined,
    roleId: user.roleId,
    roleName: user.roleName ?? undefined,
    accessToken: user.accessToken ?? undefined,
    refreshToken: user.refreshToken ?? undefined,
  }
}

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const loaded = ref(false)
  const unauthorized = ref(false)
  const countdown = ref(3)
  const isLoggedIn = computed(() => Boolean(session.value?.userId || session.value?.code))

  async function load() {
    session.value = await loadSession()
    loaded.value = true
  }

  async function login(
    code: string,
    password: string,
    options?: { requireAllowWeb?: boolean },
  ): Promise<ApiResponse<ViewValidateUser>> {
    const t = i18n.global.t
    const res = await userValidate({
      code: code.trim(),
      password,
      loginAt: vietnamLoginAt(),
    })
    if (!res.success || !res.data) return res
    if (res.data.isActive === false) {
      return { ...res, success: false, message: t('auth.inactive') }
    }
    if (options?.requireAllowWeb && res.data.allowWeb === false) {
      return { ...res, success: false, message: t('auth.webNotAllowed') }
    }
    const next = sessionFromUser(res.data)
    if (!next) return { ...res, success: false, message: t('auth.invalid') }
    await saveSession(next)
    session.value = next
    unauthorized.value = false
    countdown.value = 3
    return res
  }

  function beginUnauthorized() {
    if (unauthorized.value || !session.value) return
    unauthorized.value = true
    countdown.value = 3
  }

  function cycleToIso(cycle: Date | string): string {
    if (cycle instanceof Date) return dayjs(cycle).format('YYYY-MM-DD')
    const trimmed = cycle.trim()
    const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed)
    if (dmy) {
      const [, day, month, year] = dmy
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }
    const parsed = dayjs(trimmed)
    return parsed.isValid() ? parsed.format('YYYY-MM-DD') : trimmed
  }

  async function setLoginSelection(
    factory: string,
    cycle: Date | string,
    factoryName?: string,
    factoryId?: number,
    abbr?: string,
    cycleId?: number,
  ) {
    const code = factory.trim()
    const name = factoryName?.trim()
    const short = abbr?.trim()
    const next: Session = {
      ...(session.value ?? { email: '', loggedInAt: Date.now() }),
      factory: code,
      factoryName: name || code || undefined,
      factoryId,
      abbr: short || undefined,
      cycle: cycleToIso(cycle),
      cycleId,
    }
    await saveSession(next)
    session.value = next
  }

  async function expireSession() {
    await clearSession()
    session.value = null
    unauthorized.value = false
    countdown.value = 3
  }

  async function logout() {
    const userId = session.value?.userId
    try {
      if (userId) await userLogout(userId)
    } catch {
      // still clear the local session
    }
    await expireSession()
  }

  return {
    session,
    loaded,
    unauthorized,
    countdown,
    isLoggedIn,
    load,
    login,
    setLoginSelection,
    logout,
    beginUnauthorized,
    expireSession,
  }
})
