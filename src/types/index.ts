export type SyncStatus = 'synced' | 'pending' | 'conflict'
export type MediaKind = 'photo' | 'video'
export type ScanKind = 'qr' | 'barcode' | 'nfc' | 'manual'
export type ScanDirection = 'in' | 'out'
export type ScaleSource = 'usb' | 'ble' | 'manual'
export type OutboxAction = 'create' | 'update' | 'delete'
export type OutboxEntity = 'product' | 'media' | 'scale_reading' | 'scan'

export interface Product {
  id: string
  sku: string
  name: string
  barcode: string | null
  price: number
  stock: number
  weight: number | null
  unit: string
  note: string | null
  updatedAt: number
  deletedAt: number | null
  syncStatus: SyncStatus
}

export interface MediaItem {
  id: string
  recordId: string | null
  kind: MediaKind
  path: string
  mime: string
  size: number | null
  durationMs: number | null
  createdAt: number
  syncStatus: SyncStatus
}

export interface OutboxItem {
  id: string
  entity: OutboxEntity
  action: OutboxAction
  payload: string
  createdAt: number
  retries: number
}

export interface ScanLog {
  id: string
  kind: ScanKind
  value: string
  format: string | null
  direction: ScanDirection
  createdAt: number
}

export interface ScaleReading {
  id: string
  weight: number
  unit: 'kg' | 'g' | 'lb'
  stable: boolean
  source: ScaleSource
  raw: string
  createdAt: number
}

export interface Session {
  email: string
  loggedInAt: number
  userId?: string
  code?: string
  name?: string
  roleId?: string
  roleName?: string
  accessToken?: string
  refreshToken?: string
  factory?: string
  factoryName?: string
  factoryId?: number
  cycle?: string
  cycleId?: number
  abbr?: string
}

export interface AppSettings {
  apiUrl: string
  companyName: string
  scaleBaudRate: number
  bleServiceUuid: string
  bleCharacteristicUuid: string
  autoBackupMinutes: number
  locale: string
}

export interface DashboardStats {
  products: number
  pending: number
  scans: number
  media: number
  lastBackupAt: number | null
}

export interface ScanResult {
  value: string
  format: string
  kind: ScanKind
  direction?: ScanDirection
}

export interface LiveWeight {
  weight: number
  unit: 'kg' | 'g' | 'lb'
  stable: boolean
  raw: string
  source: ScaleSource
}
