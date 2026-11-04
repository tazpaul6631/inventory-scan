import { flushDatabase, query, run } from '@/storage/database'
import type { Session } from '@/types'

const SESSION_KEY = 'session'
const LOCAL_STORAGE_KEY = 'inventory-scan.session'

export const LOCAL_EMAIL = 'admin'
export const LOCAL_PASSWORD = 'admin'

function isValidSession(data: Session | null | undefined): data is Session {
  if (!data) return false
  return Boolean(data.userId?.trim() || data.code?.trim() || data.email?.trim())
}

function parseSession(raw: string | null | undefined): Session | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as Session
    if (!isValidSession(data)) return null
    return { ...data, email: data.email ?? '' }
  } catch {
    return null
  }
}

function readLocalSession(): Session | null {
  try {
    return parseSession(localStorage.getItem(LOCAL_STORAGE_KEY))
  } catch {
    return null
  }
}

function writeLocalSession(session: Session): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(session))
  } catch {
    // ignore quota / private-mode failures; SQLite may still hold the session
  }
}

function clearLocalSession(): void {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY)
  } catch {
    // ignore
  }
}

async function readSqliteSession(): Promise<Session | null> {
  const rows = await query<{ value: string }>('SELECT value FROM settings WHERE key = ?', [SESSION_KEY])
  return parseSession(rows[0]?.value)
}

export async function loadSession(): Promise<Session | null> {
  const local = readLocalSession()
  if (local) {
    try {
      await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        SESSION_KEY,
        JSON.stringify(local),
      ])
      await flushDatabase()
    } catch {
      // localStorage is enough to keep the user logged in
    }
    return local
  }

  const sqlite = await readSqliteSession()
  if (sqlite) {
    writeLocalSession(sqlite)
    return sqlite
  }

  return null
}

export async function saveSession(session: Session): Promise<void> {
  writeLocalSession(session)
  try {
    await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
      SESSION_KEY,
      JSON.stringify(session),
    ])
    await flushDatabase()
  } catch {
    // localStorage is enough to keep the user logged in across reload
  }
}

export async function clearSession(): Promise<void> {
  clearLocalSession()
  try {
    await run('DELETE FROM settings WHERE key = ?', [SESSION_KEY])
    await flushDatabase()
  } catch {
    // local session already cleared
  }
}

export function sessionMatch(email: string, password: string): boolean {
  return email.trim() === LOCAL_EMAIL && password === LOCAL_PASSWORD
}
