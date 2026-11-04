import { http } from '@/services/http'
import type {
  ApiResponse,
  CycleQueryResult,
  CycleQueryResultRequest,
  FactoryQueryResult,
  FactoryQueryResultRequest,
  PositionQueryResult,
  PositionQueryResultRequest,
  ViewArea,
  ViewCycle,
  ViewFactory,
  ViewWarehouse,
  WarehouseQueryResult,
  WarehouseQueryResultRequest,
} from '@/types/api'

export async function getFactoryList() {
  const { data } = await http.post<ApiResponse<ViewFactory[]>>('/category/fc/getlist', {})
  return data
}

export async function queryFactoryResult(params?: FactoryQueryResultRequest) {
  const { data } = await http.post<ApiResponse<FactoryQueryResult>>(
    '/category/fc/queryresult',
    params ?? {},
  )
  return data
}

export async function queryCycleResult() {
  const { data } = await http.get<ApiResponse<ViewCycle>>('/category/cc/getlastest')
  return data
}

export async function queryCyclesResult(params?: CycleQueryResultRequest) {
  const { data } = await http.post<ApiResponse<CycleQueryResult>>(
    '/category/cc/queryresult',
    params ?? {},
  )
  return data
}

export async function queryWarehouseResult(params?: WarehouseQueryResultRequest) {
  const { data } = await http.post<ApiResponse<WarehouseQueryResult>>(
    '/category/whc/queryresult',
    params ?? {},
  )
  return data
}

export async function getWarehouseList(params?: { factoryId?: number }) {
  const { data } = await http.post<ApiResponse<ViewWarehouse[]>>('/category/whc/getlist', params ?? {})
  return data
}

export async function queryPositionResult(params?: PositionQueryResultRequest) {
  const { data } = await http.post<ApiResponse<PositionQueryResult>>(
    '/category/pc/queryresult',
    params ?? {},
  )
  return data
}

export async function getAreaList(params?: { factoryId?: number; warehouseId?: number }) {
  const { data } = await http.post<ApiResponse<ViewArea[]>>('/category/pvc/getlist', params ?? {})
  return data
}
