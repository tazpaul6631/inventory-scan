import { http } from '@/services/http'
import { toApiLocalDateTime } from '@/utils/localDateTime'
import type {
  ApiResponse,
  AssetInfoScanResultQueryResult,
  AssetQueryResult,
  AssetQueryResultRequest,
  CreateAiScanResultRequest,
  CreateAiScanResultWithImage,
  CreateScanFailLogRequest,
  SyncAiScanResultItem,
  SyncScanFailLogItem,
} from '@/types/api'

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
    { ...params },
  )
  return data
}

export interface ExcelAisrExportFile {
  filePath?: string | null
  fileName?: string | null
}

/** Excel of the filtered scan-result list. `data.filePath` is the file to download. */
export async function exportAssetInfoScanResultExcel(params?: AssetQueryResultRequest) {
  const { data } = await http.post<ApiResponse<ExcelAisrExportFile>>('/export/ec/excelaisr', {
    ...params,
  })
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
    scanAt: params.scanAt ? toApiLocalDateTime(params.scanAt) : null,
    scanBy: params.scanBy,
  }
}

function appendScanCommandForm(form: FormData, params: CreateAiScanResultRequest) {
  form.append('FactoryId', String(params.factoryId))
  if (params.tenantId != null && params.tenantId !== '') {
    form.append('TenantId', params.tenantId)
  }
  form.append('WarehouseId', String(params.warehouseId))
  form.append('WPositionId', String(params.wPositionId))
  if (params.wPosition != null) form.append('WPosition', params.wPosition)
  if (params.vatNo != null) form.append('VatNo', params.vatNo)
  if (params.orderCode != null) form.append('OrderCode', params.orderCode)
  if (params.materialName != null) form.append('MaterialName', params.materialName)
  form.append('Count', String(params.count))
  form.append('CycleId', String(params.cycleId))
  if (params.scanResult != null) form.append('ScanResult', params.scanResult)
  form.append('ScanCount', String(params.scanCount))
  if (params.scanAt != null) form.append('ScanAt', params.scanAt)
  form.append('ScanBy', params.scanBy)
}

/** Online scan command — always multipart (Swagger IFormFile); Image only when present. */
export async function createAiScanResult(params: CreateAiScanResultWithImage) {
  const body = toAiScanCommandBody(params)
  const form = new FormData()
  appendScanCommandForm(form, body)
  if (params.image) {
    form.append('Image', params.image, 'evidence.jpg')
  }
  const { data } = await http.post<ApiResponse<boolean>>('/asset/aisrc/command', form)
  return data
}

function appendIndexed(
  form: FormData,
  index: number,
  field: string,
  value: string | Blob,
  fileName?: string,
) {
  const key = `dto[${index}].${field}`
  if (value instanceof Blob) {
    form.append(key, value, fileName ?? 'evidence.jpg')
  } else {
    form.append(key, value)
  }
}

/** Batch sync scan commands — multipart IFormFile dto[] like online. */
export async function syncAiScanResultsBatch(items: SyncAiScanResultItem[]) {
  const form = new FormData()
  items.forEach((item, index) => {
    const base = toAiScanCommandBody(item)
    appendIndexed(form, index, 'FactoryId', String(base.factoryId))
    if (base.tenantId != null && base.tenantId !== '') {
      appendIndexed(form, index, 'TenantId', base.tenantId)
    }
    appendIndexed(form, index, 'WarehouseId', String(base.warehouseId))
    appendIndexed(form, index, 'WPositionId', String(base.wPositionId))
    if (base.wPosition != null) appendIndexed(form, index, 'WPosition', base.wPosition)
    if (base.vatNo != null) appendIndexed(form, index, 'VatNo', base.vatNo)
    if (base.orderCode != null) appendIndexed(form, index, 'OrderCode', base.orderCode)
    if (base.materialName != null) appendIndexed(form, index, 'MaterialName', base.materialName)
    appendIndexed(form, index, 'Count', String(base.count))
    appendIndexed(form, index, 'CycleId', String(base.cycleId))
    if (base.scanResult != null) appendIndexed(form, index, 'ScanResult', base.scanResult)
    appendIndexed(form, index, 'ScanCount', String(base.scanCount))
    if (base.scanAt != null) appendIndexed(form, index, 'ScanAt', base.scanAt)
    appendIndexed(form, index, 'ScanBy', base.scanBy)
    if (item.image) appendIndexed(form, index, 'Image', item.image, 'evidence.jpg')
  })
  const { data } = await http.post<ApiResponse<unknown>>('/sync/sc/syncaisr', form)
  return data
}

/** Online NotFound evidence — POST /applog/aisflc/create (multipart). */
export async function createScanFailLog(params: CreateScanFailLogRequest) {
  const form = new FormData()
  form.append('VatNo', params.vatNo)
  form.append('CycleId', String(params.cycleId))
  form.append('CreatedAt', toApiLocalDateTime(params.createdAt))
  form.append('CreatedBy', params.createdBy)
  if (params.image) {
    form.append('Image', params.image, 'evidence.jpg')
  }
  const { data } = await http.post<ApiResponse<boolean>>('/applog/aisflc/create', form)
  return data
}

/** Batch sync NotFound / fail logs — multipart IFormFile dto[] like online. */
export async function syncScanFailLogsBatch(items: SyncScanFailLogItem[]) {
  const form = new FormData()
  items.forEach((item, index) => {
    appendIndexed(form, index, 'VatNo', item.vatNo)
    appendIndexed(form, index, 'CycleId', String(item.cycleId))
    appendIndexed(form, index, 'CreatedAt', toApiLocalDateTime(item.createdAt))
    appendIndexed(form, index, 'CreatedBy', item.createdBy)
    if (item.image) appendIndexed(form, index, 'Image', item.image, 'evidence.jpg')
  })
  const { data } = await http.post<ApiResponse<unknown>>('/sync/sc/syncaisfl', form)
  return data
}

async function syncAssetInfosFromApi(params: { createdBy: string }) {
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

async function syncAssetInfoScansFromApi(params: { createdBy: string }) {
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
