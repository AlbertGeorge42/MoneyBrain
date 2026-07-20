import { Decimal } from '@prisma/client/runtime/library.js'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { AppError } from './error.js'
import { rootLogger } from './logger/index.js'

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: unknown
  }
  timestamp: string
}

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

const convertDecimals = (obj: unknown): unknown => {
  if (obj === null || obj === undefined) {
    return obj
  }
  if (obj instanceof Decimal) {
    return obj.toNumber()
  }
  if (obj instanceof Date) {
    return obj.toISOString()
  }
  if (Array.isArray(obj)) {
    return obj.map(convertDecimals)
  }
  if (typeof obj === 'object' && obj.constructor === Object) {
    const converted: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertDecimals(value)
    }
    return converted
  }
  return obj
}

export const success = <T>(res: Response, data: T, statusCode = 200) => {
  const convertedData = convertDecimals(data)
  const response: ApiResponse<T> = {
    success: true,
    data: convertedData as T,
    timestamp: new Date().toISOString(),
  }
  return res.status(statusCode).json(response)
}

export const error = (
  res: Response,
  message: string,
  code = 'INTERNAL_ERROR',
  statusCode = 500
) => {
  const response: ApiResponse = {
    success: false,
    error: {
      code,
      message,
    },
    timestamp: new Date().toISOString(),
  }
  return res.status(statusCode).json(response)
}

export const notFound = (res: Response, message = '资源不存在') => {
  return error(res, message, 'NOT_FOUND', 404)
}

type ErrorResponse = {
  message: string
  code: string
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

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
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
  }, 'request failed')

  if (err instanceof AppError) {
    return error(res, err.message, err.code, err.statusCode)
  }

  const prismaError = mapPrismaError(err)
  if (prismaError) {
    return error(res, prismaError.message, prismaError.code, prismaError.statusCode)
  }

  const resStatusCode = (err as Error & { statusCode?: number }).statusCode || 500
  const code = (err as Error & { code?: string }).code || 'INTERNAL_ERROR'
  const message = err.message || '服务器内部错误'

  return error(res, message, code, resStatusCode)
}
