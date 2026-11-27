import { query, run } from '@/storage/database'
import { appendScanLiveLog } from '@/services/scan-live-log'
import type { ScanDirection, ScanKind, ScanLog } from '@/types'
import { createId, now } from '@/utils/id'

interface ScanRow {
  id: string
  kind: ScanKind
  value: string
  format: string | null
  direction: ScanDirection | null
  created_at: number
}

function mapScan(row: ScanRow): ScanLog {
  return {
    id: row.id,
    kind: row.kind,
    value: row.value,
    format: row.format,
    direction: row.direction === 'out' ? 'out' : 'in',
    createdAt: row.created_at,
  }
}

export async function addScanLog(input: {
  kind: ScanKind
  value: string
  format?: string | null
  direction?: ScanDirection
}): Promise<ScanLog> {
  const item: ScanLog = {
    id: createId(),
    kind: input.kind,
    value: input.value,
    format: input.format ?? null,
    direction: input.direction ?? 'in',
    createdAt: now(),
  }
  await run(
    `INSERT INTO scan_logs (id, kind, value, format, direction, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [item.id, item.kind, item.value, item.format, item.direction, item.createdAt],
  )
  void appendScanLiveLog(item)
  return item
}

/** Omit `limit` (or pass ≤ 0) to load every scan row. */
export async function listScanLogs(limit?: number): Promise<ScanLog[]> {
  if (limit != null && limit > 0) {
    const rows = await query<ScanRow>(
      `SELECT * FROM scan_logs ORDER BY created_at DESC LIMIT ?`,
      [limit],
    )
    return rows.map(mapScan)
  }
  const rows = await query<ScanRow>(`SELECT * FROM scan_logs ORDER BY created_at DESC`)
  return rows.map(mapScan)
}




