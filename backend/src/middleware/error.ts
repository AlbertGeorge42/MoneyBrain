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
