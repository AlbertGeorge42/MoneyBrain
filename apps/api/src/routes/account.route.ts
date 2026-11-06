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
  parseMoney,
  parseOptionalUuid,
  toDate,
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
import { reconcileAccount } from '../services/reconcile.service.js'

const router = Router()

const validateCreateAccount = (req: Request) => {
  const { name, type, initialBalance } = req.body as Record<string, unknown>
  if (!hasValue(name) || !hasValue(type)) {
    throw new ValidationError('名称和类型不能为空')
  }
  if (hasValue(initialBalance)) {
    parseMoney(initialBalance, '期初余额')
  }
  parseOptionalUuid((req.body as Record<string, unknown>).id, 'id')
}

const validateUpdateAccount = (req: Request) => {
  validateIdParam(req)
  const { initialBalance } = req.body as Record<string, unknown>
  if (hasValue(initialBalance)) {
    parseMoney(initialBalance, '期初余额')
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

const validateReconcile = (req: Request) => {
  validateIdParam(req)
  const { date, actualBalance, note, mode } = req.body as Record<string, unknown>
  if (!hasValue(date)) {
    throw new ValidationError('日期不能为空')
  }
  toDate(date, '日期')
  if (!Number.isInteger(actualBalance)) {
    throw new ValidationError('实际余额必须是整数分')
  }
  if (note !== undefined && typeof note !== 'string') {
    throw new ValidationError('备注必须是字符串')
  }
  if (mode !== undefined && mode !== 'overwrite' && mode !== 'append') {
    throw new ValidationError('mode 只能是 overwrite 或 append')
  }
}

router.post('/:id/reconcile', validateRequest(validateReconcile), asyncHandler(async (req, res) => {
  const { date, actualBalance, note, mode } = req.body
  const result = await reconcileAccount(req.params.id, {
    date,
    actualBalance,
    note,
    mode,
  })
  return success(res, result)
}))

router.post('/', validateRequest(validateCreateAccount), asyncHandler(async (req, res) => {
  const { id, name, type, icon, color, categoryId, initialBalance, initialBalanceDate, sort } = req.body
  const account = await createAccount({
    id,
    name,
    type,
    icon,
    color,
    categoryId,
    initialBalance,
    initialBalanceDate,
    sort,
  })
  return success(res, account, 201)
}))

router.put('/:id', validateRequest(validateUpdateAccount), asyncHandler(async (req, res) => {
  const account = await updateAccountProfile(req.params.id, req.body)
  return success(res, account)
}))

router.delete('/:id', validateRequest(validateIdParam), asyncHandler(async (req, res) => {
  const result = await deleteAccount(req.params.id, req.query.force === 'true')
  return success(res, result)
}))

export default router
