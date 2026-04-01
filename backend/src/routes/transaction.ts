import { Router, type Request } from 'express'
import { success } from '../utils/response.js'
import { NotFoundError, ValidationError } from '../errors/index.js'
import { validateRequest } from '../middleware/validate-request.js'
import { asyncHandler } from '../utils/async-handler.js'
import { transactionService, createIncomeExpense, createTransfer, createRefund, updateIncomeExpense, updateTransfer, updateRefund } from '../services/transaction.service.js'

const router = Router()

type TransactionType = 'income' | 'expense' | 'transfer' | 'refund'

const transactionTypes = new Set<TransactionType>(['income', 'expense', 'transfer', 'refund'])

const hasValue = (value: unknown) => value !== undefined && value !== null && value !== ''

const toDate = (value: unknown, fieldName: string): Date => {
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`${fieldName}格式错误`)
  }
  return date
}

const toOptionalDate = (value: unknown, fieldName: string): Date | undefined => {
  if (!hasValue(value)) {
    return undefined
  }
  return toDate(value, fieldName)
}

const toStringArray = (value: unknown): string[] | undefined => {
  if (!hasValue(value)) {
    return undefined
  }

  if (Array.isArray(value)) {
    return value.map(item => String(item))
  }

  return [String(value)]
}

const parsePositiveInteger = (value: unknown, fieldName: string, defaultValue: number): number => {
  if (!hasValue(value)) {
    return defaultValue
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError(`${fieldName}必须是正整数`)
  }

  return parsed
}

const validateTransactionType = (value: unknown): TransactionType => {
  const type = String(value) as TransactionType
  if (!transactionTypes.has(type)) {
    throw new ValidationError('交易类型不合法')
  }
  return type
}

const validateListQuery = (req: Request) => {
  parsePositiveInteger(req.query.page, 'page', 1)
  parsePositiveInteger(req.query.pageSize, 'pageSize', 20)
  toOptionalDate(req.query.startDate, 'startDate')
  toOptionalDate(req.query.endDate, 'endDate')
}

const validateStatsQuery = (req: Request) => {
  toOptionalDate(req.query.startDate, 'startDate')
  toOptionalDate(req.query.endDate, 'endDate')
}

const validateIdParam = (req: Request) => {
  if (!hasValue(req.params.id)) {
    throw new ValidationError('id不能为空')
  }
}

const validateCreateTransaction = (req: Request) => {
  const { type, amount, date, accountId, categoryId, toAccountId, relatedTransactionId } = req.body as Record<string, unknown>
  const transactionType = validateTransactionType(type)

  if (!hasValue(amount) || !hasValue(date) || !hasValue(accountId)) {
    throw new ValidationError('缺少必要参数')
  }

  toDate(date, 'date')

  if (transactionType === 'refund') {
    if (!hasValue(relatedTransactionId)) {
      throw new ValidationError('退款交易缺少必要参数')
    }
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

  if (!hasValue(categoryId)) {
    throw new ValidationError('缺少必要参数')
  }
}

const validateUpdateTransaction = (req: Request) => {
  validateIdParam(req)

  const { type, date, accountId, toAccountId } = req.body as Record<string, unknown>

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
  const result = await transactionService.getTransactionList({
    page: parsePositiveInteger(req.query.page, 'page', 1),
    pageSize: parsePositiveInteger(req.query.pageSize, 'pageSize', 20),
    accountId: toStringArray(req.query.accountId),
    categoryId: toStringArray(req.query.categoryId),
    type: toStringArray(req.query.type),
    startDate: toOptionalDate(req.query.startDate, 'startDate'),
    endDate: toOptionalDate(req.query.endDate, 'endDate'),
  })

  return success(res, result)
}))

router.get('/stats', validateRequest(validateStatsQuery), asyncHandler(async (req, res) => {
  const stats = await transactionService.getTransactionStats(
    toOptionalDate(req.query.startDate, 'startDate'),
    toOptionalDate(req.query.endDate, 'endDate'),
  )

  return success(res, stats)
}))

router.get('/refundable/list', asyncHandler(async (_req, res) => {
  const transactions = await transactionService.getRefundableTransactions()
  return success(res, transactions)
}))

router.get('/:id', validateRequest(validateIdParam), asyncHandler(async (req, res) => {
  const transaction = await transactionService.getTransactionById(req.params.id)
  if (!transaction) {
    throw new NotFoundError('交易记录')
  }
  return success(res, transaction)
}))

router.post('/', validateRequest(validateCreateTransaction), asyncHandler(async (req, res) => {
  const { type, amount, fee = 0, coupon = 0, date, note, accountId, categoryId, toAccountId, relatedTransactionId } = req.body
  const parsedDate = toDate(date, 'date')

  if (type === 'refund') {
    const result = await createRefund({
      amount,
      fee,
      coupon,
      date: parsedDate,
      note,
      accountId,
      relatedTransactionId,
    })
    return success(res, result, 201)
  }

  if (type === 'transfer') {
    const result = await createTransfer({
      amount,
      fee,
      coupon,
      date: parsedDate,
      note,
      accountId,
      toAccountId,
      categoryId,
    })
    return success(res, result, 201)
  }

  const result = await createIncomeExpense({
    type,
    amount,
    fee,
    coupon,
    date: parsedDate,
    note,
    accountId,
    categoryId,
  })

  return success(res, result, 201)
}))

router.put('/:id', validateRequest(validateUpdateTransaction), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { type, amount, fee = 0, coupon = 0, date, note, accountId, categoryId, toAccountId, relatedTransactionId } = req.body

  const oldTransaction = await transactionService.getTransactionById(id)
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
  })

  return success(res, result)
}))

router.delete('/:id', validateRequest(validateIdParam), asyncHandler(async (req, res) => {
  await transactionService.deleteTransaction(req.params.id)
  return success(res, { message: '删除成功' })
}))

export default router
