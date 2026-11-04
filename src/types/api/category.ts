export interface ViewFactory {
  id: number
  sno?: number
  name?: string | null
  tenantId?: string | null
  abbr?: string | null
}

export interface FactoryQueryResultRequest {
  page?: number
  pageSize?: number
  id?: number | null
  ids?: number[] | null
  sno?: number | null
  snos?: number[] | null
  tenantId?: string | null
  abbr?: string | null
}

export interface FactoryQueryResult {
  items?: ViewFactory[] | null
  totalCount: number
  page: number
  pageSize: number
  totalPage?: number
  hasNextPage?: boolean
  hasPreviousPage?: boolean
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

export interface CycleQueryResultRequest {
  page?: number
  pageSize?: number
  id?: number | null
  ids?: number[] | null
  status?: number | null
  code?: string | null
}

export interface ViewWarehouse {
  id: number
  sno?: number
  factoryId?: number
  name?: string | null
  remark?: string | null
}

export interface WarehouseQueryResultRequest {
  page?: number
  pageSize?: number
  id?: number | null
  ids?: number[] | null
  sno?: number | null
  snos?: number[] | null
  factoryId?: number | null
  factoryIds?: number[] | null
}

export interface WarehouseQueryResult {
  items?: ViewWarehouse[] | null
  totalCount: number
  page: number
  pageSize: number
  totalPage?: number
  hasNextPage?: boolean
  hasPreviousPage?: boolean
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

export interface PositionQueryResultRequest {
  page?: number
  pageSize?: number
  id?: number | null
  ids?: number[] | null
  sno?: number | null
  snos?: number[] | null
  factoryId?: number | null
  factoryIds?: number[] | null
  warehouseId?: number | null
  warehouseIds?: number[] | null
}

export interface PositionQueryResult {
  items?: ViewArea[] | null
  totalCount: number
  page: number
  pageSize: number
  totalPage?: number
  hasNextPage?: boolean
  hasPreviousPage?: boolean
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
