import { Capacitor } from '@capacitor/core'
import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite'
import initSqlJs from 'sql.js/dist/sql-wasm.js'
import type { Database as SqlJsDatabase } from 'sql.js'
import { SCHEMA_STATEMENTS, SCHEMA_VERSION } from '@/storage/schema'
import { persistFlag, writeBinaryFile, readBinaryFile, fileExists } from '@/storage/files'
import { trError } from '@/i18n'

const DB_NAME = 'srcvip'
const WEB_DB_PATH = 'db/srcvip.db'

type BindValue = string | number | null

let nativeDb: SQLiteDBConnection | null = null
let webDb: SqlJsDatabase | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null
let ready = false

function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

async function persistWebDb(): Promise<void> {
  if (!webDb) return
  const bytes = webDb.export()
  await writeBinaryFile(WEB_DB_PATH, bytes)
}

function schedulePersist(): void {
  if (isNative() || !webDb) return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    void persistWebDb().catch(() => undefined)
  }, 250)
}

async function initNative(): Promise<void> {
  const sqlite = new SQLiteConnection(CapacitorSQLite)
  await sqlite.checkConnectionsConsistency()
  const connected = await sqlite.isConnection(DB_NAME, false)
  if (connected.result) {
    nativeDb = await sqlite.retrieveConnection(DB_NAME, false)
  } else {
    nativeDb = await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false)
    await nativeDb.open()
  }
  // Android execSQL cannot run PRAGMA statements that return rows.
  await nativeDb.query('PRAGMA journal_mode = WAL;')
  await nativeDb.query('PRAGMA synchronous = FULL;')
}

async function initWeb(): Promise<void> {
  await persistFlag()
  const factory =
    typeof initSqlJs === 'function'
      ? initSqlJs
      : (initSqlJs as unknown as { default: typeof initSqlJs }).default
  const SQL = await factory({
    locateFile: (file: string) => `/${file}`,
  })

  if (await fileExists(WEB_DB_PATH)) {
    const blob = await readBinaryFile(WEB_DB_PATH)
    const buffer = new Uint8Array(await blob.arrayBuffer())
    webDb = new SQL.Database(buffer)
  } else {
    webDb = new SQL.Database()
  }
}

async function ensureColumn(table: string, column: string, ddl: string): Promise<void> {
  const cols = await query<{ name: string }>(`PRAGMA table_info(${table})`)
  if (cols.some((c) => c.name === column)) return
  await execute(ddl)
}

async function migrateSchema(fromVersion: number): Promise<void> {
  if (fromVersion < 2) {
    await ensureColumn(
      'scan_logs',
      'direction',
      `ALTER TABLE scan_logs ADD COLUMN direction TEXT NOT NULL DEFAULT 'in'`,
    )
  }
}

async function applySchema(): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await execute(statement)
  }
  const rows = await query<{ version: number }>('SELECT version FROM schema_meta LIMIT 1')
  if (!rows.length) {
    await migrateSchema(0)
    await run('INSERT INTO schema_meta (version) VALUES (?)', [SCHEMA_VERSION])
    return
  }
  const current = Number(rows[0]?.version ?? 0)
  if (current < SCHEMA_VERSION) {
    await migrateSchema(current)
    await run('UPDATE schema_meta SET version = ?', [SCHEMA_VERSION])
  }
}

export async function initDatabase(): Promise<void> {
  if (ready) return
  if (isNative()) {
    await initNative()
  } else {
    await initWeb()
  }
  await applySchema()
  ready = true
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: BindValue[] = [],
): Promise<T[]> {
  if (isNative()) {
    if (!nativeDb) throw new Error(trError('sqliteNative'))
    const result = await nativeDb.query(sql, params)
    return (result.values ?? []) as T[]
  }
  if (!webDb) throw new Error(trError('sqliteWeb'))
  const stmt = webDb.prepare(sql)
  stmt.bind(params)
  const rows: T[] = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T)
  }
  stmt.free()
  return rows
}

export async function run(sql: string, params: BindValue[] = []): Promise<void> {
  if (isNative()) {
    if (!nativeDb) throw new Error(trError('sqliteNative'))
    await nativeDb.run(sql, params)
    return
  }
  if (!webDb) throw new Error(trError('sqliteWeb'))
  webDb.run(sql, params)
  schedulePersist()
}

export async function execute(sql: string): Promise<void> {
  if (isNative()) {
    if (!nativeDb) throw new Error(trError('sqliteNative'))
    await nativeDb.execute(sql)
    return
  }
  if (!webDb) throw new Error(trError('sqliteWeb'))
  webDb.exec(sql)
  schedulePersist()
}

export async function withTransaction(work: () => Promise<void>): Promise<void> {
  await execute('BEGIN')
  try {
    await work()
    await execute('COMMIT')
  } catch (error) {
    await execute('ROLLBACK')
    throw error
  }
}

export async function exportSqliteBytes(): Promise<Uint8Array> {
  if (isNative()) {
    if (!nativeDb) throw new Error(trError('sqliteNative'))
    const json = await nativeDb.exportToJson('full')
    const text = JSON.stringify(json.export || json)
    return new TextEncoder().encode(text)
  }
  if (!webDb) throw new Error(trError('sqliteWeb'))
  try {
    await persistWebDb()
  } catch {
    // still return in-memory export
  }
  return webDb.export()
}

export async function flushDatabase(): Promise<void> {
  if (isNative()) return
  try {
    await persistWebDb()
  } catch {
    // OPFS/IDB may be unavailable; in-memory + localStorage session still work
  }
}

export function isDatabaseReady(): boolean {
  return ready
}
