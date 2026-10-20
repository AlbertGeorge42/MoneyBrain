import type { ApiErrorCode } from '../../../../packages/contracts/types/index.js'

/** 全部合法错误码，运行时校验用 */
const API_ERROR_CODES: ReadonlySet<string> = new Set<ApiErrorCode>([
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'DUPLICATE_ERROR',
  'FOREIGN_KEY_ERROR',
  'CONFLICT',
  'INTERNAL_ERROR',
  'NETWORK_ERROR',
  'UNKNOWN',
])

/** 判断字符串是否为受支持的错误码 */
export const isApiErrorCode = (value: string): value is ApiErrorCode => API_ERROR_CODES.has(value)

/** 将任意来源的错误码收敛为受支持的错误码 */
export const toApiErrorCode = (value: string | undefined): ApiErrorCode => {
  if (value && isApiErrorCode(value)) return value
  return 'UNKNOWN'
}

/**
 * 业务错误基类。
 * - code 必须来自统一错误码表，避免前后端各自造码
 * - details 用于携带结构化信息（如字段级校验错误），最终会透传给前端
 */
export class AppError extends Error {
  constructor(
    public message: string,
    public code: ApiErrorCode,
    public statusCode: number = 400,
    public details?: unknown
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource}不存在`, 'NOT_FOUND', 404)
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details)
    this.name = 'ValidationError'
  }
}
