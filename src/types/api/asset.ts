export interface AssetQueryResultRequest {
  page?: number
  pageSize?: number
  factoryId?: number | null
  warehouseId?: number | null
  wPositionId?: number | null
  cycleId?: number | null
  orderCode?: string | null
  name?: string | null
  isComplete?: boolean
}

export interface ViewAssetInfo {
  id?: string
  factoryId?: number
  tenantId?: string | null
  warehouseId?: number
  factoryName?: string | null
  warehouseName?: string | null
  wPositionId?: number
  wPosition?: string | null
  vatNo?: string | null
  styleDocTreeId?: number
  orderCode?: string | null
  styleCode?: string | null
  materialId?: number
  materialName?: string | null
  materialEnName?: string | null
  materialCode?: string | null
  materialClass?: string | null
  materialSubClass?: string | null
  responsibleUnit?: string | null
  materialUnitId?: number
  materialUnitNo?: string | null
  managementAccounting?: string | null
  assetState?: string | null
  quality?: string | null
  rollNo?: string | null
  batchNo?: string | null
  count?: number
}

export interface AssetQueryResult {
  items?: ViewAssetInfo[] | null
  totalCount: number
  page: number
  pageSize: number
  totalPage?: number
  hasNextPage?: boolean
  hasPreviousPage?: boolean
}

export interface ViewAssetInfoScanResult extends ViewAssetInfo {
  cycleId?: number
  scanResult?: string | null
  scanAt?: string | null
  scanBy?: string | null
  isComplete?: boolean
  isSuccess?: boolean
  isWarning?: boolean
  isError?: boolean
}

export interface AssetInfoScanResultQueryResult {
  items?: ViewAssetInfoScanResult[] | null
  totalCount: number
  page: number
  pageSize: number
  totalPage?: number
  hasNextPage?: boolean
  hasPreviousPage?: boolean
}

export type AiScanResultCode =
  | 'Ok'
  | 'WrongFactory'
  | 'WrongWarehouse'
  | 'WrongOrganization'
  | 'WrongWposition'
  | 'MultiItems'
  | 'Duplicate'
  | 'NotFound'

/** Body for POST /asset/aisrc/command — only these fields. */
export interface CreateAiScanResultRequest {
  factoryId: number
  tenantId?: string | null
  warehouseId: number
  wPositionId: number
  wPosition?: string | null
  vatNo?: string | null
  orderCode?: string | null
  materialName?: string | null
  count: number
  cycleId: number
  scanResult?: string | null
  scanCount: number
  scanAt?: string | null
  scanBy: string
}
