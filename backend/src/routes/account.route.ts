import { Router, type Request } from 'express'
import {
  asyncHandler,
  NotFoundError,
  success,
  validateRequest,
  ValidationError,
  validateIdParam,
  validateBatchSort,
  hasValue,
  nextDay,
} from '../common/index.js'
import {
  createAccount,
  deleteAccount,
  getAccountDetail,
  getAccounts,
  getAccountStats,
  updateAccountProfile,
  updateAccountSorts,
} from '../services/account.service.js'
import { calculateBalancesBatch } from '../services/balance.service.js'

const router = Router()

const validateCreateAccount = (req: Request) => {
  const { name, type } = req.body as Record<string, unknown>
  if (!hasValue(name) || !hasValue(type)) {
    throw new ValidationError('名称和类型不能为空')
  }
}

router.get('/', asyncHandler(async (req, res) => {
  const type = typeof req.query.type === 'string' ? req.query.type : undefined
  const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined
  const accounts = await getAccounts({ type, categoryId })
  return success(res, accounts)
}))

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

router.get('/:id/stats', validateRequest(validateIdParam), asyncHandler(async (req, res) => {
  const account = await getAccountDetail(req.params.id)
  if (!account) {
    throw new NotFoundError('账户')
  }
  const stats = await getAccountStats(req.params.id)
  return success(res, stats)
}))

router.get('/:id/balance-at', validateRequest(validateIdParam), asyncHandler(async (req, res) => {
  const account = await getAccountDetail(req.params.id)
  if (!account) {
    throw new NotFoundError('账户')
  }

  const dateStr = req.query.date as string | undefined
  if (!dateStr) {
    throw new ValidationError('缺少 date 参数')
  }

  // 计算下一天的余额，因为 calculateBalancesBatch 使用 lt: targetDate
  const nextDayDate = nextDay(dateStr)

  const balanceCache = await calculateBalancesBatch([req.params.id], [nextDayDate])
  const balance = balanceCache.get(req.params.id, nextDayDate)

  return success(res, {
    accountId: req.params.id,
    date: dateStr,
    balance,
  })
}))

router.post('/', validateRequest(validateCreateAccount), asyncHandler(async (req, res) => {
  const { name, type, icon, categoryId, initialBalance, initialBalanceDate } = req.body
  const account = await createAccount({
    name,
    type,
    icon,
    categoryId,
    initialBalance,
    initialBalanceDate,
  })
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

export default router
