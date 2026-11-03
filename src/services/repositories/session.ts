import { query, run } from '@/storage/database'
import type { Session } from '@/types'

const SESSION_KEY = 'session'

export const LOCAL_EMAIL = 'admin'
export const LOCAL_PASSWORD = 'admin'

export async function loadSession(): Promise<Session | null> {
  const rows = await query<{ value: string }>('SELECT value FROM settings WHERE key = ?', [SESSION_KEY])
  const raw = rows[0]?.value
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as Session
    if (!data?.email && !data?.factory && !data?.cycle) return null
    return { ...data, email: data.email ?? '' }
  } catch {
    return null
  }
}

export async function saveSession(session: Session): Promise<void> {
  await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [SESSION_KEY, JSON.stringify(session)])
}

export async function clearSession(): Promise<void> {
  await run('DELETE FROM settings WHERE key = ?', [SESSION_KEY])
}

export function sessionMatch(email: string, password: string): boolean {
  return email.trim() === LOCAL_EMAIL && password === LOCAL_PASSWORD
}
