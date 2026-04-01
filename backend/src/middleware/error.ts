import { Request, Response, NextFunction } from 'express'
import { error } from '../utils/response.js'
import { AppError } from '../errors/index.js'

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
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error('Error:', err)

  if (err instanceof AppError) {
    return error(res, err.message, err.code, err.statusCode)
  }

  const prismaError = mapPrismaError(err)
  if (prismaError) {
    return error(res, prismaError.message, prismaError.code, prismaError.statusCode)
  }

  const statusCode = (err as any).statusCode || 500
  const code = (err as any).code || 'INTERNAL_ERROR'
  const message = err.message || '服务器内部错误'

  return error(res, message, code, statusCode)
}
