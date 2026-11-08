import { Router, type Request } from 'express'
import {
  asyncHandler,
  success,
  validateRequest,
  ValidationError,
  validateIdParam,
  hasValue,
  toDate,
  parseMoney,
  parseOptionalUuid,
  parseFromMonthQuery,
  parseOptionalDateQuery,
  parsePeriodPlanMonths,
  parseAsOfQuery,
  parseProjectionGranularity,
} from '../common/index.js'
import {
  buildBudgetPeriodPlan,
  createBudget,
  deleteBudget,
  getBudgets,
  getBudgetStatusesByIds,
  getBudgetUsageDetails,
  generatePredictions,
  updateBudget,
} from '../services/budget.service.js'

const router = Router()

const validateBudgetPayload = (req: Request) => {
  const { name, amount, type, period, accountId, startDate, endDate, transactionTime } = req.body as Record<string, unknown>
  if (!hasValue(name) || !hasValue(amount) || !hasValue(type) || !hasValue(period) || !hasValue(accountId)) {
    throw new ValidationError('缺少必要参数(name, amount, type, period, accountId)')
  }
  parseMoney(amount, '预算金额')
  if (hasValue(startDate)) {
    toDate(startDate, 'startDate')
  }
  if (hasValue(endDate)) {
    toDate(endDate, 'endDate')
  }
  if (hasValue(transactionTime)) {
    const tt = Number(transactionTime)
    if (isNaN(tt) || tt < 0) {
      throw new ValidationError('transactionTime 必须是非负整数')
    }
  }
}

router.get('/', asyncHandler(async (req, res) => {
  const type = typeof req.query.type === 'string' ? req.query.type : undefined
  const period = typeof req.query.period === 'string' ? req.query.period : undefined
  const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined
  const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined
  const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined
  const budgets = await getBudgets({ type, period, accountId, categoryId, isActive })
  return success(res, budgets)
}))

router.get('/statuses', asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.query.ids) ? req.query.ids as string[]
    : typeof req.query.ids === 'string' ? [req.query.ids]
    : []
  if (ids.length === 0) {
    return success(res, [])
  }
  // 可选参考日：预算页浏览历史月份时按该日所在周期结算；缺省为今天。
  const referenceDate = parseOptionalDateQuery(req.query.date)
  const statuses = await getBudgetStatusesByIds(ids, referenceDate)
  return success(res, statuses)
}))

router.get('/predictions', asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query
  if (!startDate || !endDate) {
    throw new ValidationError('缺少 startDate 或 endDate 参数')
  }
  const predictions = await generatePredictions(String(startDate), String(endDate))
  return success(res, predictions)
}))

// 未来各桶预算计划：支持 from/to + granularity；不传时保留旧 fromMonth/months。
router.get('/period-plan', asyncHandler(async (req, res) => {
  const asOf = parseAsOfQuery(req.query.asOf)
  const granularity = parseProjectionGranularity(req.query.granularity)
  const from = parseOptionalDateQuery(req.query.from, 'from')
  const to = parseOptionalDateQuery(req.query.to, 'to')

  if (from || to) {
    if (!from || !to) throw new ValidationError('from 与 to 必须同时提供')
    if (from > to) throw new ValidationError('from 必须早于或等于 to')
    if (hasValue(req.query.fromMonth) || hasValue(req.query.months)) {
      throw new ValidationError('from/to 与 fromMonth/months 不能混用')
    }
    const plan = await buildBudgetPeriodPlan({ asOf, granularity, from, to })
    return success(res, plan)
  }

  if (granularity !== 'month') {
    throw new ValidationError('day / week / year 粒度必须提供 from 与 to')
  }

  const plan = await buildBudgetPeriodPlan({
    asOf,
    granularity: 'month',
    fromMonth: parseFromMonthQuery(req.query.fromMonth),
    months: parsePeriodPlanMonths(req.query.months),
  })
  return success(res, plan)
}))

// 预算下钻明细（C2）：与用量同一口径，条数与合计 == 预算用量
router.get('/:id/usage-details', validateRequest(validateIdParam), asyncHandler(async (req, res) => {
  const details = await getBudgetUsageDetails(req.params.id)
  return success(res, details)
}))

router.post('/', validateRequest((req) => {
  validateBudgetPayload(req)
  parseOptionalUuid((req.body as Record<string, unknown>).id, 'id')
}), asyncHandler(async (req, res) => {
  const budget = await createBudget(req.body)
  return success(res, budget, 201)
}))

router.put('/:id', validateRequest((req) => {
  validateIdParam(req)
  validateBudgetPayload(req)
}), asyncHandler(async (req, res) => {
  const budget = await updateBudget(req.params.id, req.body)
  return success(res, budget)
}))

router.delete('/:id', validateRequest(validateIdParam), asyncHandler(async (req, res) => {
  const result = await deleteBudget(req.params.id)
  return success(res, result)
}))

export default router