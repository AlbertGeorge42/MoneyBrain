import { Router, type Request } from 'express'
import { success } from '../utils/response.js'
import { ValidationError } from '../errors/index.js'
import { asyncHandler } from '../utils/async-handler.js'
import { validateRequest } from '../middleware/validate-request.js'
import {
  createBudget,
  deleteBudget,
  getBudgetDetail,
  getBudgets,
  getBudgetStatus,
  updateBudget,
} from '../services/budget.service.js'

const router = Router()

const hasValue = (value: unknown) => value !== undefined && value !== null && value !== ''

const validateIdParam = (req: Request) => {
  if (!hasValue(req.params.id)) {
    throw new ValidationError('id不能为空')
  }
}

const toDate = (value: unknown, fieldName: string): Date => {
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`${fieldName}格式错误`)
  }
  return date
}

const validateBudgetPayload = (req: Request) => {
  const { name, amount, period, startDate, endDate } = req.body as Record<string, unknown>
  if (!hasValue(name) || !hasValue(amount) || !hasValue(period)) {
    throw new ValidationError('缺少必要参数')
  }
  if (hasValue(startDate)) {
    toDate(startDate, 'startDate')
  }
  if (hasValue(endDate)) {
    toDate(endDate, 'endDate')
  }
}

router.get('/', asyncHandler(async (req, res) => {
  const budgets = await getBudgets(typeof req.query.period === 'string' ? req.query.period : undefined)
  return success(res, budgets)
}))

router.get('/:id', validateRequest(validateIdParam), asyncHandler(async (req, res) => {
  const budget = await getBudgetDetail(req.params.id)
  return success(res, budget)
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
