import { http } from '@/services/http'
import type {
  ApiResponse,
  ChangeUserPasswordRequest,
  DeleteUserRequest,
  UserCreateRequest,
  UserQueryResult,
  UserQueryResultRequest,
  UserValidateRequest,
  UpdateUserRequest,
  ViewUser,
  ViewValidateUser,
} from '@/types/api'

export async function userValidate(params: UserValidateRequest) {
  const { data } = await http.post<ApiResponse<ViewValidateUser>>('/user/uc/validate', params)
  return data
}

export async function queryUserResult(params?: UserQueryResultRequest) {
  const { data } = await http.post<ApiResponse<UserQueryResult>>('/user/uc/queryresult', params ?? {})
  return data
}

export async function queryUserGetOne(id: string) {
  const { data } = await http.get<ApiResponse<ViewUser>>(`/user/uc/getone/${id}`)
  return data
}

export async function userCreate(params: UserCreateRequest) {
  const { data } = await http.post<ApiResponse<boolean>>('/user/uc/create', params)
  return data
}

export async function updateUser(id: string, params: UpdateUserRequest) {
  const { data } = await http.patch<ApiResponse<boolean>>(`/user/uc/update/${id}`, params)
  return data
}

export async function changePasswordUser(id: string, params: ChangeUserPasswordRequest) {
  const { data } = await http.patch<ApiResponse<boolean>>(`/user/uc/changepassword/${id}`, params)
  return data
}

export async function deleteUser(id: string, params?: DeleteUserRequest) {
  const { data } = await http.delete<ApiResponse<boolean>>(`/user/uc/delete/${id}`, { data: params })
  return data
}

export async function userLogout(userId?: string) {
  const { data } = await http.post('/user/uc/logout', { userId })
  return data
}
