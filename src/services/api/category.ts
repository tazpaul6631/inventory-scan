import { http } from '@/services/http'
import type { ApiResponse, ViewArea, ViewCycle, ViewFactory, ViewWarehouse } from '@/types/api'

export async function getFactoryList() {
  const { data } = await http.post<ApiResponse<ViewFactory[]>>('/category/fc/getlist', {})
  return data
}

export async function queryCycleResult() {
  const { data } = await http.get<ApiResponse<ViewCycle>>('/category/cc/getlastest')
  return data
}

export async function getWarehouseList(params?: { factoryId?: number }) {
  const { data } = await http.post<ApiResponse<ViewWarehouse[]>>('/category/whc/getlist', params ?? {})
  return data
}

export async function getAreaList(params?: { factoryId?: number; warehouseId?: number }) {
  const { data } = await http.post<ApiResponse<ViewArea[]>>('/category/pvc/getlist', params ?? {})
  return data
}
