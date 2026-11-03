export interface ViewFactory {
  id: number
  sno?: number
  name?: string | null
  tenantId?: string | null
  abbr?: string | null
}

export interface ViewCycle {
  id: number
  status?: number
  code?: string | null
  scanDate?: string | null
  description?: string | null
  createdAt?: string | null
  createdBy?: string | null
  updatedAt?: string | null
  updatedBy?: string | null
}

export interface ViewWarehouse {
  id: number
  sno?: number
  factoryId?: number
  name?: string | null
  remark?: string | null
}

export interface ViewArea {
  id: number
  sno?: number
  factoryId?: number
  warehouseId?: number
  wposition?: string | null
  remark?: string | null
  lastSyncAt?: string | null
}

export interface CycleQueryResult {
  items?: ViewCycle[] | null
  totalCount: number
  page: number
  pageSize: number
  totalPage?: number
  hasNextPage?: boolean
  hasPreviousPage?: boolean
}
