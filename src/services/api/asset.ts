import { http } from '@/services/http'
import type {
  ApiResponse,
  AssetInfoScanResultQueryResult,
  AssetQueryResult,
  AssetQueryResultRequest,
  CreateAiScanResultRequest,
} from '@/types/api'

// export async function queryAssetInfoViewResult(params: AssetQueryResultRequest) {
//   const { data } = await http.post<ApiResponse<AssetQueryResult>>('/asset/aivc/queryresult', params)
//   return data
// }

export async function queryAssetInfoResult(params?: AssetQueryResultRequest) {
  const { data } = await http.post<ApiResponse<AssetQueryResult>>(
    '/asset/aic/queryresult',
    params ?? {},
  )
  return data
}

/** Web list — completed scan results. */
export async function queryAssetInfoScanResult(params?: AssetQueryResultRequest) {
  const { data } = await http.post<ApiResponse<AssetInfoScanResultQueryResult>>(
    '/asset/aisrvc/queryresult',
    { isComplete: true, ...params },
  )
  return data
}

/** Offline base dump for a cycle (paginated; can be 70k+). */
export async function baseQueryAssetInfoScanViewResult(params?: AssetQueryResultRequest) {
  const { data } = await http.post<ApiResponse<AssetInfoScanResultQueryResult>>(
    '/asset/aisrvc/basequeryresult',
    params ?? {},
  )
  return data
}

/** Mobile to-check list for a cycle / position. */
export async function queryAssetInfoScanResultByCycle(params?: AssetQueryResultRequest) {
  const { data } = await http.post<ApiResponse<AssetInfoScanResultQueryResult>>(
    '/asset/aisrc/queryresult',
    params ?? {},
  )
  return data
}

function toAiScanCommandBody(params: CreateAiScanResultRequest): CreateAiScanResultRequest {
  return {
    factoryId: params.factoryId,
    tenantId: params.tenantId ?? null,
    warehouseId: params.warehouseId,
    wPositionId: params.wPositionId,
    wPosition: params.wPosition ?? null,
    vatNo: params.vatNo ?? null,
    orderCode: params.orderCode ?? null,
    materialName: params.materialName ?? null,
    count: params.count,
    cycleId: params.cycleId,
    scanResult: params.scanResult ?? null,
    scanCount: params.scanCount,
    scanAt: params.scanAt ?? null,
    scanBy: params.scanBy,
  }
}

export async function createAiScanResult(params: CreateAiScanResultRequest) {
  const { data } = await http.post<ApiResponse<boolean>>(
    '/asset/aisrc/command',
    toAiScanCommandBody(params),
  )
  return data
}

/** Batch upload pending offline scan commands. */
export async function syncAiScanResultsBatch(items: CreateAiScanResultRequest[]) {
  const { data } = await http.post<ApiResponse<unknown>>(
    '/sync/sc/syncaisr',
    items.map(toAiScanCommandBody),
  )
  return data
}

export async function syncAssetInfosFromApi(params: { createdBy: string }) {
  const { data } = await http.post<ApiResponse<number>>('/asset/aic/syncfromapi', params)
  return data
}

/** Keep calling sync until remaining count (`data`) is 0. */
export async function pollSyncAssetInfosFromApi(
  params: { createdBy: string },
  onProgress?: (remaining: number) => void,
) {
  let remaining = Number.POSITIVE_INFINITY
  while (remaining > 0) {
    const res = await syncAssetInfosFromApi(params)
    if (res.success === false) return res
    remaining = Number(res.data ?? 0)
    onProgress?.(remaining)
    if (remaining <= 0) return { ...res, data: 0 }
  }
  return { success: true, data: 0, message: undefined }
}

export async function syncAssetInfoScansFromApi(params: { createdBy: string }) {
  const { data } = await http.post<ApiResponse<number>>('/asset/aisrc/syncfromapi', params)
  return data
}

/** Keep calling scan-result sync until remaining count (`data`) is 0. */
export async function pollSyncAssetInfoScansFromApi(
  params: { createdBy: string },
  onProgress?: (remaining: number) => void,
) {
  let remaining = Number.POSITIVE_INFINITY
  while (remaining > 0) {
    const res = await syncAssetInfoScansFromApi(params)
    if (res.success === false) return res
    remaining = Number(res.data ?? 0)
    onProgress?.(remaining)
    if (remaining <= 0) return { ...res, data: 0 }
  }
  return { success: true, data: 0, message: undefined }
}
