import { http } from '@/services/http'
import type {
  ApiResponse,
  AssetQueryResult,
  AssetQueryResultRequest,
  CreateAiScanResultRequest,
} from '@/types/api'

export async function queryAssetInfoViewResult(params: AssetQueryResultRequest) {
  const { data } = await http.post<ApiResponse<AssetQueryResult>>('/asset/aivc/queryresult', params)
  return data
}

export async function createAiScanResult(params: CreateAiScanResultRequest) {
  const { data } = await http.post<ApiResponse<boolean>>('/asset/aisrc/command', params)
  return data
}
