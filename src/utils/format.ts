import dayjs from 'dayjs'

export function formatDateTime(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const parsed = typeof value === 'number' ? value : Date.parse(value)
  if (!parsed) return '—'
  return dayjs(parsed).format('DD/MM/YYYY HH:mm:ss')
}


function stripMarks(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
}

export function personInitials(name: string): string {
  const words = stripMarks(name).trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  const first = words[0][0] ?? ''
  if (words.length === 1) return first.toUpperCase()
  const last = words[words.length - 1][0] ?? ''
  return `${first}${last}`.toUpperCase()
}

