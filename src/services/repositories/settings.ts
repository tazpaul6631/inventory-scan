import { isNative } from '@/adapters/platform'
import { query, run } from '@/storage/database'
import type { AppSettings } from '@/types'

const DEFAULTS: AppSettings = {
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  companyName: 'Inventory Scan',
  scaleBaudRate: 9600,
  bleServiceUuid: '',
  bleCharacteristicUuid: '',
  autoBackupMinutes: 0,
  locale: 'vi',
}

function isLoopbackApiUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0'
  } catch {
    return false
  }
}

/** On a device, localhost is the phone — never the PC that hosts the API. */
export function resolveApiUrl(stored?: string): string {
  const fallback = DEFAULTS.apiUrl
  const candidate = stored?.trim() || fallback
  if (isNative() && isLoopbackApiUrl(candidate)) return fallback
  return candidate
}

export async function loadSettings(): Promise<AppSettings> {
  const rows = await query<{ key: string; value: string }>('SELECT key, value FROM settings')
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]))
  const apiUrl = resolveApiUrl(map.apiUrl)
  if (map.apiUrl && apiUrl !== map.apiUrl) {
    await run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, ['apiUrl', apiUrl])
  }
  return {
    apiUrl,
    companyName: map.companyName || DEFAULTS.companyName,
    scaleBaudRate: Number(map.scaleBaudRate || DEFAULTS.scaleBaudRate),
    bleServiceUuid: map.bleServiceUuid || DEFAULTS.bleServiceUuid,
    bleCharacteristicUuid: map.bleCharacteristicUuid || DEFAULTS.bleCharacteristicUuid,
    autoBackupMinutes: map.autoBackupMinutes === undefined
      ? DEFAULTS.autoBackupMinutes
      : Number(map.autoBackupMinutes),
    locale: map.locale || DEFAULTS.locale,
  }
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const next: Partial<AppSettings> = { ...settings }
  if (next.apiUrl !== undefined) next.apiUrl = resolveApiUrl(next.apiUrl)
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) continue
    await run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [key, String(value)])
  }
}

export { DEFAULTS as defaultSettings }
