import type {
  OfflineScanCommandPayload,
  PendingScanCommand,
} from '@/services/repositories/offline-catalog'

export type ReconcilePendingScanResult = { kind: 'upload'; payload: OfflineScanCommandPayload }

/**
 * Before sync upload: trust the queued payload (Success / Exist / WrongWposition as scanned).
 * Do not reclassify from BE/local flags — that rewrote offline queues incorrectly.
 */
export async function reconcilePendingScanCommandBeforeSync(
  item: PendingScanCommand,
): Promise<ReconcilePendingScanResult> {
  return { kind: 'upload', payload: item.payload }
}
