import axios from 'axios'
import type { ApiError, ApiErrorCode } from '@contracts/types'

/** 全部合法错误码，运行时校验用 */
const API_ERROR_CODES: readonly string[] = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'DUPLICATE_ERROR',
  'FOREIGN_KEY_ERROR',
  'CONFLICT',
  'INTERNAL_ERROR',
  'NETWORK_ERROR',
  'UNKNOWN',
]

const isApiErrorCode = (value: string): value is ApiErrorCode =>
  API_ERROR_CODES.includes(value)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export interface ApiClientErrorInit {
  code: ApiErrorCode
  message: string
  /** HTTP 状态码；网络错误没有状态码 */
  status?: number
  details?: unknown
  requestId?: string
  /** 归一化前的原始异常（axios error 等） */
  originalError?: unknown
}

/**
 * 前端统一的 API 异常。
 * 所有请求失败都会以该类型抛出，页面只需读取 code / message / requestId。
 */
export class ApiClientError extends Error {
  readonly code: ApiErrorCode
  readonly status: number | undefined
  readonly details: unknown
  readonly requestId: string | undefined
  readonly originalError: unknown

  constructor(init: ApiClientErrorInit) {
    super(init.message)
    this.name = 'ApiClientError'
    this.code = init.code
    this.status = init.status
    this.details = init.details
    this.requestId = init.requestId
    this.originalError = init.originalError
  }
}

/** 从后端响应体中解析错误信息 */
const parseApiErrorBody = (data: unknown): ApiError | null => {
  if (!isRecord(data)) return null
  const payload = data.error
  if (!isRecord(payload)) return null

  const code = typeof payload.code === 'string' && isApiErrorCode(payload.code)
    ? payload.code
    : 'UNKNOWN'
  const message = typeof payload.message === 'string' ? payload.message : ''
  const requestId = typeof payload.requestId === 'string' ? payload.requestId : undefined

  return { code, message, details: payload.details, requestId }
}

/**
 * 把任意异常归一化为 ApiClientError。
 * - 后端业务错误：透传 code / message / details / requestId
 * - 网络不可达 / 超时：统一为 NETWORK_ERROR
 * - 其它未知异常：UNKNOWN
 */
export const normalizeApiError = (error: unknown): ApiClientError => {
  if (error instanceof ApiClientError) return error

  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    const parsed = parseApiErrorBody(error.response?.data)
    if (parsed) {
      return new ApiClientError({
        code: parsed.code,
        message: parsed.message || error.message || '请求失败',
        status,
        details: parsed.details,
        requestId: parsed.requestId,
        originalError: error,
      })
    }

    if (error.code === 'ECONNABORTED') {
      return new ApiClientError({
        code: 'NETWORK_ERROR',
        message: '请求超时，请确认后端服务正常运行',
        status,
        originalError: error,
      })
    }

    if (!error.response) {
      return new ApiClientError({
        code: 'NETWORK_ERROR',
        message: '无法连接服务器，请确认后端服务已启动',
        status,
        originalError: error,
      })
    }

    return new ApiClientError({
      code: 'INTERNAL_ERROR',
      message: error.message || '请求失败',
      status,
      originalError: error,
    })
  }

  if (error instanceof Error) {
    return new ApiClientError({
      code: 'UNKNOWN',
      message: error.message || '未知错误',
      originalError: error,
    })
  }

  return new ApiClientError({ code: 'UNKNOWN', message: '未知错误', originalError: error })
}

/** 取出可展示给用户的错误文案 */
export const getApiErrorMessage = (
  error: unknown,
  fallback = '请求失败，请稍后重试'
): string => {
  if (error instanceof ApiClientError) return error.message || fallback
  if (error instanceof Error && error.message) return error.message
  return fallback
}

/** 取出请求 ID（用于提示用户反馈问题时定位日志） */
export const getApiErrorRequestId = (error: unknown): string | undefined => {
  if (error instanceof ApiClientError) return error.requestId
  return undefined
}
