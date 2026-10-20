import type { AxiosResponse } from 'axios'
import type { ApiResponse } from '@contracts/types'
import { ApiClientError } from './apiError'

/**
 * 解包统一响应：
 * - 成功：返回 data
 * - 失败：抛出 ApiClientError（保留 code / details / requestId）
 *
 * 禁止在调用点使用 `res.data.data!` 或 `res.data.data ?? []`：
 * 那会把接口错误伪装成空数据，让用户以为「真的没有记录」。
 */
export function unwrapApiData<T>(response: AxiosResponse<ApiResponse<T>>): T {
  const body = response.data
  if (body.success) return body.data

  throw new ApiClientError({
    code: body.error.code,
    message: body.error.message,
    status: response.status,
    details: body.error.details,
    requestId: body.error.requestId,
  })
}
