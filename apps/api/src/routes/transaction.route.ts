import { Router, type Request } from 'express'
import {
  asyncHandler,
  NotFoundError,
  success,
  validateRequest,
  ValidationError,
  validateIdParam,
  hasValue,
  toStringArray,
  parsePositiveInteger,
  toOptionalDate,
  toDate,
  dayStart,
  nextDay,
  formatDateLocal,
  parseMoney,
  parseOptionalUuid,
} from '../common/index.js'
import {
  getTransactionList,
  getTransactionStats,
  getTransactionById,
  getRefundableTransactions,
  deleteTransaction,
  getEarliestTransactionDate,
  createIncomeExpense,
  createTransfer,
  createRefund,
  updateIncomeExpense,
  updateTransfer,
  updateRefund
} from '../services/transaction.service.js'
import { getDeletedEntityRecycleBin, getRecycleBin, getTransactionHistory } from '../services/audit-event.service.js'
import type { TransactionType } from '../../../../packages/contracts/types/index.js'

const router = Router()

const transactionTypes = new Set<TransactionType>(['income', 'expense', 'transfer', 'refund', 'adjustment'])

const validateTransactionType = (value: unknown): TransactionType => {
  const type = String(value) as TransactionType
  if (!transactionTypes.has(type)) {
    throw new ValidationError('交易类型不合法')
  }
  return type
}

// 解析筛选范围日期（半开区间）：起始 → 本地当天零点（含），结束 → 次日本地零点（不含）。
// 与报表主查询口径一致（date < 目标日次日），不再用 23:59:59.999 表示「当天结束」。
const parseRangeDate = (v: unknown, isEnd: boolean): Date | undefined => {
  if (!hasValue(v)) return undefined
  const s = String(v)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(new Date(s).getTime())) {
    throw new ValidationError('日期格式无效，请使用 YYYY-MM-DD 格式')
  }
  return isEnd ? nextDay(s) : dayStart(s)
}

/** 金额筛选参数：整数分，非负。 */
const toOptionalMinor = (v: unknown, label: string): number | undefined => {
  if (!hasValue(v)) return undefined
  const raw = String(v)
  if (!/^\d+$/.test(raw)) {
    throw new ValidationError(`${label}必须是整数分`)
  }
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed)) {
    throw new ValidationError(`${label}超出范围`)
  }
  return parsed
}

const validateListQuery = (req: Request) => {
  parsePositiveInteger(req.query.page, 'page', 1)
  parsePositiveInteger(req.query.pageSize, 'pageSize', 20)
  parseRangeDate(req.query.startDate, false)
  parseRangeDate(req.query.endDate, true)
  const from = parseRangeDate(req.query.from, false)
  const to = parseRangeDate(req.query.to, true)
  if (from && to && from.getTime() >= to.getTime()) {
    throw new ValidationError('开始日期不能晚于结束日期')
  }
  if (hasValue(req.query.keyword)) {
    const keyword = String(req.query.keyword).trim()
    if (keyword.length > 100) {
      throw new ValidationError('关键词不能超过 100 个字符')
    }
  }
  const amountMin = toOptionalMinor(req.query.amountMin, '最小金额')
  const amountMax = toOptionalMinor(req.query.amountMax, '最大金额')
  if (amountMin !== undefined && amountMax !== undefined && amountMin > amountMax) {
    throw new ValidationError('最小金额不能大于最大金额')
  }
}

const validateStatsQuery = (req: Request) => {
  parseRangeDate(req.query.startDate, false)
  parseRangeDate(req.query.endDate, true)
}

/** 金额统一按「整数分」校验；未传的字段交给 service 的默认值。 */
const validateMoneyFields = (body: Record<string, unknown>) => {
  for (const [field, label] of [['amount', '金额'], ['fee', '手续费'], ['coupon', '优惠券']] as const) {
    if (body[field] === undefined || body[field] === null) continue
    parseMoney(body[field], label)
  }
}

const validateCreateTransaction = (req: Request) => {
  const { type, amount, date, accountId, categoryId, toAccountId } = req.body as Record<string, unknown>
  parseOptionalUuid((req.body as Record<string, unknown>).id, 'id')
  const transactionType = validateTransactionType(type)

  if (!hasValue(amount) || !hasValue(date) || !hasValue(accountId)) {
    throw new ValidationError('缺少必要参数')
  }

  validateMoneyFields(req.body as Record<string, unknown>)
  toDate(date, 'date')

  // 退款可合法地不关联原交易：仍按退款类型记账，只是不参与收入/支出冲减。
  if (transactionType === 'refund') {
    return
  }

  if (transactionType === 'transfer') {
    if (!hasValue(toAccountId)) {
      throw new ValidationError('缺少必要参数')
    }
    if (String(accountId) === String(toAccountId)) {
      throw new ValidationError('转出账户和转入账户不能相同')
    }
    return
  }

  // adjustment 类型不需要 categoryId
  if (transactionType === 'adjustment') {
    return
  }

  if (!hasValue(categoryId)) {
    throw new ValidationError('缺少必要参数')
  }
}

const validateUpdateTransaction = (req: Request) => {
  validateIdParam(req)

  const { type, date, accountId, toAccountId } = req.body as Record<string, unknown>

  validateMoneyFields(req.body as Record<string, unknown>)

  if (hasValue(type)) {
    validateTransactionType(type)
  }

  if (hasValue(date)) {
    toDate(date, 'date')
  }

  if (hasValue(accountId) && hasValue(toAccountId) && String(accountId) === String(toAccountId)) {
    throw new ValidationError('转出账户和转入账户不能相同')
  }
}

router.get('/', validateRequest(validateListQuery), asyncHandler(async (req, res) => {
  const result = await getTransactionList({
    page: parsePositiveInteger(req.query.page, 'page', 1),
    pageSize: parsePositiveInteger(req.query.pageSize, 'pageSize', 20),
    accountId: toStringArray(req.query.accountId),
    categoryId: toStringArray(req.query.categoryId),
    type: toStringArray(req.query.type),
    startDate: parseRangeDate(req.query.startDate, false),
    endDate: parseRangeDate(req.query.endDate, true),
    from: parseRangeDate(req.query.from, false),
    to: parseRangeDate(req.query.to, true),
    keyword: hasValue(req.query.keyword) ? String(req.query.keyword).trim() : undefined,
    amountMin: toOptionalMinor(req.query.amountMin, '最小金额'),
    amountMax: toOptionalMinor(req.query.amountMax, '最大金额'),
  })

  return success(res, result)
}))

router.get('/stats', validateRequest(validateStatsQuery), asyncHandler(async (req, res) => {
  const stats = await getTransactionStats({
    accountId: toStringArray(req.query.accountId),
    categoryId: toStringArray(req.query.categoryId),
    type: toStringArray(req.query.type),
    startDate: parseRangeDate(req.query.startDate, false),
    endDate: parseRangeDate(req.query.endDate, true),
    includeExcluded: req.query.includeExcluded === 'true',
  })

  return success(res, stats)
}))

router.get('/earliest', asyncHandler(async (_req, res) => {
  const date = await getEarliestTransactionDate()
  return success(res, { date: date ? formatDateLocal(date) : null })
}))

router.get('/refundable/list', asyncHandler(async (_req, res) => {
  const transactions = await getRefundableTransactions()
  return success(res, transactions)
}))

// 回收站（B2-4）：已删除交易可查，恢复走统一的撤销端点
// 账户 / 分类是硬删除，另有审计事件找回；响应里带 accounts / categories 两个列表。
router.get('/recycle-bin', asyncHandler(async (_req, res) => {
  const [list, entities] = await Promise.all([getRecycleBin(), getDeletedEntityRecycleBin()])
  return success(res, { list, ...entities })
}))

// 详情页修改历史（B2-4）
router.get('/:id/history', validateRequest(validateIdParam), asyncHandler(async (req, res) => {
  const history = await getTransactionHistory(req.params.id)
  return success(res, { list: history })
}))

router.post('/', validateRequest(validateCreateTransaction), asyncHandler(async (req, res) => {
  const { id, type, amount, fee = 0, coupon = 0, date, note, accountId, categoryId, toAccountId, relatedTransactionId, excludeFromIncomeExpense } = req.body
  const parsedDate = toDate(date, 'date')

  if (type === 'refund') {
    const result = await createRefund({
      id,
      amount,
      fee,
      coupon,
      date: parsedDate,
      note,
      accountId,
      categoryId,
      relatedTransactionId: relatedTransactionId ?? undefined,
      excludeFromIncomeExpense,
    })
    return success(res, result, 201)
  }

  if (type === 'transfer') {
    const result = await createTransfer({
      id,
      amount,
      fee,
      coupon,
      date: parsedDate,
      note,
      accountId,
      toAccountId,
      categoryId,
      excludeFromIncomeExpense,
    })
    return success(res, result, 201)
  }

  const result = await createIncomeExpense({
    id,
    type,
    amount,
    fee,
    coupon,
    date: parsedDate,
    note,
    accountId,
    categoryId: type === 'adjustment' ? null : categoryId,
    excludeFromIncomeExpense,
  })

  return success(res, result, 201)
}))

router.put('/:id', validateRequest(validateUpdateTransaction), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { type, amount, fee = 0, coupon = 0, date, note, accountId, categoryId, toAccountId, relatedTransactionId, excludeFromIncomeExpense } = req.body

  const oldTransaction = await getTransactionById(id)
  if (!oldTransaction) {
    throw new NotFoundError('交易记录')
  }

  const parsedDate = toOptionalDate(date, 'date')

  if (oldTransaction.type === 'transfer') {
    if (hasValue(type) && type !== 'transfer') {
      throw new ValidationError('转账记录不能修改为其他类型')
    }

    const result = await updateTransfer(id, {
      amount,
      fee,
      coupon,
      date: parsedDate,
      note,
      accountId,
      toAccountId,
      categoryId,
      excludeFromIncomeExpense,
    })

    return success(res, result)
  }

  if (oldTransaction.type === 'refund') {
    if (hasValue(type) && type !== 'refund') {
      throw new ValidationError('退款记录不能修改为其他类型')
    }

    const result = await updateRefund(id, {
      amount,
      fee,
      coupon,
      date: parsedDate,
      note,
      accountId,
      categoryId,
      relatedTransactionId,
      excludeFromIncomeExpense,
    })

    return success(res, result)
  }

  if (oldTransaction.type === 'adjustment') {
    if (hasValue(type) && type !== 'adjustment') {
      throw new ValidationError('平账记录不能修改为其他类型')
    }

    const result = await updateIncomeExpense(id, {
      type: 'adjustment',
      amount,
      fee: 0,
      coupon: 0,
      date: parsedDate,
      note,
      accountId,
      categoryId: null,
      excludeFromIncomeExpense,
    })

    return success(res, result)
  }

  if (hasValue(type) && type !== 'income' && type !== 'expense') {
    throw new ValidationError('普通交易只能修改为收入或支出')
  }

  const result = await updateIncomeExpense(id, {
    type,
    amount,
    fee,
    coupon,
    date: parsedDate,
    note,
    accountId,
    categoryId,
    excludeFromIncomeExpense,
  })

  return success(res, result)
}))

router.delete('/:id', validateRequest(validateIdParam), asyncHandler(async (req, res) => {
  const { auditEventId } = await deleteTransaction(req.params.id)
  // 不做二次确认：前端提示「已删除 · 撤销」，撤销 = 反向写入这条审计事件
  return success(res, { message: '删除成功', auditEventId })
}))

export default router
