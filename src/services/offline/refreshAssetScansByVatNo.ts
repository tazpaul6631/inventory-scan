import { baseQueryAssetInfoScanViewResult } from '@/services/api/asset'
import { fetchAllPages } from '@/services/api/paging'
import { mergeAssetScanPageFromServer } from '@/services/repositories/offline-catalog'

const VATNO_REFRESH_PAGE_SIZE = 100
/** Soft cap so a bad network never blocks the scanner. */
const VATNO_REFRESH_TIMEOUT_MS = 3000

const inFlight = new Map<string, Promise<boolean>>()

function flightKey(cycleId: number, vatNo: string, takeServerLocal: boolean): string {
  return `${cycleId}\0${vatNo}\0${takeServerLocal ? '1' : '0'}`
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('vatNo refresh timeout')), timeoutMs)
      }),
    ])
  } finally {
    if (timer != null) clearTimeout(timer)
  }
}

async function fetchAndMergeVatNo(
  cycleId: number,
  vatNo: string,
  takeServerLocal: boolean,
): Promise<void> {
  await fetchAllPages(
    (page, pageSize) =>
      baseQueryAssetInfoScanViewResult({
        cycleId,
        vatNo,
        page,
        pageSize,
      }),
    {
      pageSize: VATNO_REFRESH_PAGE_SIZE,
      onPage: async (rows) => {
        if (!rows.length) return
        await mergeAssetScanPageFromServer(cycleId, rows, { takeServerLocal })
      },
    },
  )
}

/**
 * Pull every location of one vatNo in a cycle and upsert into SQLite.
 * Dedupes concurrent calls for the same cycle+vatNo+mode.
 * Returns false on timeout/network/API failure (caller should fall back to local).
 */
export async function refreshOfflineAssetScansByVatNo(
  cycleId: number,
  vatNo: string,
  options?: {
    timeoutMs?: number
    /** After own sync OK — seed local_scan_* from server. Pre-classify keeps local progress. */
    takeServerLocal?: boolean
  },
): Promise<boolean> {
  const code = vatNo.trim()
  if (!code || !Number.isFinite(cycleId)) return false
  const takeServerLocal = options?.takeServerLocal === true
  const timeoutMs = options?.timeoutMs ?? VATNO_REFRESH_TIMEOUT_MS
  const key = flightKey(cycleId, code, takeServerLocal)

  const existing = inFlight.get(key)
  if (existing) return existing

  const run = (async (): Promise<boolean> => {
    try {
      await withTimeout(fetchAndMergeVatNo(cycleId, code, takeServerLocal), timeoutMs)
      return true
    } catch {
      return false
    }
  })()

  inFlight.set(key, run)
  try {
    return await run
  } finally {
    inFlight.delete(key)
  }
}
