/** Vietnam wall-clock datetime with fixed +07:00 (not UTC/`Z`). */
export function formatVietnamDateTime(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  const ms = String(date.getMilliseconds()).padStart(3, '0')
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}:${pick('second')}.${ms}+07:00`
}

/** Time part followed by an explicit offset (`Z`, `+07:00`, `-0500`). */
const TRAILING_OFFSET = /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i

/**
 * Wire format for scan APIs: Vietnam wall-clock `YYYY-MM-DDTHH:mm:ss`, no offset.
 * A value without an offset is already wall-clock, so only the first 19 characters are kept.
 * A value with an offset is converted to Asia/Ho_Chi_Minh.
 */
export function toApiLocalDateTime(value: string): string {
  const trimmed = value.trim()
  if (!TRAILING_OFFSET.test(trimmed)) return trimmed.slice(0, 19)
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return trimmed.slice(0, 19)
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}:${pick('second')}`
}
