import { Router, type Request } from 'express'
import {
  asyncHandler,
  success,
  validateRequest,
  ValidationError,
  validateIdParam,
  hasValue,
  toDate,
} from '../common/index.js'
import {
  createBudget,
  deleteBudget,
  getBudgets,
  getBudgetStatus,
  getBudgetStatusesByIds,
  generatePredictions,
  updateBudget,
} from '../services/budget.service.js'

const router = Router()

const validateBudgetPayload = (req: Request) => {
  const { name, amount, type, period, accountId, startDate, endDate, transactionTime } = req.body as Record<string, unknown>
  if (!hasValue(name) || !hasValue(amount) || !hasValue(type) || !hasValue(period) || !hasValue(accountId)) {
    throw new ValidationError('缺少必要参数(name, amount, type, period, accountId)')
  }
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
  const statuses = await getBudgetStatusesByIds(ids)
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

router.get('/:id/status', validateRequest(validateIdParam), asyncHandler(async (req, res) => {
  const status = await getBudgetStatus(req.params.id)
  return success(res, status)
}))

router.post('/', validateRequest(validateBudgetPayload), asyncHandler(async (req, res) => {
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