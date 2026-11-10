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

export interface SqlSetItem {
  statement: string
  values: BindValue[]
}

let nativeDb: SQLiteDBConnection | null = null
let webDb: SqlJsDatabase | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null
let ready = false
/** >0 while inside withTransaction — native run/execute must disable auto-transaction. */
let txDepth = 0
/** >0 while inside withBulkWrite — temporary PRAGMA synchronous = NORMAL. */
let bulkDepth = 0

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

/** Idempotent — CREATE TABLE IF NOT EXISTS never adds columns to an existing table. */
async function ensureOfflineAssetScanProgressColumns(): Promise<void> {
  await ensureColumn(
    'offline_asset_scans',
    'local_scan_status',
    `ALTER TABLE offline_asset_scans ADD COLUMN local_scan_status TEXT`,
  )
  await ensureColumn(
    'offline_asset_scans',
    'local_scan_qty',
    `ALTER TABLE offline_asset_scans ADD COLUMN local_scan_qty REAL`,
  )
  await execute(
    `CREATE INDEX IF NOT EXISTS idx_offline_asset_scans_local_status ON offline_asset_scans(local_scan_status)`,
  )
}

async function migrateSchema(fromVersion: number): Promise<void> {
  if (fromVersion < 2) {
    await ensureColumn(
      'scan_logs',
      'direction',
      `ALTER TABLE scan_logs ADD COLUMN direction TEXT NOT NULL DEFAULT 'in'`,
    )
  }
  if (fromVersion < 4) {
    await ensureOfflineAssetScanProgressColumns()
  }
  if (fromVersion < 5) {
    await execute(
      `CREATE TABLE IF NOT EXISTS offline_scan_commands (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        scan_result TEXT,
        vat_no TEXT,
        cycle_id INTEGER,
        created_at INTEGER NOT NULL,
        synced INTEGER NOT NULL DEFAULT 0,
        sync_error TEXT
      )`,
    )
    await execute(
      `CREATE INDEX IF NOT EXISTS idx_offline_scan_commands_synced ON offline_scan_commands(synced, created_at)`,
    )
  }
}

async function applySchema(): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await execute(statement)
  }
  // Always ensure progress columns exist (handles DBs already at SCHEMA_VERSION).
  await ensureOfflineAssetScanProgressColumns()
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
    // Inside an explicit transaction, disable per-statement auto-commit.
    await nativeDb.run(sql, params, txDepth > 0 ? false : true)
    return
  }
  if (!webDb) throw new Error(trError('sqliteWeb'))
  webDb.run(sql, params)
  schedulePersist()
}

export async function execute(sql: string): Promise<void> {
  if (isNative()) {
    if (!nativeDb) throw new Error(trError('sqliteNative'))
    await nativeDb.execute(sql, txDepth > 0 ? false : true)
    return
  }
  if (!webDb) throw new Error(trError('sqliteWeb'))
  webDb.exec(sql)
  schedulePersist()
}

/** Batch statements in one native bridge call (huge win for APK bulk inserts). */
export async function executeSet(set: SqlSetItem[]): Promise<void> {
  if (!set.length) return
  if (isNative()) {
    if (!nativeDb) throw new Error(trError('sqliteNative'))
    await nativeDb.executeSet(set, txDepth > 0 ? false : true)
    return
  }
  if (!webDb) throw new Error(trError('sqliteWeb'))
  const apply = () => {
    for (const item of set) {
      webDb!.run(item.statement, item.values)
    }
  }
  if (txDepth > 0) {
    apply()
    schedulePersist()
    return
  }
  await withTransaction(async () => {
    apply()
  })
}

export async function withTransaction(work: () => Promise<void>): Promise<void> {
  const outer = txDepth === 0

  if (isNative()) {
    if (!nativeDb) throw new Error(trError('sqliteNative'))
    if (outer) await nativeDb.beginTransaction()
    txDepth += 1
    try {
      await work()
      if (outer) await nativeDb.commitTransaction()
    } catch (error) {
      if (outer) {
        try {
          const active = await nativeDb.isTransactionActive()
          if (active?.result) await nativeDb.rollbackTransaction()
        } catch {
          // Avoid masking the original error with "no current transaction".
        }
      }
      throw error
    } finally {
      txDepth = Math.max(0, txDepth - 1)
    }
    return
  }

  if (!webDb) throw new Error(trError('sqliteWeb'))
  if (outer) webDb.run('BEGIN')
  txDepth += 1
  try {
    await work()
    if (outer) {
      webDb.run('COMMIT')
      schedulePersist()
    }
  } catch (error) {
    if (outer) {
      try {
        webDb.run('ROLLBACK')
      } catch {
        // ignore
      }
      schedulePersist()
    }
    throw error
  } finally {
    txDepth = Math.max(0, txDepth - 1)
  }
}

/**
 * Relax fsync during large offline downloads on slow flash storage.
 * Nested calls share one NORMAL window; outer restores FULL.
 */
export async function withBulkWrite<T>(work: () => Promise<T>): Promise<T> {
  const outer = bulkDepth === 0
  bulkDepth += 1
  try {
    if (outer) {
      if (isNative()) {
        if (!nativeDb) throw new Error(trError('sqliteNative'))
        await nativeDb.query('PRAGMA synchronous = NORMAL;')
      } else if (webDb) {
        webDb.run('PRAGMA synchronous = NORMAL')
      }
    }
    return await work()
  } finally {
    if (outer) {
      try {
        if (isNative() && nativeDb) {
          await nativeDb.query('PRAGMA synchronous = FULL;')
        } else if (webDb) {
          webDb.run('PRAGMA synchronous = FULL')
        }
      } catch {
        // ignore restore failures
      }
    }
    bulkDepth = Math.max(0, bulkDepth - 1)
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
