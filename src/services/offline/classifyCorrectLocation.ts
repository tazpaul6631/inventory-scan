type ScanFlagFields = {
  isComplete?: boolean | null
  isSuccess?: boolean | null
  isWarning?: boolean | null
  isError?: boolean | null
}

/**
 * Correct factory+warehouse+position: Success vs Exist from asset flags.
 * - !isComplete → Success
 * - isComplete+isError, !isWarning → Success (recover Wrong → correct)
 * - isComplete+isError+isWarning → Exist
 * - isComplete+isSuccess → Exist
 * - isComplete+isWarning → Exist
 */
export function classifyCorrectLocationScan(flags: ScanFlagFields): 'Success' | 'Exist' {
  const complete = flags.isComplete === true
  const isError = flags.isError === true
  const isWarning = flags.isWarning === true
  const isSuccess = flags.isSuccess === true

  if (!complete) return 'Success'
  if (isError) return isWarning ? 'Exist' : 'Success'
  if (isSuccess || isWarning) return 'Exist'
  return 'Success'
}

/** BE already has a finished scan on this row. */
export function isAssetCompletedByFlags(flags: ScanFlagFields): boolean {
  if (flags.isComplete !== true) return false
  return flags.isSuccess === true || flags.isWarning === true || flags.isError === true
}

/**
 * True only when both sides are non-empty and equal.
 * Missing scanBy → not same user (adopt path, not Exist).
 */
export function isSameScanBy(
  scanBy: string | null | undefined,
  currentUserId: string | null | undefined,
): boolean {
  const by = scanBy?.trim() || ''
  const me = currentUserId?.trim() || ''
  if (!by || !me) return false
  return by === me
}

/**
 * Map a completed asset at the **correct** location for re-scan / offline sync rewrite.
 * Same rules as classifyCorrectLocationScan:
 * - isError + !isWarning → Success (recover Wrong → correct position)
 * - isWarning / isSuccess → Exist
 * WrongWposition is only for location miss paths, not this helper.
 */
export function scanResultFromCompletedFlags(
  flags: ScanFlagFields,
): 'Exist' | 'Success' {
  if (!isAssetCompletedByFlags(flags)) return 'Success'
  return classifyCorrectLocationScan(flags)
}
