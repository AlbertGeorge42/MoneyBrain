import { Request, Response, NextFunction } from 'express'
import { error } from '../utils/response.js'

export interface AppError extends Error {
  statusCode?: number
  code?: string
}

export const errorHandler = (
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error('Error:', err)

  const statusCode = err.statusCode || 500
  const code = err.code || 'INTERNAL_ERROR'
  const message = err.message || '服务器内部错误'

  return error(res, message, code, statusCode)
}

export const createError = (message: string, statusCode = 500, code = 'INTERNAL_ERROR'): AppError => {
  const err: AppError = new Error(message)
  err.statusCode = statusCode
  err.code = code
  return err
}
