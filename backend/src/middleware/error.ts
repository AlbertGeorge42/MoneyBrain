import { Request, Response, NextFunction } from 'express'
import { error } from '../utils/response.js'
import { AppError } from '../errors/index.js'

export const errorHandler = (
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error('Error:', err)

  if (err instanceof AppError) {
    return error(res, err.message, err.code, err.statusCode)
  }

  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaError = err as any
    if (prismaError.code === 'P2002') {
      return error(res, '数据已存在，请检查唯一字段', 'DUPLICATE_ERROR', 409)
    }
    if (prismaError.code === 'P2025') {
      return error(res, '记录不存在', 'NOT_FOUND', 404)
    }
    if (prismaError.code === 'P2003') {
      return error(res, '关联数据不存在', 'FOREIGN_KEY_ERROR', 400)
    }
  }

  if (err.name === 'PrismaClientValidationError') {
    return error(res, '数据验证失败', 'VALIDATION_ERROR', 400)
  }

  const statusCode = (err as any).statusCode || 500
  const code = (err as any).code || 'INTERNAL_ERROR'
  const message = err.message || '服务器内部错误'

  return error(res, message, code, statusCode)
}
