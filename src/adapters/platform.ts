import { Capacitor } from '@capacitor/core'

export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

export async function applyNativeChrome(): Promise<void> {
  if (!isNative()) return
  document.documentElement.classList.add('is-native')
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setOverlaysWebView({ overlay: true })
    await StatusBar.setBackgroundColor({ color: '#00000000' })
    await StatusBar.setStyle({ style: Style.Dark })
  } catch {
    // WebView / emulator may not support overlay.
  }
}

export function platformName(): string {
  return Capacitor.getPlatform()
}

export function hasWebSerial(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.serial)
}

export function hasWebNfc(): boolean {
  return typeof window !== 'undefined' && Boolean(window.NDEFReader)
}

export function hasGetUserMedia(): boolean {
  return Boolean(navigator.mediaDevices?.getUserMedia)
}

export type DeviceShell = 'web' | 'tablet' | 'mobile'

/** Build-time shell override: `web` | `mobile` (from VITE_APP_SHELL). */
export function forcedShell(): 'web' | 'mobile' | null {
  const value = String(import.meta.env.VITE_APP_SHELL ?? '')
    .trim()
    .toLowerCase()
  if (value === 'web' || value === 'mobile') return value
  return null
}

export function detectDeviceShell(): DeviceShell {
  const forced = forcedShell()
  if (forced === 'mobile') return 'mobile'
  if (forced === 'web') return 'web'

  const width = typeof window === 'undefined' ? 1280 : window.innerWidth
  if (width < 768) return 'mobile'
  if (width < 1024) return 'tablet'
  return 'web'
}

export function isAppShell(): boolean {
  const forced = forcedShell()
  if (forced === 'mobile') return true
  if (forced === 'web') return false
  return isNative() || detectDeviceShell() === 'mobile'
}

export function homePathForShell(): string {
  return isAppShell() ? '/app/mobile/scan' : '/web/users'
}

export function pathMatchesShell(path: string): boolean {
  if (isAppShell()) return path.startsWith('/app/mobile')
  return path.startsWith('/web')
}

/** Production website origin that must open outside the native WebView. */
export function publicWebOrigin(): string {
  return String(import.meta.env.VITE_PUBLIC_WEB_ORIGIN ?? '')
    .trim()
    .replace(/\/+$/, '')
}

export function isPublicWebUrl(url: string): boolean {
  const origin = publicWebOrigin()
  if (!origin) return false
  try {
    const target = new URL(url, typeof window !== 'undefined' ? window.location.href : origin)
    const allowed = new URL(origin)
    return target.origin === allowed.origin
  } catch {
    return false
  }
}
