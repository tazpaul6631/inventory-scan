import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { formatDateTime } from '@/utils/format'
import type { ScanLog } from '@/types'

/** Append-only CSV under Documents/Inventory Scan — survives UI limits and delete-all. */
export const SCAN_LIVE_LOG_PATH = 'Inventory Scan/scan-live-log.csv'

const HEADER = 'Barcode,Type,DateNow\n'

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function lineFor(item: Pick<ScanLog, 'value' | 'direction' | 'createdAt'>): string {
  return `${csvCell(item.value)},${item.direction},${formatDateTime(item.createdAt)}\n`
}

async function readExisting(): Promise<string> {
  try {
    const result = await Filesystem.readFile({
      path: SCAN_LIVE_LOG_PATH,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    })
    return String(result.data ?? '')
  } catch {
    return ''
  }
}

/** Best-effort append; never throws to the scan flow. */
export async function appendScanLiveLog(
  item: Pick<ScanLog, 'value' | 'direction' | 'createdAt'>,
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const existing = await readExisting()
    const data = existing ? `${existing}${lineFor(item)}` : `${HEADER}${lineFor(item)}`
    await Filesystem.writeFile({
      path: SCAN_LIVE_LOG_PATH,
      data,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true,
    })
  } catch {
    // ignore disk / permission errors
  }
}
