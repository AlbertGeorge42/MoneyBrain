import { Router, type Request } from 'express'
import { prisma } from '../index.js'
import { success } from '../utils/response.js'
import { NotFoundError, ValidationError } from '../errors/index.js'
import { validateRequest } from '../middleware/validate-request.js'
import { asyncHandler } from '../utils/async-handler.js'
import {
  adjustAccountBalance,
  batchAdjustAccountBalances,
  createAccount,
  deleteAccount,
  getAccountDetail,
  getAccounts,
  getAccountStats,
  updateAccountProfile,
  updateAccountSorts,
} from '../services/account.service.js'

const router = Router()

const hasValue = (value: unknown) => value !== undefined && value !== null && value !== ''

const validateIdParam = (req: Request) => {
  if (!hasValue(req.params.id)) {
    throw new ValidationError('id不能为空')
  }
}

const validateCreateAccount = (req: Request) => {
  const { name, type } = req.body as Record<string, unknown>
  if (!hasValue(name) || !hasValue(type)) {
    throw new ValidationError('名称和类型不能为空')
  }
}

const validateBatchSort = (req: Request) => {
  if (!Array.isArray(req.body?.items)) {
    throw new ValidationError('参数格式错误')
  }
}

const validateAdjustRequest = (req: Request) => {
  validateIdParam(req)
  if (!hasValue(req.body?.amount)) {
    throw new ValidationError('调整金额不能为空')
  }
}

const validateBatchAdjust = (req: Request) => {
  if (!Array.isArray(req.body?.adjustments) || req.body.adjustments.length === 0) {
    throw new ValidationError('调整数据不能为空')
  }
}

router.get('/', asyncHandler(async (_req, res) => {
  const accounts = await getAccounts()
  return success(res, accounts)
}))

// 批量更新账户排序（必须在 /:id 之前）
router.put('/sort/batch', validateRequest(validateBatchSort), asyncHandler(async (req, res) => {
  await updateAccountSorts(req.body.items)
  return success(res, { message: '排序更新成功' })
}))

router.get('/:id', validateRequest(validateIdParam), asyncHandler(async (req, res) => {
  const account = await getAccountDetail(req.params.id)
  if (!account) {
    throw new NotFoundError('账户')
  }
  return success(res, account)
}))

// 获取账户统计信息
router.get('/:id/stats', validateRequest(validateIdParam), asyncHandler(async (req, res) => {
  const account = await getAccountDetail(req.params.id)
  if (!account) {
    throw new NotFoundError('账户')
  }
  const stats = await getAccountStats(req.params.id)
  return success(res, stats)
}))

router.post('/', validateRequest(validateCreateAccount), asyncHandler(async (req, res) => {
  const account = await createAccount(req.body)
  return success(res, account, 201)
}))

router.put('/:id', validateRequest(validateIdParam), asyncHandler(async (req, res) => {
  const account = await updateAccountProfile(req.params.id, req.body)
  return success(res, account)
}))

router.delete('/:id', validateRequest(validateIdParam), asyncHandler(async (req, res) => {
  const result = await deleteAccount(req.params.id, req.query.force === 'true')
  return success(res, result)
}))

// 平账接口
router.post('/:id/adjust', validateRequest(validateAdjustRequest), asyncHandler(async (req, res) => {
  const result = await adjustAccountBalance(req.params.id, req.body.amount, req.body.date, req.body.note)
  return success(res, result, 201)
}))

// 批量平账接口
router.post('/batch-adjust', validateRequest(validateBatchAdjust), asyncHandler(async (req, res) => {
  const result = await batchAdjustAccountBalances(req.body.adjustments, req.body.date, req.body.note)
  return success(res, result, 201)
}))

export default router
