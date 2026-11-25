import { executeSet, query, run, withTransaction } from '@/storage/database'
import { deleteDiskFile } from '@/storage/files'
import { isAssetCompletedByFlags } from '@/services/offline/classifyCorrectLocation'
import { listMediaByRecordId } from '@/services/repositories/media'
import type {
  AiScanResultCode,
  CreateAiScanResultRequest,
  ViewArea,
  ViewAssetInfoScanResult,
  ViewCycle,
  ViewFactory,
  ViewOrganization,
  ViewWarehouse,
} from '@/types/api'
import { createId, now } from '@/utils/id'

interface OfflineWarehouseRow {
  id: number
  factory_id: number | null
  name: string | null
  remark: string | null
  sno: number | null
}

interface OfflinePositionRow {
  id: number
  factory_id: number | null
  warehouse_id: number | null
  wposition: string | null
  remark: string | null
  sno: number | null
  reality_count: number | null
  scan_count: number | null
}

interface OfflineOrganizationRow {
  id: string
  code: string | null
  name: string | null
  factory_id: number | null
  status: number | null
}

interface OfflineAssetScanRow {
  id: string
  factory_id: number | null
  warehouse_id: number | null
  w_position_id: number | null
  w_position: string | null
  vat_no: string | null
  order_code: string | null
  material_name: string | null
  count: number | null
  cycle_id: number | null
  scan_result: string | null
  scan_at: string | null
  scan_by: string | null
  is_complete: number | null
  is_success: number | null
  is_warning: number | null
  is_error: number | null
  local_scan_status: string | null
  local_scan_qty: number | null
}

export type OfflineScanListFilter = 'all' | 'pending' | 'scanned'

export type OfflineLocalScanStatus =
  | 'pending'
  | 'success'
  | 'duplicate'
  | 'wrongFactory'
  | 'wrongWarehouse'
  | 'wrongOrganization'
  | 'wrongWposition'
  | 'notFound'

export interface OfflineAssetScanFilters {
  cycleId: number
  factoryId: number
  warehouseId?: number
  wPositionId?: number
  name?: string
  orderCode?: string
  listFilter?: OfflineScanListFilter
  limit?: number
  offset?: number
}

export interface OfflineAssetScanItem extends ViewAssetInfoScanResult {
  localScanStatus: OfflineLocalScanStatus
  localScanQty: number | null
}

function boolInt(value?: boolean | null) {
  if (value == null) return null
  return value ? 1 : 0
}

function dedupeById<T>(rows: T[], getId: (row: T) => string | number | null | undefined): T[] {
  const map = new Map<string, T>()
  for (const row of rows) {
    const raw = getId(row)
    if (raw == null) continue
    const id = String(raw).trim()
    if (!id) continue
    map.set(id, row)
  }
  return [...map.values()]
}

async function deleteByIds(table: string, ids: Array<string | number>): Promise<void> {
  if (!ids.length) return
  const chunkSize = 200
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const placeholders = chunk.map(() => '?').join(', ')
    await run(`DELETE FROM ${table} WHERE id IN (${placeholders})`, chunk)
  }
}

export async function replaceFactories(rows: ViewFactory[]): Promise<void> {
  const unique = dedupeById(rows, (row) => row.id)
  await withTransaction(async () => {
    await run('DELETE FROM offline_factories')
    for (const row of unique) {
      if (row.id == null) continue
      await run(
        `INSERT OR REPLACE INTO offline_factories (id, name, abbr, tenant_id, sno) VALUES (?, ?, ?, ?, ?)`,
        [
          row.id,
          row.name?.trim() || null,
          row.abbr?.trim() || null,
          row.tenantId?.trim() || null,
          row.sno ?? null,
        ],
      )
    }
  })
}

export async function replaceCycles(rows: ViewCycle[]): Promise<void> {
  const unique = dedupeById(rows, (row) => row.id)
  await withTransaction(async () => {
    await run('DELETE FROM offline_cycles')
    for (const row of unique) {
      if (row.id == null) continue
      await run(
        `INSERT OR REPLACE INTO offline_cycles (
          id, status, code, scan_date, description, created_at, created_by, updated_at, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.status ?? null,
          row.code?.trim() || null,
          row.scanDate?.trim() || null,
          row.description?.trim() || null,
          row.createdAt?.trim() || null,
          row.createdBy?.trim() || null,
          row.updatedAt?.trim() || null,
          row.updatedBy?.trim() || null,
        ],
      )
    }
  })
}

export async function replaceWarehouses(factoryId: number, rows: ViewWarehouse[]): Promise<void> {
  const unique = dedupeById(rows, (row) => row.id)
  const ids = unique.map((row) => row.id).filter((id): id is number => id != null)
  await withTransaction(async () => {
    await run('DELETE FROM offline_warehouses WHERE factory_id = ?', [factoryId])
    await deleteByIds('offline_warehouses', ids)
    await executeSet(
      unique
        .filter((row) => row.id != null)
        .map((row) => ({
          statement: `INSERT OR REPLACE INTO offline_warehouses (id, factory_id, name, remark, sno) VALUES (?, ?, ?, ?, ?)`,
          values: [
            row.id!,
            factoryId,
            row.name?.trim() || null,
            row.remark?.trim() || null,
            row.sno ?? null,
          ],
        })),
    )
  })
}

export async function replacePositions(factoryId: number, rows: ViewArea[]): Promise<void> {
  const unique = dedupeById(rows, (row) => row.id)
  const ids = unique.map((row) => row.id).filter((id): id is number => id != null)
  await withTransaction(async () => {
    await run('DELETE FROM offline_positions WHERE factory_id = ?', [factoryId])
    await deleteByIds('offline_positions', ids)
    await executeSet(
      unique
        .filter((row) => row.id != null)
        .map((row) => ({
          statement: `INSERT OR REPLACE INTO offline_positions (
            id, factory_id, warehouse_id, wposition, remark, sno, reality_count, scan_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          values: [
            row.id!,
            factoryId,
            row.warehouseId ?? null,
            row.wposition?.trim() || null,
            row.remark?.trim() || null,
            row.sno ?? null,
            row.realityCount ?? null,
            row.scanCount ?? null,
          ],
        })),
    )
  })
}

export async function replaceOrganizations(
  factoryId: number,
  rows: ViewOrganization[],
): Promise<void> {
  const unique = dedupeById(rows, (row) => row.id)
  const ids = unique
    .map((row) => (row.id == null ? '' : String(row.id).trim()))
    .filter(Boolean)
  await withTransaction(async () => {
    await run('DELETE FROM offline_organizations WHERE factory_id = ?', [factoryId])
    await deleteByIds('offline_organizations', ids)
    await executeSet(
      unique
        .map((row) => {
          const id = row.id == null ? '' : String(row.id).trim()
          if (!id) return null
          return {
            statement: `INSERT OR REPLACE INTO offline_organizations (id, code, name, factory_id, status) VALUES (?, ?, ?, ?, ?)`,
            values: [
              id,
              row.code?.trim() || null,
              row.name?.trim() || null,
              factoryId,
              row.status ?? null,
            ],
          }
        })
        .filter((item): item is NonNullable<typeof item> => item != null),
    )
  })
}

export async function listOfflineFactories(): Promise<ViewFactory[]> {
  const rows = await query<{
    id: number
    name: string | null
    abbr: string | null
    tenant_id: string | null
    sno: number | null
  }>(
    `SELECT id, name, abbr, tenant_id, sno
     FROM offline_factories
     ORDER BY name COLLATE NOCASE`,
  )
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    abbr: row.abbr,
    tenantId: row.tenant_id,
    sno: row.sno ?? undefined,
  }))
}

export async function getOfflineFactoryName(factoryId: number): Promise<string> {
  const rows = await query<{ name: string | null; abbr: string | null }>(
    `SELECT name, abbr FROM offline_factories WHERE id = ? LIMIT 1`,
    [factoryId],
  )
  const row = rows[0]
  if (!row) return String(factoryId)
  return row.name?.trim() || row.abbr?.trim() || String(factoryId)
}

export async function getOfflineFactoryTenantId(factoryId: number): Promise<string | null> {
  const rows = await query<{ tenant_id: string | null }>(
    `SELECT tenant_id FROM offline_factories WHERE id = ? LIMIT 1`,
    [factoryId],
  )
  const tenantId = rows[0]?.tenant_id?.trim()
  return tenantId || null
}

export async function getOfflineWarehouseName(
  warehouseId: number,
  factoryId?: number | null,
): Promise<string> {
  if (factoryId != null) {
    const rows = await query<{ name: string | null }>(
      `SELECT name FROM offline_warehouses WHERE id = ? AND factory_id = ? LIMIT 1`,
      [warehouseId, factoryId],
    )
    const name = rows[0]?.name?.trim()
    if (name) return name
  }
  const rows = await query<{ name: string | null }>(
    `SELECT name FROM offline_warehouses WHERE id = ? LIMIT 1`,
    [warehouseId],
  )
  return rows[0]?.name?.trim() || String(warehouseId)
}

export async function listOfflineWarehouses(factoryId: number): Promise<ViewWarehouse[]> {
  const rows = await query<OfflineWarehouseRow>(
    `SELECT id, factory_id, name, remark, sno
     FROM offline_warehouses
     WHERE factory_id = ?
     ORDER BY name COLLATE NOCASE`,
    [factoryId],
  )
  return rows.map((row) => ({
    id: row.id,
    factoryId: row.factory_id ?? factoryId,
    name: row.name,
    remark: row.remark,
    sno: row.sno ?? undefined,
  }))
}

export async function listOfflinePositions(
  factoryId: number,
  warehouseId: number,
): Promise<ViewArea[]> {
  const rows = await query<OfflinePositionRow>(
    `SELECT id, factory_id, warehouse_id, wposition, remark, sno, reality_count, scan_count
     FROM offline_positions
     WHERE factory_id = ? AND warehouse_id = ?
     ORDER BY wposition COLLATE NOCASE`,
    [factoryId, warehouseId],
  )
  return rows.map((row) => ({
    id: row.id,
    factoryId: row.factory_id ?? factoryId,
    warehouseId: row.warehouse_id ?? warehouseId,
    wposition: row.wposition,
    remark: row.remark,
    sno: row.sno ?? undefined,
    realityCount: row.reality_count,
    scanCount: row.scan_count,
  }))
}

/** Distinct scan positions for an org via order_code (name or org.code), scoped to cycle/warehouse. */
export async function listOfflinePositionsByOrganizationOrderCode(params: {
  cycleId: number
  factoryId: number
  warehouseId: number
  organizationName: string
}): Promise<Array<{ id: number; wposition: string }>> {
  const name = params.organizationName.trim()
  if (!name) return []
  const rows = await query<{ w_position_id: number | null; w_position: string | null }>(
    `SELECT DISTINCT w_position_id, w_position
     FROM offline_asset_scans
     WHERE cycle_id = ?
       AND factory_id = ?
       AND warehouse_id = ?
       AND w_position_id IS NOT NULL
       AND (
         order_code = ?
         OR order_code IN (
           SELECT code FROM offline_organizations
           WHERE factory_id = ? AND name = ? AND code IS NOT NULL AND TRIM(code) != ''
         )
       )
     ORDER BY w_position COLLATE NOCASE`,
    [
      params.cycleId,
      params.factoryId,
      params.warehouseId,
      name,
      params.factoryId,
      name,
    ],
  )
  return rows
    .map((row) => {
      const id = row.w_position_id
      const wposition = row.w_position?.trim() || ''
      if (id == null || !Number.isFinite(id) || !wposition) return null
      return { id, wposition }
    })
    .filter((row): row is { id: number; wposition: string } => row != null)
}

/** Distinct orgs whose name or code matches an asset order_code at this position. */
export async function listOfflineOrganizationsByPosition(params: {
  cycleId: number
  factoryId: number
  warehouseId: number
  wPositionId: number
}): Promise<ViewOrganization[]> {
  if (!Number.isFinite(params.wPositionId)) return []
  const rows = await query<OfflineOrganizationRow>(
    `SELECT DISTINCT o.id, o.code, o.name, o.factory_id, o.status
     FROM offline_organizations o
     WHERE o.factory_id = ?
       AND (
         (
           o.name IS NOT NULL AND TRIM(o.name) != ''
           AND o.name IN (
             SELECT order_code FROM offline_asset_scans
             WHERE cycle_id = ? AND factory_id = ? AND warehouse_id = ? AND w_position_id = ?
               AND order_code IS NOT NULL AND TRIM(order_code) != ''
           )
         )
         OR (
           o.code IS NOT NULL AND TRIM(o.code) != ''
           AND o.code IN (
             SELECT order_code FROM offline_asset_scans
             WHERE cycle_id = ? AND factory_id = ? AND warehouse_id = ? AND w_position_id = ?
               AND order_code IS NOT NULL AND TRIM(order_code) != ''
           )
         )
       )
     ORDER BY o.name COLLATE NOCASE, o.code COLLATE NOCASE`,
    [
      params.factoryId,
      params.cycleId,
      params.factoryId,
      params.warehouseId,
      params.wPositionId,
      params.cycleId,
      params.factoryId,
      params.warehouseId,
      params.wPositionId,
    ],
  )
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    factoryId: row.factory_id ?? params.factoryId,
    status: row.status ?? undefined,
  }))
}

export async function listOfflineOrganizations(factoryId: number): Promise<ViewOrganization[]> {
  const rows = await query<OfflineOrganizationRow>(
    `SELECT id, code, name, factory_id, status
     FROM offline_organizations
     WHERE factory_id = ?
     ORDER BY name COLLATE NOCASE, code COLLATE NOCASE`,
    [factoryId],
  )
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    factoryId: row.factory_id ?? factoryId,
    status: row.status ?? undefined,
  }))
}

/** Row counts as scanned when local status or API flags say so. */
/** Include legacy 'multiItems' so old rows still count scanned; normalize maps → wrongWposition. */
const SQL_ASSET_SCANNED = `(
  local_scan_status IN ('success', 'duplicate', 'wrongFactory', 'wrongWarehouse', 'wrongOrganization', 'wrongWposition', 'multiItems')
  OR IFNULL(is_error, 0) = 1
  OR IFNULL(is_warning, 0) = 1
  OR (IFNULL(is_complete, 0) = 1 AND IFNULL(is_success, 0) = 1)
)`

const SQL_ASSET_PENDING = `(NOT ${SQL_ASSET_SCANNED})`

function buildAssetScanWhere(params: OfflineAssetScanFilters): {
  where: string[]
  binds: Array<string | number>
} {
  const where: string[] = ['cycle_id = ?', 'factory_id = ?']
  const binds: Array<string | number> = [params.cycleId, params.factoryId]

  if (params.warehouseId != null) {
    where.push('warehouse_id = ?')
    binds.push(params.warehouseId)
  }
  if (params.wPositionId != null) {
    where.push('w_position_id = ?')
    binds.push(params.wPositionId)
  }
  if (params.name) {
    where.push(`(
      order_code = ?
      OR order_code IN (
        SELECT code FROM offline_organizations
        WHERE factory_id = ? AND name = ? AND code IS NOT NULL AND TRIM(code) != ''
      )
    )`)
    binds.push(params.name, params.factoryId, params.name)
  } else if (params.orderCode) {
    where.push('order_code = ?')
    binds.push(params.orderCode)
  }

  const listFilter = params.listFilter ?? 'all'
  if (listFilter === 'pending') {
    where.push(`(${SQL_ASSET_PENDING})`)
  } else if (listFilter === 'scanned') {
    where.push(`(${SQL_ASSET_SCANNED})`)
  }

  return { where, binds }
}

/** Priority: isError > isWarning > isComplete+isSuccess. Null = no flag signal. */
export function statusFromScanFlags(item: {
  isComplete?: boolean | null
  isSuccess?: boolean | null
  isWarning?: boolean | null
  isError?: boolean | null
}): OfflineLocalScanStatus | null {
  if (item.isError) return 'wrongWposition'
  if (item.isWarning) return 'duplicate'
  if (item.isComplete && item.isSuccess) return 'success'
  return null
}

function normalizeLocalScanStatus(raw: string | null | undefined): OfflineLocalScanStatus {
  const value = raw?.trim() || 'pending'
  if (value === 'multiItems') return 'wrongWposition'
  if (
    value === 'success' ||
    value === 'duplicate' ||
    value === 'wrongFactory' ||
    value === 'wrongWarehouse' ||
    value === 'wrongOrganization' ||
    value === 'wrongWposition' ||
    value === 'notFound'
  ) {
    return value
  }
  return 'pending'
}

function mapAssetScanRow(row: OfflineAssetScanRow, cycleId: number): OfflineAssetScanItem {
  const isComplete = row.is_complete == null ? undefined : row.is_complete === 1
  const isSuccess = row.is_success == null ? undefined : row.is_success === 1
  const isWarning = row.is_warning == null ? undefined : row.is_warning === 1
  const isError = row.is_error == null ? undefined : row.is_error === 1
  const localScanStatus =
    statusFromScanFlags({ isComplete, isSuccess, isWarning, isError }) ??
    normalizeLocalScanStatus(row.local_scan_status)

  return {
    id: row.id,
    factoryId: row.factory_id ?? undefined,
    warehouseId: row.warehouse_id ?? undefined,
    wPositionId: row.w_position_id ?? undefined,
    wPosition: row.w_position,
    vatNo: row.vat_no,
    orderCode: row.order_code,
    materialName: row.material_name,
    count: row.count ?? undefined,
    cycleId: row.cycle_id ?? cycleId,
    scanResult: row.scan_result,
    scanCount: row.local_scan_qty,
    scanAt: row.scan_at,
    scanBy: row.scan_by,
    isComplete,
    isSuccess,
    isWarning,
    isError,
    localScanStatus,
    localScanQty: row.local_scan_qty,
  }
}

export async function listOfflineAssetScans(
  params: OfflineAssetScanFilters,
): Promise<{ items: OfflineAssetScanItem[]; totalCount: number }> {
  const { where, binds } = buildAssetScanWhere(params)
  const whereSql = where.join(' AND ')

  const countRows = await query<{ c: number }>(
    `SELECT COUNT(*) as c FROM offline_asset_scans WHERE ${whereSql}`,
    binds,
  )
  const totalCount = Number(countRows[0]?.c ?? 0)

  const limit = params.limit
  const offset = params.offset ?? 0
  const pageBinds = [...binds]
  let pageSql = `SELECT id, factory_id, warehouse_id, w_position_id, w_position, vat_no, order_code,
            material_name, count, cycle_id, scan_result, scan_at, scan_by,
            is_complete, is_success, is_warning, is_error, local_scan_status, local_scan_qty
     FROM offline_asset_scans
     WHERE ${whereSql}
     ORDER BY vat_no COLLATE NOCASE`
  if (limit != null && limit > 0) {
    pageSql += ` LIMIT ? OFFSET ?`
    pageBinds.push(limit, offset)
  }

  const rows = await query<OfflineAssetScanRow>(pageSql, pageBinds)
  return {
    items: rows.map((row) => mapAssetScanRow(row, params.cycleId)),
    totalCount,
  }
}

export async function countOfflineAssetScans(params: OfflineAssetScanFilters): Promise<{
  total: number
  pending: number
  scanned: number
}> {
  const base = { ...params, listFilter: 'all' as const, limit: undefined, offset: undefined }
  const { where, binds } = buildAssetScanWhere(base)
  const whereSql = where.join(' AND ')

  const rows = await query<{ total: number; pending: number; scanned: number }>(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN ${SQL_ASSET_PENDING} THEN 1 ELSE 0 END) as pending,
       SUM(CASE WHEN ${SQL_ASSET_SCANNED} THEN 1 ELSE 0 END) as scanned
     FROM offline_asset_scans
     WHERE ${whereSql}`,
    binds,
  )
  return {
    total: Number(rows[0]?.total ?? 0),
    pending: Number(rows[0]?.pending ?? 0),
    scanned: Number(rows[0]?.scanned ?? 0),
  }
}

export interface OfflineUnknownScanCode {
  vatNo: string
  scanCount: number
  lastAt: string | null
  /** True when any NotFound command for this vatNo has scan_evidence media. */
  hasPhoto: boolean
}

export interface OfflineUnknownScanFilters {
  cycleId: number
  factoryId: number
  warehouseId: number
  wPositionId?: number
  /** Selected organization name (stored as orderCode on NotFound payload). */
  orderCode?: string
}

function buildUnknownScanWhere(
  params: OfflineUnknownScanFilters,
  tableAlias = '',
): {
  where: string[]
  binds: Array<string | number>
} {
  const col = (name: string) => (tableAlias ? `${tableAlias}.${name}` : name)
  const where: string[] = [
    `${col('cycle_id')} = ?`,
    `${col('scan_result')} = 'NotFound'`,
    `${col('synced')} = 0`,
    `${col('vat_no')} IS NOT NULL AND TRIM(${col('vat_no')}) != ''`,
    `CAST(json_extract(${col('payload')}, '$.factoryId') AS INTEGER) = ?`,
    `CAST(json_extract(${col('payload')}, '$.warehouseId') AS INTEGER) = ?`,
  ]
  const binds: Array<string | number> = [params.cycleId, params.factoryId, params.warehouseId]

  if (params.wPositionId != null) {
    where.push(`CAST(json_extract(${col('payload')}, '$.wPositionId') AS INTEGER) = ?`)
    binds.push(params.wPositionId)
  }
  if (params.orderCode?.trim()) {
    where.push(`TRIM(COALESCE(json_extract(${col('payload')}, '$.orderCode'), '')) = ?`)
    binds.push(params.orderCode.trim())
  }
  return { where, binds }
}

/** Count distinct NotFound vatNo codes for the selected location. */
export async function countOfflineUnknownScanCodes(
  params: OfflineUnknownScanFilters,
): Promise<number> {
  const { where, binds } = buildUnknownScanWhere(params)
  const rows = await query<{ c: number }>(
    `SELECT COUNT(DISTINCT vat_no) as c
     FROM offline_scan_commands
     WHERE ${where.join(' AND ')}`,
    binds,
  )
  return Number(rows[0]?.c ?? 0)
}

/** Distinct NotFound vatNo codes for the selected factory/warehouse/(position|org). */
export async function listOfflineUnknownScanCodes(
  params: OfflineUnknownScanFilters,
  limit = 200,
): Promise<OfflineUnknownScanCode[]> {
  const { where, binds } = buildUnknownScanWhere(params, 'c')
  const pageBinds = [...binds, limit]
  const rows = await query<{
    vat_no: string | null
    scan_count: number
    last_at: string | null
    has_photo: number | null
  }>(
    `SELECT c.vat_no,
            COUNT(*) as scan_count,
            MAX(c.created_at) as last_at,
            MAX(CASE WHEN m.id IS NOT NULL THEN 1 ELSE 0 END) as has_photo
     FROM offline_scan_commands c
     LEFT JOIN media m
       ON m.record_id = c.id AND m.kind = 'scan_evidence'
     WHERE ${where.join(' AND ')}
     GROUP BY c.vat_no
     ORDER BY last_at DESC
     LIMIT ?`,
    pageBinds,
  )
  return rows
    .map((row) => ({
      vatNo: row.vat_no?.trim() || '',
      scanCount: Number(row.scan_count ?? 0),
      lastAt: row.last_at != null ? String(row.last_at) : null,
      hasPhoto: Number(row.has_photo ?? 0) > 0,
    }))
    .filter((row) => Boolean(row.vatNo))
}

export async function getOfflineAssetScansByVatNo(
  params: OfflineAssetScanFilters,
  vatNo: string,
): Promise<OfflineAssetScanItem[]> {
  const code = vatNo.trim()
  if (!code) return []
  const { where, binds } = buildAssetScanWhere({ ...params, listFilter: 'all' })
  where.push('vat_no = ?')
  binds.push(code)

  const rows = await query<OfflineAssetScanRow>(
    `SELECT id, factory_id, warehouse_id, w_position_id, w_position, vat_no, order_code,
            material_name, count, cycle_id, scan_result, scan_at, scan_by,
            is_complete, is_success, is_warning, is_error, local_scan_status, local_scan_qty
     FROM offline_asset_scans
     WHERE ${where.join(' AND ')}
     ORDER BY vat_no COLLATE NOCASE`,
    binds,
  )
  return rows.map((row) => mapAssetScanRow(row, params.cycleId))
}

/** Scan lookup: cycle + vatNo only (no factory/warehouse/position/org lock). */
export async function lookupOfflineAssetScansByVatNo(
  cycleId: number,
  vatNo: string,
): Promise<OfflineAssetScanItem[]> {
  const code = vatNo.trim()
  if (!code) return []
  const rows = await query<OfflineAssetScanRow>(
    `SELECT id, factory_id, warehouse_id, w_position_id, w_position, vat_no, order_code,
            material_name, count, cycle_id, scan_result, scan_at, scan_by,
            is_complete, is_success, is_warning, is_error, local_scan_status, local_scan_qty
     FROM offline_asset_scans
     WHERE cycle_id = ? AND vat_no = ?
     ORDER BY vat_no COLLATE NOCASE`,
    [cycleId, code],
  )
  return rows.map((row) => mapAssetScanRow(row, cycleId))
}

/** Wrong-position pick list: cycle + vatNo + login factory. */
export async function lookupOfflineAssetScansByVatNoFactory(
  cycleId: number,
  vatNo: string,
  factoryId: number,
): Promise<OfflineAssetScanItem[]> {
  const code = vatNo.trim()
  if (!code || !Number.isFinite(factoryId)) return []
  const rows = await query<OfflineAssetScanRow>(
    `SELECT id, factory_id, warehouse_id, w_position_id, w_position, vat_no, order_code,
            material_name, count, cycle_id, scan_result, scan_at, scan_by,
            is_complete, is_success, is_warning, is_error, local_scan_status, local_scan_qty
     FROM offline_asset_scans
     WHERE cycle_id = ? AND vat_no = ? AND factory_id = ?
     ORDER BY warehouse_id, w_position COLLATE NOCASE, order_code COLLATE NOCASE`,
    [cycleId, code, factoryId],
  )
  return rows.map((row) => mapAssetScanRow(row, cycleId))
}

export async function organizationOwnsOrderCode(
  factoryId: number,
  organizationName: string,
  orderCode: string | null | undefined,
): Promise<boolean> {
  const code = orderCode?.trim()
  const name = organizationName.trim()
  if (!code || !name) return false
  if (code === name) return true
  const rows = await query<{ c: number }>(
    `SELECT COUNT(*) as c FROM offline_organizations
     WHERE factory_id = ? AND name = ? AND code = ?`,
    [factoryId, name, code],
  )
  return Number(rows[0]?.c ?? 0) > 0
}

export type OfflineScanCommandPayload = CreateAiScanResultRequest

export async function enqueueScanCommand(payload: OfflineScanCommandPayload): Promise<string> {
  const id = createId()
  await run(
    `INSERT INTO offline_scan_commands (
      id, payload, scan_result, vat_no, cycle_id, created_at, synced, sync_error
    ) VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
    [
      id,
      JSON.stringify(payload),
      payload.scanResult?.trim() || null,
      payload.vatNo?.trim() || null,
      payload.cycleId ?? null,
      now(),
    ],
  )
  return id
}

/** Update queued command JSON + denormalized scan_result/vat_no (e.g. Success → Exist before sync). */
export async function updatePendingScanCommandPayload(
  id: string,
  payload: OfflineScanCommandPayload,
): Promise<void> {
  const commandId = id.trim()
  if (!commandId) return
  await run(
    `UPDATE offline_scan_commands
     SET payload = ?, scan_result = ?, vat_no = ?, cycle_id = ?
     WHERE id = ? AND synced = 0`,
    [
      JSON.stringify(payload),
      payload.scanResult?.trim() || null,
      payload.vatNo?.trim() || null,
      payload.cycleId ?? null,
      commandId,
    ],
  )
}

export interface PendingScanCommand {
  id: string
  payload: OfflineScanCommandPayload
  syncError: string | null
}

function parseScanCommandPayload(raw: string): OfflineScanCommandPayload | null {
  try {
    const parsed = JSON.parse(raw) as OfflineScanCommandPayload
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.factoryId !== 'number' || typeof parsed.cycleId !== 'number') return null
    if (typeof parsed.scanBy !== 'string' || typeof parsed.count !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

export async function countPendingScanCommands(cycleId?: number): Promise<number> {
  if (cycleId != null) {
    const rows = await query<{ c: number }>(
      `SELECT COUNT(*) as c FROM offline_scan_commands
       WHERE synced = 0
         AND IFNULL(scan_result, '') != 'NotFound'
         AND cycle_id = ?`,
      [cycleId],
    )
    return Number(rows[0]?.c ?? 0)
  }
  const rows = await query<{ c: number }>(
    `SELECT COUNT(*) as c FROM offline_scan_commands
     WHERE synced = 0
       AND IFNULL(scan_result, '') != 'NotFound'`,
  )
  return Number(rows[0]?.c ?? 0)
}

export async function listPendingScanCommands(
  cycleId?: number,
  limit = 50,
): Promise<PendingScanCommand[]> {
  const pageSize = limit > 0 ? limit : 50
  const rows =
    cycleId != null
      ? await query<{ id: string; payload: string; sync_error: string | null }>(
        `SELECT id, payload, sync_error FROM offline_scan_commands
           WHERE synced = 0
             AND IFNULL(scan_result, '') != 'NotFound'
             AND cycle_id = ?
           ORDER BY created_at ASC
           LIMIT ?`,
        [cycleId, pageSize],
      )
      : await query<{ id: string; payload: string; sync_error: string | null }>(
        `SELECT id, payload, sync_error FROM offline_scan_commands
           WHERE synced = 0
             AND IFNULL(scan_result, '') != 'NotFound'
           ORDER BY created_at ASC
           LIMIT ?`,
        [pageSize],
      )

  const items: PendingScanCommand[] = []
  for (const row of rows) {
    const payload = parseScanCommandPayload(row.payload)
    if (!payload) continue
    items.push({
      id: row.id,
      payload,
      syncError: row.sync_error,
    })
  }
  return items
}

export async function markScanCommandSynced(id: string): Promise<void> {
  await run(
    `UPDATE offline_scan_commands SET synced = 1, sync_error = NULL WHERE id = ?`,
    [id],
  )
}

export async function markScanCommandError(id: string, error: string): Promise<void> {
  await run(`UPDATE offline_scan_commands SET synced = 0, sync_error = ? WHERE id = ?`, [
    error.slice(0, 500),
    id,
  ])
}

/** Delete scan commands and their evidence media/files (after successful aisfl upload). */
export async function deleteScanCommandsWithMedia(ids: string[]): Promise<void> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  if (!unique.length) return
  for (const id of unique) {
    const mediaRows = await listMediaByRecordId(id)
    for (const row of mediaRows) {
      try {
        await deleteDiskFile(row.path)
      } catch {
        // ignore missing file
      }
      await run(`DELETE FROM media WHERE id = ?`, [row.id])
    }
    await run(`DELETE FROM offline_scan_commands WHERE id = ?`, [id])
  }
}

/**
 * After clean logout (no pending sync): wipe catalog, scan commands, media/files,
 * and unused legacy tables. Keeps `settings` + `schema_meta` so schema stays ready.
 */
export async function clearOfflineStoreAfterLogout(): Promise<void> {
  const mediaRows = await query<{ path: string | null }>(`SELECT path FROM media`)
  for (const row of mediaRows) {
    const path = row.path?.trim()
    if (!path) continue
    try {
      await deleteDiskFile(path)
    } catch {
      // ignore missing file
    }
  }
  await withTransaction(async () => {
    await run('DELETE FROM offline_asset_scans')
    await run('DELETE FROM offline_factories')
    await run('DELETE FROM offline_cycles')
    await run('DELETE FROM offline_warehouses')
    await run('DELETE FROM offline_positions')
    await run('DELETE FROM offline_organizations')
    await run('DELETE FROM offline_scan_commands')
    await run('DELETE FROM media')
    await run('DELETE FROM products')
    await run('DELETE FROM outbox')
    await run('DELETE FROM scan_logs')
    await run('DELETE FROM scale_readings')
  })
}

export interface PendingScanFailLog {
  id: string
  vatNo: string
  cycleId: number
  createdAt: string
  createdBy: string
  syncError: string | null
}

/** Pending NotFound rows for /sync/sc/syncaisfl. */
export async function countPendingScanFailLogs(cycleId?: number): Promise<number> {
  if (cycleId != null) {
    const rows = await query<{ c: number }>(
      `SELECT COUNT(*) as c FROM offline_scan_commands
       WHERE synced = 0
         AND IFNULL(scan_result, '') = 'NotFound'
         AND cycle_id = ?`,
      [cycleId],
    )
    return Number(rows[0]?.c ?? 0)
  }
  const rows = await query<{ c: number }>(
    `SELECT COUNT(*) as c FROM offline_scan_commands
     WHERE synced = 0
       AND IFNULL(scan_result, '') = 'NotFound'`,
  )
  return Number(rows[0]?.c ?? 0)
}

export async function listPendingScanFailLogs(
  cycleId?: number,
  limit = 50,
): Promise<PendingScanFailLog[]> {
  const pageSize = limit > 0 ? limit : 50
  const rows =
    cycleId != null
      ? await query<{ id: string; payload: string; sync_error: string | null; created_at: number }>(
        `SELECT id, payload, sync_error, created_at FROM offline_scan_commands
           WHERE synced = 0
             AND IFNULL(scan_result, '') = 'NotFound'
             AND cycle_id = ?
           ORDER BY created_at ASC
           LIMIT ?`,
        [cycleId, pageSize],
      )
      : await query<{ id: string; payload: string; sync_error: string | null; created_at: number }>(
        `SELECT id, payload, sync_error, created_at FROM offline_scan_commands
           WHERE synced = 0
             AND IFNULL(scan_result, '') = 'NotFound'
           ORDER BY created_at ASC
           LIMIT ?`,
        [pageSize],
      )

  const items: PendingScanFailLog[] = []
  for (const row of rows) {
    const payload = parseScanCommandPayload(row.payload)
    const vatNo = payload?.vatNo?.trim() || ''
    const cycle = payload?.cycleId
    const createdBy = payload?.scanBy?.trim() || ''
    if (!vatNo || cycle == null || !createdBy) continue
    items.push({
      id: row.id,
      vatNo,
      cycleId: cycle,
      createdAt: payload?.scanAt?.trim() || new Date(row.created_at).toISOString(),
      createdBy,
      syncError: row.sync_error,
    })
  }
  return items
}

/** Badge / logout: pending aisr + aisfl. */
export async function countAllPendingSyncItems(cycleId?: number): Promise<number> {
  const [aisr, aisfl] = await Promise.all([
    countPendingScanCommands(cycleId),
    countPendingScanFailLogs(cycleId),
  ])
  return aisr + aisfl
}

export function localStatusFromScanResult(scanResult: AiScanResultCode): OfflineLocalScanStatus {
  if (scanResult === 'Success' || scanResult === 'Ok') return 'success'
  if (scanResult === 'Exist' || scanResult === 'Duplicate') return 'duplicate'
  if (scanResult === 'NotFound') return 'notFound'
  if (scanResult === 'WrongWposition') return 'wrongWposition'
  // Legacy API codes — client classify no longer emits these; fold into wrongWposition.
  if (
    scanResult === 'WrongFactory' ||
    scanResult === 'WrongWarehouse' ||
    scanResult === 'WrongOrganization' ||
    scanResult === 'MultiItems'
  ) {
    return 'wrongWposition'
  }
  return 'pending'
}

function flagsFromLocalStatus(status: OfflineLocalScanStatus): {
  isComplete: boolean
  isSuccess: boolean
  isWarning: boolean
  isError: boolean
} {
  if (
    status === 'wrongWposition' ||
    status === 'wrongFactory' ||
    status === 'wrongWarehouse' ||
    status === 'wrongOrganization'
  ) {
    return { isComplete: true, isSuccess: false, isWarning: false, isError: true }
  }
  if (status === 'duplicate') {
    return { isComplete: true, isSuccess: false, isWarning: true, isError: false }
  }
  if (status === 'success') {
    return { isComplete: true, isSuccess: true, isWarning: false, isError: false }
  }
  return { isComplete: false, isSuccess: false, isWarning: false, isError: false }
}

/** Local progress that must survive pre-classify vatNo refresh (server may still be incomplete). */
function isLocalScannedStatus(status: OfflineLocalScanStatus): boolean {
  return (
    status === 'success' ||
    status === 'duplicate' ||
    status === 'wrongWposition' ||
    status === 'wrongFactory' ||
    status === 'wrongWarehouse' ||
    status === 'wrongOrganization'
  )
}

/**
 * Merge new scan flags. Success / duplicate replace error so recover-at-correct-location
 * can clear isError (OR-merge would keep Wrong forever).
 */
export function mergeScanFlags(
  existing: {
    isComplete?: boolean | null
    isSuccess?: boolean | null
    isWarning?: boolean | null
    isError?: boolean | null
  },
  status: OfflineLocalScanStatus,
) {
  const next = flagsFromLocalStatus(status)
  if (status === 'success') {
    return { isComplete: true, isSuccess: true, isWarning: false, isError: false }
  }
  if (status === 'duplicate') {
    return { isComplete: true, isSuccess: false, isWarning: true, isError: false }
  }
  const isError = Boolean(existing.isError) || next.isError
  const isWarning = Boolean(existing.isWarning) || next.isWarning
  const isSuccess = Boolean(existing.isSuccess) || next.isSuccess
  const isComplete =
    Boolean(existing.isComplete) || next.isComplete || isError || isWarning || isSuccess
  return { isComplete, isSuccess, isWarning, isError }
}

export function resolveLocalScanStatus(
  existing: {
    isComplete?: boolean | null
    isSuccess?: boolean | null
    isWarning?: boolean | null
    isError?: boolean | null
  },
  status: OfflineLocalScanStatus,
): OfflineLocalScanStatus {
  return statusFromScanFlags(mergeScanFlags(existing, status)) ?? normalizeLocalScanStatus(status)
}

export async function updateOfflineAssetScanProgress(
  ids: string[],
  status: OfflineLocalScanStatus,
  qty: number | null,
  options?: { scanBy?: string | null },
): Promise<void> {
  if (!ids.length) return
  const scanBy =
    status === 'success' || status === 'duplicate' ? options?.scanBy?.trim() || '' : ''
  await withTransaction(async () => {
    for (const id of ids) {
      const rows = await query<{
        is_complete: number | null
        is_success: number | null
        is_warning: number | null
        is_error: number | null
      }>(
        `SELECT is_complete, is_success, is_warning, is_error
         FROM offline_asset_scans WHERE id = ? LIMIT 1`,
        [id],
      )
      const row = rows[0]
      const existing = {
        isComplete: row?.is_complete === 1,
        isSuccess: row?.is_success === 1,
        isWarning: row?.is_warning === 1,
        isError: row?.is_error === 1,
      }
      const merged = mergeScanFlags(existing, status)
      const effective = resolveLocalScanStatus(existing, status)
      if (scanBy) {
        await run(
          `UPDATE offline_asset_scans
           SET local_scan_status = ?, local_scan_qty = ?,
               is_complete = ?, is_success = ?, is_warning = ?, is_error = ?,
               scan_by = ?
           WHERE id = ?`,
          [
            effective,
            qty,
            boolInt(merged.isComplete),
            boolInt(merged.isSuccess),
            boolInt(merged.isWarning),
            boolInt(merged.isError),
            scanBy,
            id,
          ],
        )
      } else {
        await run(
          `UPDATE offline_asset_scans
           SET local_scan_status = ?, local_scan_qty = ?,
               is_complete = ?, is_success = ?, is_warning = ?, is_error = ?
           WHERE id = ?`,
          [
            effective,
            qty,
            boolInt(merged.isComplete),
            boolInt(merged.isSuccess),
            boolInt(merged.isWarning),
            boolInt(merged.isError),
            id,
          ],
        )
      }
    }
  })
}

/** Wipe all asset-scan rows once before paging replace (PK `id` is global). */
export async function clearAllAssetScans(): Promise<void> {
  await run('DELETE FROM offline_asset_scans')
}

/** Upsert — caller should clearAllAssetScans first; OR REPLACE covers page overlap / retry. */
const APPEND_ASSET_SCAN_SQL = `INSERT OR REPLACE INTO offline_asset_scans (
          id, factory_id, warehouse_id, w_position_id, w_position, vat_no, order_code,
          material_name, count, cycle_id, scan_result, scan_at, scan_by,
          is_complete, is_success, is_warning, is_error, local_scan_status, local_scan_qty
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

function assetScanInsertValues(
  cycleId: number,
  row: ViewAssetInfoScanResult & { id: string },
  localScanStatus: string,
  localScanQty: number | null,
): (string | number | null)[] {
  return [
    row.id.trim(),
    row.factoryId ?? null,
    row.warehouseId ?? null,
    row.wPositionId ?? null,
    row.wPosition?.trim() || null,
    row.vatNo?.trim() || null,
    row.orderCode?.trim() || null,
    row.materialName?.trim() || null,
    row.count ?? null,
    row.cycleId ?? cycleId,
    row.scanResult?.trim() || null,
    row.scanAt?.trim() || null,
    row.scanBy?.trim() || null,
    boolInt(row.isComplete),
    boolInt(row.isSuccess),
    boolInt(row.isWarning),
    boolInt(row.isError),
    localScanStatus,
    localScanQty,
  ]
}

export async function appendAssetScanPage(
  cycleId: number,
  rows: ViewAssetInfoScanResult[],
): Promise<void> {
  if (!rows.length) return
  const normalized = rows.map((row) => ({
    ...row,
    id: row.id?.trim() || createId(),
  }))
  const unique = dedupeById(normalized, (row) => row.id)
  const set = unique.map((row) => {
    const id = row.id!.trim()
    const seededStatus = statusFromScanFlags(row) ?? 'pending'
    return {
      statement: APPEND_ASSET_SCAN_SQL,
      values: assetScanInsertValues(
        cycleId,
        { ...row, id },
        seededStatus,
        row.scanCount != null ? row.scanCount : null,
      ),
    }
  })
  // One native bridge round-trip per page (vs N run() calls).
  await executeSet(set)
}

/**
 * Merge server rows for a vatNo refresh.
 * - `count` / `scanCount`→local_scan_qty: use API value when present, else keep SQLite.
 * - Server already complete → always take flags + scan_by + local_scan_status from server
 *   (online must see other users' work).
 * - `takeServerLocal: false` + server incomplete + local already scanned → keep local
 *   flags/status/scan_by (offline Success not yet on BE → second scan Exist).
 * - `takeServerLocal: true` (after batch sync): seed local_scan_status from server.
 */
export async function mergeAssetScanPageFromServer(
  cycleId: number,
  rows: ViewAssetInfoScanResult[],
  options?: { takeServerLocal?: boolean },
): Promise<void> {
  if (!rows.length) return
  const takeServerLocal = options?.takeServerLocal === true
  const normalized = rows.map((row) => ({
    ...row,
    id: row.id?.trim() || createId(),
  }))
  const unique = dedupeById(normalized, (row) => row.id)
  const ids = unique.map((row) => row.id!.trim())

  const existingById = new Map<
    string,
    {
      count: number | null
      local_scan_status: string | null
      local_scan_qty: number | null
      scan_by: string | null
      is_complete: number | null
      is_success: number | null
      is_warning: number | null
      is_error: number | null
    }
  >()
  if (ids.length) {
    const chunkSize = 200
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize)
      const placeholders = chunk.map(() => '?').join(', ')
      const existing = await query<{
        id: string
        count: number | null
        local_scan_status: string | null
        local_scan_qty: number | null
        scan_by: string | null
        is_complete: number | null
        is_success: number | null
        is_warning: number | null
        is_error: number | null
      }>(
        `SELECT id, count, local_scan_status, local_scan_qty, scan_by,
                is_complete, is_success, is_warning, is_error
         FROM offline_asset_scans
         WHERE id IN (${placeholders})`,
        chunk,
      )
      for (const row of existing) {
        existingById.set(row.id, {
          count: row.count,
          local_scan_status: row.local_scan_status,
          local_scan_qty: row.local_scan_qty,
          scan_by: row.scan_by,
          is_complete: row.is_complete,
          is_success: row.is_success,
          is_warning: row.is_warning,
          is_error: row.is_error,
        })
      }
    }
  }

  const set = unique.map((row) => {
    const id = row.id!.trim()
    const seededStatus = statusFromScanFlags(row) ?? 'pending'
    const prev = existingById.get(id)
    const mergedCount = row.count != null ? row.count : (prev?.count ?? null)
    const localQty =
      row.scanCount != null ? row.scanCount : (prev?.local_scan_qty ?? null)
    const serverComplete = isAssetCompletedByFlags(row)
    const trustServer = takeServerLocal || serverComplete
    const keepLocalStatus =
      !trustServer && prev?.local_scan_status != null && prev.local_scan_status !== ''
    const localStatus = keepLocalStatus ? prev!.local_scan_status! : seededStatus
    const localStatusNorm = normalizeLocalScanStatus(localStatus)
    const preserveLocalFlags =
      keepLocalStatus && isLocalScannedStatus(localStatusNorm)

    let mergedRow: ViewAssetInfoScanResult & { id: string } = {
      ...row,
      id,
      count: mergedCount ?? undefined,
    }
    if (preserveLocalFlags) {
      const fromDb = {
        isComplete: prev!.is_complete === 1,
        isSuccess: prev!.is_success === 1,
        isWarning: prev!.is_warning === 1,
        isError: prev!.is_error === 1,
      }
      const flags =
        statusFromScanFlags(fromDb) != null || fromDb.isComplete
          ? fromDb
          : flagsFromLocalStatus(localStatusNorm)
      const localScanBy = prev!.scan_by?.trim() || ''
      mergedRow = {
        ...mergedRow,
        isComplete: flags.isComplete,
        isSuccess: flags.isSuccess,
        isWarning: flags.isWarning,
        isError: flags.isError,
        scanBy: localScanBy || mergedRow.scanBy,
      }
    }

    return {
      statement: APPEND_ASSET_SCAN_SQL,
      values: assetScanInsertValues(cycleId, mergedRow, localStatus, localQty),
    }
  })
  await executeSet(set)
}
