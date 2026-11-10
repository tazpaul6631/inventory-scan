import { http } from '@/services/http'
import type {
  ApiResponse,
  CreateCycleRequest,
  CycleQueryResult,
  CycleQueryResultRequest,
  DeleteCycleRequest,
  FactoryQueryResult,
  FactoryQueryResultRequest,
  OrganizationQueryResult,
  OrganizationQueryResultRequest,
  PositionQueryResult,
  PositionQueryResultRequest,
  UpdateCycleRequest,
  ViewArea,
  ViewCycle,
  ViewFactory,
  ViewOrganization,
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

export async function syncFactoriesFromApi(params: { createdBy: string }) {
  const { data } = await http.post<ApiResponse<boolean>>('/category/fc/syncfromapi', params)
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

export async function queryCycleGetOne(id: number) {
  const { data } = await http.get<ApiResponse<ViewCycle>>(`/category/cc/getone/${id}`)
  return data
}

export async function createCycle(params: CreateCycleRequest) {
  const { data } = await http.post<ApiResponse<boolean>>('/category/cc/create', params)
  return data
}

export async function updateCycle(id: number, params: UpdateCycleRequest) {
  const { data } = await http.patch<ApiResponse<boolean>>(`/category/cc/update/${id}`, params)
  return data
}

export async function deleteCycle(id: number, params: DeleteCycleRequest) {
  const { data } = await http.delete<ApiResponse<boolean>>(`/category/cc/delete/${id}`, { data: params })
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

export async function baseQueryWarehouseResult(params?: WarehouseQueryResultRequest) {
  const { data } = await http.post<ApiResponse<WarehouseQueryResult>>(
    '/category/whc/basequeryresult',
    params ?? {},
  )
  return data
}

export async function syncWarehousesFromApi(params: { createdBy: string }) {
  const { data } = await http.post<ApiResponse<boolean>>('/category/whc/syncfromapi', params)
  return data
}

export async function queryPositionResult(params?: PositionQueryResultRequest) {
  const { data } = await http.post<ApiResponse<PositionQueryResult>>(
    '/category/pc/queryresult',
    params ?? {},
  )
  return data
}

export async function baseQueryPositionResult(params?: PositionQueryResultRequest) {
  const { data } = await http.post<ApiResponse<PositionQueryResult>>(
    '/category/pc/basequeryresult',
    params ?? {},
  )
  return data
}

export async function syncPositionsFromApi(params: { createdBy: string }) {
  const { data } = await http.post<ApiResponse<boolean>>('/category/pc/syncfromapi', params)
  return data
}

export async function getAreaList(params?: { factoryId?: number; warehouseId?: number }) {
  const { data } = await http.post<ApiResponse<ViewArea[]>>('/category/pvc/getlist', params ?? {})
  return data
}

export async function getOrganizationList(params?: { factoryId?: number }) {
  const { data } = await http.post<ApiResponse<ViewOrganization[]>>(
    '/category/oc/getlist',
    params ?? {},
  )
  return data
}

export async function queryOrganizationResult(params?: OrganizationQueryResultRequest) {
  const { data } = await http.post<ApiResponse<OrganizationQueryResult>>(
    '/category/oc/queryresult',
    params ?? {},
  )
  return data
}

export async function baseQueryOrganizationResult(params?: OrganizationQueryResultRequest) {
  const { data } = await http.post<ApiResponse<OrganizationQueryResult>>(
    '/category/oc/basequeryresult',
    params ?? {},
  )
  return data
}

export async function syncOrganizationsFromApi(params: { createdBy: string }) {
  const { data } = await http.post<ApiResponse<boolean>>('/category/oc/syncfromapi', params)
  return data
}
