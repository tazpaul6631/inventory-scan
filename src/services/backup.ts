import dayjs from 'dayjs'
import { App } from '@capacitor/app'
import { isNative } from '@/adapters/platform'
import { query, run, flushDatabase } from '@/storage/database'
import { writeTextFile } from '@/storage/files'
import { now } from '@/utils/id'
import { listScanLogs } from '@/services/repositories/scans'

export async function createBackup(): Promise<string> {
  await flushDatabase()
  const snapshot = {
    version: 1,
    createdAt: now(),
    scans: await listScanLogs(),
    settings: await query('SELECT key, value FROM settings'),
  }
  const filename = `inventory-scan-backup-${dayjs().format('YYYYMMDD-HHmmss')}.json`
  await writeTextFile(`Inventory Scan/${filename}`, JSON.stringify(snapshot, null, 2), 'documents')
  await run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('lastBackupAt', ?)`, [String(now())])
  return filename
}

export function watchAppPause(onPause: () => void): void {
  if (!isNative()) return
  App.addListener('appStateChange', (state) => {
    if (!state.isActive) onPause()
  })
}
