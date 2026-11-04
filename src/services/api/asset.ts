import { http } from '@/services/http'
import type {
  ApiResponse,
  AssetInfoScanResultQueryResult,
  AssetQueryResult,
  AssetQueryResultRequest,
  CreateAiScanResultRequest,
} from '@/types/api'

export async function queryAssetInfoViewResult(params: AssetQueryResultRequest) {
  const { data } = await http.post<ApiResponse<AssetQueryResult>>('/asset/aivc/queryresult', params)
  return data
}

export async function queryAssetInfoResult(params?: AssetQueryResultRequest) {
  const { data } = await http.post<ApiResponse<AssetQueryResult>>(
    '/asset/aic/queryresult',
    params ?? {},
  )
  return data
}

export async function queryAssetInfoScanResult(params?: AssetQueryResultRequest) {
  const { data } = await http.post<ApiResponse<AssetInfoScanResultQueryResult>>(
    '/asset/aisrc/queryresult',
    params ?? {},
  )
  return data
}

export async function createAiScanResult(params: CreateAiScanResultRequest) {
  const { data } = await http.post<ApiResponse<boolean>>('/asset/aisrc/command', params)
  return data
}
