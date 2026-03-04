import { Response } from 'express'
import { Decimal } from '@prisma/client/runtime/library.js'

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
  timestamp: string
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

export const badRequest = (res: Response, message: string) => {
  return error(res, message, 'BAD_REQUEST', 400)
}
