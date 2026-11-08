import type { Request } from 'express'
import {
  isLocalDate,
  minor,
  today,
  type LocalDate,
  type Minor,
} from '../../../../packages/domain/src/index.js'
import {
  CATEGORY_ICON_KEYS,
  isCategoryIconKey,
} from '../../../../packages/contracts/constants.js'
import type { ProjectionGranularity, ProjectionWindowMonths } from '../../../../packages/contracts/types/index.js'
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * 客户端预生成的同步 ID（UUID）。缺省时返回 undefined，让 Prisma 继续生成；
 * 一旦提供就必须是合法 UUID——否则同一记录会拿到两个无法对齐的标识。
 */
export const parseOptionalUuid = (value: unknown, fieldName = 'id'): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new ValidationError(`${fieldName}必须是 UUID`)
  }
  return value
}

/**
 * 可选的分类图标 key。
 * - 缺省：不修改（更新场景）
 * - null / 空串：清空，回退到按名称映射
 * - 其他：必须命中受控枚举，否则明确报错，绝不静默落库
 */
export const parseOptionalIconKey = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (!isCategoryIconKey(value)) {
    throw new ValidationError(`图标只支持以下取值：${CATEGORY_ICON_KEYS.join('、')}`)
  }
  return value
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

// ===== 推演参数 =====

/** 推演窗口月份：1–12 的整数（缺省 12）。旧入口仍只传 3 / 6 / 12。 */
export const parseProjectionMonths = (value: unknown): ProjectionWindowMonths => {
  if (value === undefined || value === null || value === '') return 12
  if (typeof value !== 'string') {
    throw new ValidationError('months 必须是 1–12 的整数')
  }
  const months = Number(value)
  if (!Number.isInteger(months) || months < 1 || months > 12) {
    throw new ValidationError('months 必须是 1–12 的整数')
  }
  return months as ProjectionWindowMonths
}

/** 预算周期额度窗口：1–24 个月（缺省 12）。 */
export const parsePeriodPlanMonths = (value: unknown): number => {
  if (value === undefined || value === null || value === '') return 12
  if (typeof value !== 'string') {
    throw new ValidationError('months 必须是 1–24 的整数')
  }
  const months = Number(value)
  if (!Number.isInteger(months) || months < 1 || months > 24) {
    throw new ValidationError('months 必须是 1–24 的整数')
  }
  return months
}

/** 推演起点：YYYY-MM-DD 日历日（缺省今天）。 */
export const parseAsOfQuery = (value: unknown): LocalDate => {
  if (value === undefined || value === null || value === '') return today()
  if (typeof value !== 'string' || !isLocalDate(value)) {
    throw new ValidationError('asOf 必须是 YYYY-MM-DD')
  }
  return value
}

/** 可选参考日查询参数：YYYY-MM-DD；缺省 undefined（由调用方决定默认值）。 */
export const parseOptionalDateQuery = (
  value: unknown,
  fieldName = 'date',
): LocalDate | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !isLocalDate(value)) {
    throw new ValidationError(`${fieldName} 必须是 YYYY-MM-DD`)
  }
  return value
}

/** 推演来源开关：缺省 true，只接受 true / false。 */
export const parseBooleanQuery = (value: unknown, fieldName: string, fallback: boolean): boolean => {
  if (value === undefined || value === null || value === '') return fallback
  if (value === 'true') return true
  if (value === 'false') return false
  throw new ValidationError(`${fieldName} 只能是 true 或 false`)
}

/** 预算周期额度起始月：YYYY-MM（缺省当前月）。 */
export const parseFromMonthQuery = (value: unknown): string => {
  if (value === undefined || value === null || value === '') {
    return today().slice(0, 7)
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value) || !isLocalDate(`${value}-01`)) {
    throw new ValidationError('fromMonth 必须是 YYYY-MM')
  }
  return value
}

/** 推演输出起始月：YYYY-MM；缺省 undefined（由服务用 asOf 所在月）。 */
export const parseOptionalFromMonthQuery = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value) || !isLocalDate(`${value}-01`)) {
    throw new ValidationError('fromMonth 必须是 YYYY-MM')
  }
  return value
}

/** 推演桶粒度：day / week / month / year（缺省 month）。 */
export const parseProjectionGranularity = (value: unknown): ProjectionGranularity => {
  if (value === undefined || value === null || value === '') return 'month'
  if (value === 'day' || value === 'week' || value === 'month' || value === 'year') return value
  throw new ValidationError('granularity 只支持 day / week / month / year')
}

export interface ProjectionWindowQuery {
  granularity: ProjectionGranularity
  from?: LocalDate
  to?: LocalDate
  fromMonth?: string
  months: ProjectionWindowMonths
}

/**
 * 推演窗口参数（两个投影端点共用）。
 *
 * `from/to + granularity` 是唯一正向入口；不传 from/to 时保留旧入口
 * `fromMonth/months`（阶段 6 删旧面板时一并移除）。
 */
export const parseProjectionWindowQuery = (query: Record<string, unknown>): ProjectionWindowQuery => {
  const granularity = parseProjectionGranularity(query.granularity)
  const from = parseOptionalDateQuery(query.from, 'from')
  const to = parseOptionalDateQuery(query.to, 'to')

  if (from || to) {
    if (!from || !to) throw new ValidationError('from 与 to 必须同时提供')
    if (from > to) throw new ValidationError('from 必须早于或等于 to')
    if (hasValue(query.fromMonth) || hasValue(query.months)) {
      throw new ValidationError('from/to 与 fromMonth/months 不能混用')
    }
    return { granularity, from, to, months: 12 }
  }

  if (granularity !== 'month') {
    throw new ValidationError('day / week / year 粒度必须提供 from 与 to')
  }

  return {
    granularity,
    fromMonth: parseOptionalFromMonthQuery(query.fromMonth),
    months: parseProjectionMonths(query.months),
  }
}
