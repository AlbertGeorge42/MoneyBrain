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

  const startDateStr = req.query.startDate as string
  const endDateStr = req.query.endDate as string

  const startDate = new Date(startDateStr)
  const endDate = new Date(endDateStr)

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new ValidationError('日期格式无效，请使用 YYYY-MM-DD 格式')
  }

  const today = new Date()
  today.setHours(23, 59, 59, 999)
  if (startDate > today || endDate > today) {
    throw new ValidationError('日期不能晚于今天')
  }

  if (startDate > endDate) {
    throw new ValidationError('开始日期必须早于或等于结束日期')
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
