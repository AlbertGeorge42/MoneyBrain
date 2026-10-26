import type { Request } from 'express'
import { minor, type Minor } from '../../../../packages/domain/src/index.js'
import { ValidationError } from './error.js'
import { hasValue } from './utils.js'

/** 传输层金额上限：9e15 分（90 万亿元），远大于个人账本，且不越过 2^53。 */
const MAX_MONEY_MINOR = 9_000_000_000_000_000

/**
 * 校验请求体里的金额：必须是整数分。
 * 不做任何换算——前端送什么单位，这里就收什么单位。
 */
export const parseMoney = (value: unknown, fieldName: string): Minor => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || Math.abs(value) > MAX_MONEY_MINOR) {
    throw new ValidationError(`${fieldName}必须是整数分（单位：分，绝对值不超过 ${MAX_MONEY_MINOR}）`)
  }
  return minor(value)
}

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

/**
 * 破坏性操作必须带确认值。
 * 浏览器弹窗只是第一道防线，服务端这一道才是保证。
 */
export const requireClearConfirm = (req: Request, expected: string): void => {
  const confirm = (req.body as { confirm?: unknown } | undefined)?.confirm
  if (confirm !== expected) {
    throw new ValidationError('缺少确认值，操作已取消')
  }
}
