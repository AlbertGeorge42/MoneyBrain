import type { Request } from 'express'
import { ValidationError } from './error.js'
import { hasValue } from './utils.js'

export const validateIdParam = (req: Request): void => {
  if (!hasValue(req.params.id)) {
    throw new ValidationError('id不能为空')
  }
}

export const validateBatchSort = (req: Request): void => {
  if (!Array.isArray(req.body?.items)) {
    throw new ValidationError('参数格式错误')
  }
}

export const validateDateRange = (req: Request): void => {
  if (!hasValue(req.query.startDate) || !hasValue(req.query.endDate)) {
    throw new ValidationError('请提供开始日期和结束日期')
  }
}

export const validateDateQuery = (req: Request): void => {
  if (!hasValue(req.query.date)) {
    throw new ValidationError('请提供日期参数')
  }
}

export const validateTypeQuery = (req: Request): void => {
  if (!hasValue(req.query.type)) {
    throw new ValidationError('请指定类型(income/expense)')
  }
}
