import { App } from '@capacitor/app'
import { isNative, isPublicWebUrl, publicWebOrigin } from '@/adapters/platform'

async function openInSystemBrowser(url: string): Promise<void> {
  try {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url })
    return
  } catch {
    // Plugin missing / unavailable — fall through.
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

function shouldOpenExternally(url: string): boolean {
  if (!isNative()) return false
  if (!publicWebOrigin()) return false
  return isPublicWebUrl(url)
}

/**
 * Native only: production web links open in the system browser (real web UI),
 * not inside the Capacitor WebView (which would show the app shell).
 */
export async function installExternalWebLinkGuard(): Promise<void> {
  if (!isNative()) return
  if (!publicWebOrigin()) return

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest('a')
      if (!anchor) return
      const href = anchor.href?.trim()
      if (!href || !shouldOpenExternally(href)) return
      event.preventDefault()
      event.stopPropagation()
      void openInSystemBrowser(href)
    },
    true,
  )

  // Deep link / intent that points at the public website → external browser.
  await App.addListener('appUrlOpen', ({ url }) => {
    if (!shouldOpenExternally(url)) return
    void openInSystemBrowser(url)
  })
}
