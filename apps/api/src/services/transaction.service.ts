import { prisma } from '../prisma.js'
import { Prisma } from '@prisma/client'
import { rootLogger } from '../common/index.js'
import type { Transaction, Account, TransactionCategory } from '@prisma/client'
import { NotFoundError, ValidationError } from '../common/index.js'
import { collectDescendantIds } from '../common/tree.js'
import { buildCategoryChildrenMap } from '../common/db.js'
import { formatAmount, minor, remainingRefundable, summarizeAggregatedFlows, CURRENT_RULE_VERSION, type LedgerTransaction } from '../../../../packages/domain/src/index.js'

const logger = rootLogger.child({ module: 'transaction' })

// ===== 接口定义 =====

export interface TransactionWithRelations {
  id: string
  type: string
  ruleVersion: number
  amount: bigint
  fee: bigint | null
  coupon: bigint | null
  date: Date
  note: string | null
  accountId: string
  toAccountId: string | null
  categoryId: string | null
  relatedTransactionId: string | null
  relatedType: string | null
  excludeFromIncomeExpense: boolean
  createdAt: Date
  account: Account
  category: TransactionCategory | null
  toAccount: Account | null
  relatedTransaction: (Transaction & { account: Account; category: TransactionCategory | null }) | null
  refunds: (Transaction & { account: Account; category: TransactionCategory | null })[]
}

export interface CreateIncomeExpenseData {
  type: 'income' | 'expense'
  amount: number
  fee?: number
  coupon?: number
  date: Date
  note?: string
  accountId: string
  categoryId: string
  excludeFromIncomeExpense?: boolean // 不计收支：不参与收入/支出统计
}

export interface CreateTransferData {
  amount: number
  fee?: number
  coupon?: number
  date: Date
  note?: string
  accountId: string
  toAccountId: string
  categoryId?: string
  excludeFromIncomeExpense?: boolean // 不计收支：不参与收入/支出统计
}

export interface CreateRefundData {
  amount: number
  fee?: number
  coupon?: number
  date: Date
  note?: string
  accountId: string
  relatedTransactionId: string
  excludeFromIncomeExpense?: boolean // 手动录入时退款跟随原交易标记，该字段仅作传入兼容
}

export interface UpdateIncomeExpenseData {
  type?: 'income' | 'expense' | 'adjustment'
  amount?: number
  fee?: number
  coupon?: number
  date?: Date
  note?: string
  accountId?: string
  categoryId?: string | null
  excludeFromIncomeExpense?: boolean // 不计收支：不参与收入/支出统计
}

export interface UpdateTransferData {
  amount?: number
  fee?: number
  coupon?: number
  date?: Date
  note?: string
  accountId?: string
  toAccountId?: string
  categoryId?: string
  excludeFromIncomeExpense?: boolean // 不计收支：不参与收入/支出统计
}

export interface UpdateRefundData {
  amount?: number
  fee?: number
  coupon?: number
  date?: Date
  note?: string
  accountId?: string
  categoryId?: string
  relatedTransactionId?: string
  excludeFromIncomeExpense?: boolean // 不计收支：不参与收入/支出统计
}

export interface TransactionListParams {
  page?: number
  pageSize?: number
  accountId?: string | string[]
  categoryId?: string | string[]
  type?: string | string[]
  startDate?: Date
  endDate?: Date
}

export interface TransactionListResult {
  list: TransactionWithRelations[]
  total: number
  page: number
  pageSize: number
}

export interface TransactionStats {
  income: number
  expense: number
  refund: number
  balance: number
  transferCount: number
}

/** 交易返回给前端时固定带上的关联，避免各处 include 漂移。 */
const TRANSACTION_RELATIONS = {
  account: true,
  category: true,
  toAccount: true,
  relatedTransaction: { include: { account: true, category: true } },
  refunds: { include: { account: true, category: true } },
} satisfies Prisma.TransactionInclude

// ===== 创建交易 =====

export async function createIncomeExpense(data: CreateIncomeExpenseData): Promise<TransactionWithRelations> {
  const { type, amount, fee = 0, coupon = 0, date, note, accountId, categoryId, excludeFromIncomeExpense } = data

  const transaction = await prisma.transaction.create({
    data: {
      type,
      ruleVersion: CURRENT_RULE_VERSION,
      amount: BigInt(amount),
      fee: BigInt(fee),
      coupon: BigInt(coupon),
      date,
      note,
      accountId,
      categoryId,
      excludeFromIncomeExpense: excludeFromIncomeExpense ?? false,
    },
    include: TRANSACTION_RELATIONS,
  })

  logger.debug({ type }, '交易创建')
  return transaction
}

export async function createTransfer(data: CreateTransferData): Promise<TransactionWithRelations> {
  const { amount, fee = 0, coupon = 0, date, note, accountId, toAccountId, categoryId, excludeFromIncomeExpense } = data

  const fromAccount = await prisma.account.findUnique({ where: { id: accountId } })
  if (!fromAccount) throw new NotFoundError('转出账户')

  const toAccount = await prisma.account.findUnique({ where: { id: toAccountId } })
  if (!toAccount) throw new NotFoundError('转入账户')

  const transaction = await prisma.transaction.create({
    data: {
      type: 'transfer',
      ruleVersion: CURRENT_RULE_VERSION,
      amount: BigInt(amount),
      fee: BigInt(fee),
      coupon: BigInt(coupon),
      date,
      note,
      accountId,
      toAccountId,
      categoryId,
      excludeFromIncomeExpense: excludeFromIncomeExpense ?? false,
    },
    include: TRANSACTION_RELATIONS,
  })

  logger.debug({ type: 'transfer' }, '交易创建')
  return transaction
}

/**
 * 校验退款金额不超过原交易剩余可退金额。
 * 退款是资金的逆向流动，必须从原交易发起，不能凭空创建。
 */
async function assertRefundable(
  original: { id: string; type: string; amount: bigint },
  amount: number,
  excludeRefundId?: string,
): Promise<void> {
  if (original.type !== 'income' && original.type !== 'expense') {
    throw new ValidationError('只有收入或支出交易可以退款')
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ValidationError('退款金额必须大于 0')
  }

  // 可退金额的口径只有领域层这一处：原额 − 已退额
  const refunds = await prisma.transaction.findMany({
    where: {
      type: 'refund',
      relatedTransactionId: original.id,
      ...(excludeRefundId ? { id: { not: excludeRefundId } } : {}),
    },
    select: { type: true, amount: true, relatedTransactionId: true },
  })

  const remaining = remainingRefundable(
    { id: original.id, kind: original.type, amount: minor(Number(original.amount)) },
    refunds.map((refund) => ({
      kind: refund.type,
      amount: minor(Number(refund.amount)),
      relatedTransactionId: refund.relatedTransactionId,
    })),
  )

  if (amount > remaining) {
    throw new ValidationError(`退款金额不能超过可退余额 ${formatAmount(remaining)} 元`)
  }
}

export async function createRefund(data: CreateRefundData): Promise<TransactionWithRelations> {
  const { amount, fee = 0, coupon = 0, date, note, accountId, relatedTransactionId } = data

  const relatedTransaction = await prisma.transaction.findUnique({ where: { id: relatedTransactionId } })
  if (!relatedTransaction) throw new NotFoundError('原交易记录')
  await assertRefundable(relatedTransaction, amount)

  const transaction = await prisma.transaction.create({
    data: {
      type: 'refund',
      ruleVersion: CURRENT_RULE_VERSION,
      amount: BigInt(amount),
      fee: BigInt(fee),
      coupon: BigInt(coupon),
      date,
      note,
      accountId,
      categoryId: relatedTransaction.categoryId,
      relatedTransactionId,
      relatedType: relatedTransaction.type,
      // 退款继承原交易的「不计收支」标记
      excludeFromIncomeExpense: relatedTransaction.excludeFromIncomeExpense,
    },
    include: TRANSACTION_RELATIONS,
  })

  logger.debug({ type: 'refund' }, '交易创建')
  return transaction
}

// ===== 更新交易 =====

// 共享的字段合并逻辑，三个 update 函数复用。
//
// 注意：这里刻意**不**包含 `ruleVersion`——修改一笔交易不会改写它的口径版本，
// 否则「历史数字按写入时的版本解释」就失效了。
function mergeTransactionData(
  old: { amount: bigint; fee: bigint; coupon: bigint; date: Date; note: string | null; accountId: string; categoryId: string | null; excludeFromIncomeExpense: boolean },
  data: { amount?: number; fee?: number; coupon?: number; date?: Date; note?: string; accountId?: string; categoryId?: string | null; excludeFromIncomeExpense?: boolean }
) {
  return {
    amount: data.amount !== undefined ? BigInt(data.amount) : old.amount,
    fee: data.fee !== undefined ? BigInt(data.fee) : old.fee,
    coupon: data.coupon !== undefined ? BigInt(data.coupon) : old.coupon,
    date: data.date || old.date,
    note: data.note !== undefined ? data.note : old.note,
    accountId: data.accountId || old.accountId,
    categoryId: data.categoryId !== undefined ? data.categoryId : old.categoryId,
    excludeFromIncomeExpense: data.excludeFromIncomeExpense !== undefined ? data.excludeFromIncomeExpense : old.excludeFromIncomeExpense,
  }
}

export async function updateIncomeExpense(id: string, data: UpdateIncomeExpenseData): Promise<TransactionWithRelations> {
  const oldTransaction = await prisma.transaction.findUnique({ where: { id } })
  if (!oldTransaction) throw new NotFoundError('交易记录')

  // 改类型会反转已有退款的冲减方向（收入退款 ↔ 支出退款），必须先处理退款
  const nextType = data.type || oldTransaction.type
  if (nextType !== oldTransaction.type) {
    const refundCount = await prisma.transaction.count({ where: { relatedTransactionId: id } })
    if (refundCount > 0) {
      throw new ValidationError('该交易存在退款，不能修改交易类型')
    }
  }

  const merged = mergeTransactionData(oldTransaction, data)

  const transaction = await prisma.transaction.update({
    where: { id },
    data: { ...merged, type: data.type || oldTransaction.type },
    include: TRANSACTION_RELATIONS,
  })

  return transaction
}

export async function updateTransfer(id: string, data: UpdateTransferData): Promise<TransactionWithRelations> {
  const oldTransaction = await prisma.transaction.findUnique({ where: { id } })
  if (!oldTransaction) throw new NotFoundError('交易记录')

  const merged = mergeTransactionData(oldTransaction, data)

  const transaction = await prisma.transaction.update({
    where: { id },
    data: { ...merged, toAccountId: data.toAccountId || oldTransaction.toAccountId! },
    include: TRANSACTION_RELATIONS,
  })

  return transaction
}

export async function updateRefund(id: string, data: UpdateRefundData): Promise<TransactionWithRelations> {
  const oldTransaction = await prisma.transaction.findUnique({ where: { id } })
  if (!oldTransaction) throw new NotFoundError('交易记录')

  const relatedId = data.relatedTransactionId ?? oldTransaction.relatedTransactionId
  if (relatedId) {
    const original = await prisma.transaction.findUnique({ where: { id: relatedId } })
    if (!original) throw new NotFoundError('原交易记录')
    await assertRefundable(original, data.amount ?? Number(oldTransaction.amount), id)
  }

  const merged = mergeTransactionData(oldTransaction, data)

  const transaction = await prisma.transaction.update({
    where: { id },
    data: {
      ...merged,
      relatedTransactionId: data.relatedTransactionId !== undefined ? data.relatedTransactionId : oldTransaction.relatedTransactionId,
    },
    include: TRANSACTION_RELATIONS,
  })

  return transaction
}

// ===== 查询与删除 =====

// ----- 交易列表查询条件构建 -----

const EMPTY_FILTER_ID = '__no_match__'
const ACCOUNT_CATEGORY_PREFIX = 'category_'

const normalizeStringArray = (value?: string | string[]): string[] => {
  if (!value) {
    return []
  }

  return Array.from(new Set(Array.isArray(value) ? value : [value]))
}

const resolveAccountIds = async (accountId?: string | string[]): Promise<string[] | undefined> => {
  const accountIds = normalizeStringArray(accountId)
  if (accountIds.length === 0) {
    return undefined
  }

  const directAccountIds = accountIds.filter(id => !id.startsWith(ACCOUNT_CATEGORY_PREFIX))
  const categoryIds = accountIds
    .filter(id => id.startsWith(ACCOUNT_CATEGORY_PREFIX))
    .map(id => id.slice(ACCOUNT_CATEGORY_PREFIX.length))

  if (categoryIds.length === 0) {
    return directAccountIds.length > 0 ? directAccountIds : [EMPTY_FILTER_ID]
  }

  const categoryAccounts = await prisma.account.findMany({
    where: { categoryId: { in: categoryIds } },
    select: { id: true },
  })

  const resolvedIds = Array.from(new Set([
    ...directAccountIds,
    ...categoryAccounts.map(account => account.id),
  ]))

  return resolvedIds.length > 0 ? resolvedIds : [EMPTY_FILTER_ID]
}

const resolveCategoryIds = async (
  categoryId?: string | string[],
  prebuiltChildrenMap?: Map<string | null, { id: string; parentId: string | null }[]>
): Promise<string[] | undefined> => {
  const categoryIds = normalizeStringArray(categoryId)
  if (categoryIds.length === 0) {
    return undefined
  }

  const childrenMap = prebuiltChildrenMap ?? await buildCategoryChildrenMap()
  const resolvedIds = new Set<string>()

  for (const id of categoryIds) {
    collectDescendantIds(id, childrenMap).forEach(childId => resolvedIds.add(childId))
  }

  return resolvedIds.size > 0 ? Array.from(resolvedIds) : [EMPTY_FILTER_ID]
}

const applyDateRange = (
  where: Prisma.TransactionWhereInput,
  startDate?: Date,
  endDate?: Date,
) => {
  if (!startDate && !endDate) {
    return
  }

  where.date = {
    ...(startDate ? { gte: startDate } : {}),
    ...(endDate ? { lte: endDate } : {}),
  }
}

export const buildTransactionListWhere = async (
  params: TransactionListParams,
): Promise<Prisma.TransactionWhereInput> => {
  const where: Prisma.TransactionWhereInput = {}

  const [accountIds, categoryIds] = await Promise.all([
    resolveAccountIds(params.accountId),
    resolveCategoryIds(params.categoryId),
  ])

  if (accountIds) {
    where.OR = accountIds.flatMap(id => [{ accountId: id }, { toAccountId: id }])
  }

  if (categoryIds) {
    where.categoryId = { in: categoryIds }
  }

  const types = normalizeStringArray(params.type)
  if (types.length > 0) {
    where.type = { in: types }
  }

  applyDateRange(where, params.startDate, params.endDate)

  return where
}

export async function getTransactionList(params: TransactionListParams): Promise<TransactionListResult> {
  const {
    page = 1,
    pageSize = 20,
  } = params

  const where = await buildTransactionListWhere(params)

  const total = await prisma.transaction.count({ where })
  const transactions = await prisma.transaction.findMany({
    where,
    include: {
      ...TRANSACTION_RELATIONS,
      refunds: {
        include: { account: true, category: true },
        orderBy: { date: 'desc' },
      },
    },
    // 同日多笔按创建时间倒序，保证分页排序稳定
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  })

  return {
    list: transactions,
    total,
    page,
    pageSize,
  }
}

export async function getTransactionStats(params: TransactionListParams = {}): Promise<TransactionStats> {
  const where = await buildTransactionListWhere(params)

  // 收支口径统一走领域层：退款按原交易类型冲减、不计收支的交易不参与统计，
  // 且每条交易按自己写入时的口径版本解释。
  //
  // 聚合在 SQL 跑（按类型 × 退款原类型 × 不计收支 × 口径版本分组），
  // 口径仍由领域层按各自版本解释——既避免整表读进内存，
  // 也不会让「当前规则」误伤旧交易。
  const [grouped, transferCount] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['type', 'relatedType', 'excludeFromIncomeExpense', 'ruleVersion'],
      where,
      _sum: { amount: true },
    }),
    prisma.transaction.count({ where: { ...where, type: 'transfer', excludeFromIncomeExpense: false } }),
  ])

  const flows = summarizeAggregatedFlows(
    grouped.map((row) => ({
      kind: row.type as LedgerTransaction['kind'],
      relatedType: row.relatedType,
      excludeFromIncomeExpense: row.excludeFromIncomeExpense,
      ruleVersion: row.ruleVersion,
      amount: minor(Number(row._sum.amount ?? 0)),
    })),
  )

  return {
    income: flows.netIncome,
    expense: flows.netExpense,
    refund: minor(flows.incomeRefunds + flows.expenseRefunds),
    balance: flows.balance,
    transferCount,
  }
}

export async function getTransactionById(id: string): Promise<TransactionWithRelations | null> {
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: {
      ...TRANSACTION_RELATIONS,
      refunds: {
        include: { account: true, category: true },
        orderBy: { date: 'desc' },
      },
    },
  })
  return transaction
}

export async function getRefundableTransactions(): Promise<TransactionWithRelations[]> {
  const transactions = await prisma.transaction.findMany({
    where: { type: { in: ['income', 'expense'] } },
    include: TRANSACTION_RELATIONS,
    orderBy: { date: 'desc' },
    take: 100,
  })
  return transactions
}

export async function deleteTransaction(id: string): Promise<void> {
  const transaction = await prisma.transaction.findUnique({ where: { id } })
  if (!transaction) throw new NotFoundError('交易记录')

  const refundCount = await prisma.transaction.count({ where: { relatedTransactionId: id } })
  if (refundCount > 0) {
    throw new ValidationError('该交易存在退款记录，请先删除退款')
  }

  await prisma.transaction.delete({ where: { id } })
  logger.debug({ type: transaction.type }, 'transaction deleted')
}

export async function getEarliestTransactionDate(): Promise<Date | null> {
  const earliest = await prisma.transaction.findFirst({
    orderBy: { date: 'asc' },
    select: { date: true },
  })
  return earliest?.date || null
}
