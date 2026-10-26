import { Decimal } from '@prisma/client/runtime/library.js'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type {
  ApiError,
  ApiErrorCode,
  ApiErrorResponse,
  ApiResponse,
  ApiSuccessResponse,
} from '../../../../packages/contracts/types/index.js'
export type { ApiResponse }
import { AppError, toApiErrorCode } from './error.js'
import { getRequestId } from './request-id.js'
import { rootLogger } from './logger/index.js'
import { toMinor } from './utils.js'

const logger = rootLogger.child({ module: 'errorHandler' })

export const asyncHandler = (handler: RequestHandler): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next)
  }
}

type RequestValidator = (req: Request) => void | Promise<void>

export const validateRequest = (validator: RequestValidator): RequestHandler => {
  return async (req, _res, next) => {
    try {
      await validator(req)
      next()
    } catch (err) {
      next(err)
    }
  }
}

const convertScalars = (obj: unknown): unknown => {
  if (obj === null || obj === undefined) {
    return obj
  }
  // 金额在库里是 BigInt（分），JSON 里必须是 number（分）
  if (typeof obj === 'bigint') {
    return toMinor(obj)
  }
  // 比率字段（如 targetRatio）仍是 Decimal
  if (obj instanceof Decimal) {
    return obj.toNumber()
  }
  if (obj instanceof Date) {
    return obj.toISOString()
  }
  if (Array.isArray(obj)) {
    return obj.map(convertScalars)
  }
  if (typeof obj === 'object' && obj.constructor === Object) {
    const converted: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertScalars(value)
    }
    return converted
  }
  return obj
}

export const success = <T>(res: Response, data: T, statusCode = 200) => {
  const convertedData = convertScalars(data)
  const response: ApiSuccessResponse<T> = {
    success: true,
    data: convertedData as T,
    timestamp: new Date().toISOString(),
  }
  return res.status(statusCode).json(response)
}

interface ErrorOptions {
  /** 结构化补充信息，透传给前端 */
  details?: unknown
  /** 请求 ID，用于前后端对照日志 */
  requestId?: string
}

const error = (
  res: Response,
  message: string,
  code: ApiErrorCode,
  statusCode = 500,
  options: ErrorOptions = {}
): Response => {
  const payload: ApiError = {
    code,
    message,
    ...(options.details === undefined ? {} : { details: options.details }),
    ...(options.requestId === undefined ? {} : { requestId: options.requestId }),
  }
  const response: ApiErrorResponse = {
    success: false,
    error: payload,
    timestamp: new Date().toISOString(),
  }
  return res.status(statusCode).json(response)
}

/**
 * 未匹配到路由时返回统一的 404 信封。
 * 避免 Express 默认的 HTML 错误页破坏「所有 API 响应都是同一信封」的约定。
 */
export const notFoundHandler: RequestHandler = (req, res) => {
  return error(res, `接口不存在：${req.method} ${req.originalUrl}`, 'NOT_FOUND', 404, {
    requestId: getRequestId(req),
  })
}

type ErrorResponse = {
  message: string
  code: ApiErrorCode
  statusCode: number
}

const mapPrismaError = (err: Error): ErrorResponse | null => {
  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaError = err as Error & { code?: string }

    switch (prismaError.code) {
      case 'P2002':
        return { message: '数据已存在，请检查唯一字段', code: 'DUPLICATE_ERROR', statusCode: 409 }
      case 'P2003':
        return { message: '关联数据不存在', code: 'FOREIGN_KEY_ERROR', statusCode: 400 }
      case 'P2011':
        return { message: '必填字段不能为空', code: 'VALIDATION_ERROR', statusCode: 400 }
      case 'P2025':
        return { message: '记录不存在', code: 'NOT_FOUND', statusCode: 404 }
      default:
        return null
    }
  }

  if (err.name === 'PrismaClientValidationError') {
    return { message: '数据验证失败', code: 'VALIDATION_ERROR', statusCode: 400 }
  }

  return null
}

/** 第三方错误可能自带 HTTP 状态码 */
const hasStatusCode = (err: Error): err is Error & { statusCode: number } =>
  'statusCode' in err && typeof err.statusCode === 'number'

/** 第三方错误可能自带业务错误码 */
const hasErrorCode = (err: Error): err is Error & { code: string } =>
  'code' in err && typeof err.code === 'string'

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const requestId = getRequestId(req)
  // Pino 自动展开 Error 对象，同时记录请求信息便于定位
  const statusCode = err instanceof AppError ? err.statusCode : 500
  logger.error({
    err,
    req: {
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
    },
    statusCode,
    requestId,
  }, 'request failed')

  if (err instanceof AppError) {
    return error(res, err.message, err.code, err.statusCode, {
      details: err.details,
      requestId,
    })
  }

  const prismaError = mapPrismaError(err)
  if (prismaError) {
    return error(res, prismaError.message, prismaError.code, prismaError.statusCode, { requestId })
  }

  const resStatusCode = hasStatusCode(err) ? err.statusCode : 500
  const code = hasErrorCode(err) ? toApiErrorCode(err.code) : 'INTERNAL_ERROR'
  const message = err.message || '服务器内部错误'

  return error(res, message, code, resStatusCode, { requestId })
}
