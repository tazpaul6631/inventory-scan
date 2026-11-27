import { query, run } from '@/storage/database'
import { readBinaryFile } from '@/storage/files'
import { createId, now } from '@/utils/id'
import { EVIDENCE_MEDIA_KIND } from '@/services/evidence-photo'

type MediaSyncStatus = 'pending' | 'synced' | 'error'

interface MediaRow {
  id: string
  recordId: string | null
  kind: string
  path: string
  mime: string
  size: number | null
  durationMs: number | null
  createdAt: number
  syncStatus: MediaSyncStatus
}

interface InsertEvidenceMediaInput {
  id?: string
  recordId: string
  path: string
  mime?: string
  size?: number | null
}

function normalizeSyncStatus(raw: string | null | undefined): MediaSyncStatus {
  if (raw === 'synced' || raw === 'error') return raw
  return 'pending'
}

function mapMediaRow(row: {
  id: string
  record_id: string | null
  kind: string
  path: string
  mime: string
  size: number | null
  duration_ms: number | null
  created_at: number
  sync_status: string
}): MediaRow {
  return {
    id: row.id,
    recordId: row.record_id,
    kind: row.kind,
    path: row.path,
    mime: row.mime,
    size: row.size,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
    syncStatus: normalizeSyncStatus(row.sync_status),
  }
}

export async function insertEvidenceMedia(input: InsertEvidenceMediaInput): Promise<MediaRow> {
  const id = input.id?.trim() || createId()
  const mime = input.mime?.trim() || 'image/jpeg'
  const createdAt = now()
  await run(
    `INSERT INTO media (
      id, record_id, kind, path, mime, size, duration_ms, created_at, sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    [
      id,
      input.recordId,
      EVIDENCE_MEDIA_KIND,
      input.path,
      mime,
      input.size ?? null,
      createdAt,
      'pending',
    ],
  )
  return {
    id,
    recordId: input.recordId,
    kind: EVIDENCE_MEDIA_KIND,
    path: input.path,
    mime,
    size: input.size ?? null,
    durationMs: null,
    createdAt,
    syncStatus: 'pending',
  }
}

export async function listMediaByRecordId(recordId: string): Promise<MediaRow[]> {
  const id = recordId.trim()
  if (!id) return []
  const rows = await query<{
    id: string
    record_id: string | null
    kind: string
    path: string
    mime: string
    size: number | null
    duration_ms: number | null
    created_at: number
    sync_status: string
  }>(
    `SELECT id, record_id, kind, path, mime, size, duration_ms, created_at, sync_status
     FROM media
     WHERE record_id = ?
     ORDER BY created_at DESC`,
    [id],
  )
  return rows.map(mapMediaRow)
}


export async function markMediaSynced(id: string): Promise<void> {
  await run(`UPDATE media SET sync_status = 'synced' WHERE id = ?`, [id])
}


async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** Latest scan_evidence blob for a scan command / fail-log record. */
export async function getEvidenceBlobForRecord(recordId: string): Promise<Blob | null> {
  const rows = await listMediaByRecordId(recordId)
  const evidence = rows.find((row) => row.kind === EVIDENCE_MEDIA_KIND)
  if (!evidence?.path) return null
  try {
    return await readBinaryFile(evidence.path)
  } catch {
    return null
  }
}

