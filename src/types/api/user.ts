export interface UserValidateRequest {
  code: string
  password: string
  loginAt: string
}

export interface ViewMenuPermission {
  id: string
  name?: string | null
  isAllow: boolean
}

export interface ViewPlatformPermission {
  code?: string | null
  menus?: ViewMenuPermission[] | null
}

export interface ViewValidateUser {
  id: string
  keyword?: string | null
  code?: string | null
  email?: string | null
  name?: string | null
  password?: string | null
  allowWeb?: boolean
  isActive?: boolean
  roleId?: string
  roleName?: string | null
  avatar?: string | null
  accessToken?: string | null
  refreshToken?: string | null
  permissions?: ViewPlatformPermission[] | null
}

export interface UserQueryResultRequest {
  page?: number
  pageSize?: number
  id?: string | null
  ids?: string[] | null
  keyword?: string | null
  code?: string | null
  allowWeb?: boolean | null
  isActive?: boolean | null
  createdAtFrom?: string | null
  createdAtTo?: string | null
  createdBy?: string | null
  updatedAtFrom?: string | null
  updatedAtTo?: string | null
  updatedBy?: string | null
}

export interface ViewUser {
  id: string
  status?: number
  keyword?: string | null
  code?: string | null
  name?: string | null
  password?: string | null
  allowWeb?: boolean
  isActive: boolean
  createdAt?: string
  createdBy?: string
  updatedAt?: string
  updatedBy?: string
}

export interface UserQueryResult {
  items?: ViewUser[] | null
  totalCount: number
  page: number
  pageSize: number
  totalPage?: number
  hasNextPage?: boolean
  hasPreviousPage?: boolean
}

export interface UserCreateRequest {
  code: string
  name: string
  password: string
  allowWeb: boolean
  isActive: boolean
  createdBy: string
  updatedBy: string
}

export interface UpdateUserRequest {
  code: string
  name: string
  allowWeb: boolean
  isActive: boolean
  updatedBy: string
}

export interface ChangeUserPasswordRequest {
  oldPassword: string
  newPassword: string
}

export interface DeleteUserRequest {
  updatedBy: string
}
