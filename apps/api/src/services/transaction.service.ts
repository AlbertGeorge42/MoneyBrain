import { Prisma } from '@prisma/client'
import { rootLogger } from '../common/index.js'
import { NotFoundError, ValidationError, toMinor } from '../common/index.js'
import { collectDescendantIds } from '../common/tree.js'
import { buildCategoryChildrenMap } from '../common/db.js'
import * as accountRepo from '../db/repositories/account.repository.js'
import * as transactionRepo from '../db/repositories/transaction.repository.js'
import type { TransactionStats } from '../../../../packages/contracts/types/index.js'
import type { TransactionWithRelations } from '../db/repositories/transaction.repository.js'
import { softDeleteWithEvent, updateWithEvent } from './audit-event.service.js'
import { minor, remainingRefundable, summarizeAggregatedFlows, CURRENT_RULE_VERSION, formatCurrency, sum, add, type LedgerTransaction } from '../../../../packages/domain/src/index.js'

const logger = rootLogger.child({ module: 'transaction' })

// ===== 接口定义 =====

export type { TransactionWithRelations } from '../db/repositories/transaction.repository.js'

export interface CreateIncomeExpenseData {
  id?: string // 客户端预生成的同步 ID
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
  id?: string // 客户端预生成的同步 ID
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
  id?: string // 客户端预生成的同步 ID
  amount: number
  fee?: number
  coupon?: number
  date: Date
  note?: string
  accountId: string
  /** 未关联的退款仍可记账；关联时写入原交易并继承其分类/不计收支标记。 */
  relatedTransactionId?: string
  categoryId?: string
  excludeFromIncomeExpense?: boolean // 未关联退款使用传入标记；关联退款跟随原交易
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
  /** null = 解除关联，保留退款记账；字符串 = 重新关联到该原交易。 */
  relatedTransactionId?: string | null
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
  /**
   * 报表下钻期间（半开区间），与报表主查询同一套日期语义：
   * from 当天零点（含），to 次日零点（不含）。两端各自可选；给了 from/to 时优先于 startDate/endDate。
   */
  from?: Date
  to?: Date
  /** 关键词：备注 / 账户名 / 分类名 / 交易方向（支出、收入…）。 */
  keyword?: string
  /** 金额区间，整数分；按绝对值比较。 */
  amountMin?: number
  amountMax?: number
  /** 统计口径：默认排除「不计收支」交易；true = 连它们一起统计。 */
  includeExcluded?: boolean
}

export interface TransactionListResult {
  list: TransactionWithRelations[]
  total: number
  page: number
  pageSize: number
}

// ===== 创建交易 =====

/**
 * 支出金额统一按正数（分）落库。
 *
 * 领域层把支出当作「金额大小」再做减法（packages/domain/src/ledger/rules.v1.ts），
 * 导入也按 `Math.abs` 保存；因此写入边界必须产出同一种符号，否则列表、导出、
 * 同步记录与预算会各拿一套口径（历史 bug：dev.db 里存在 -2800 的支出）。
 *
 * 这里选「取绝对值」而不是「拒绝负数」：旧客户端/旧数据可能仍传负数，
 * 拒绝会让用户直接无法保存；取绝对值与导入行为一致，且不改变业务含义。
 * 非支出类型（收入/转账/退款/调整）原样保留——调整的负号本身就是余额方向。
 */
function normalizeExpenseAmount(type: string, amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new ValidationError('金额必须是有限数字')
  }
  return type === 'expense' ? Math.abs(amount) : amount
}

export async function createIncomeExpense(data: CreateIncomeExpenseData): Promise<TransactionWithRelations> {
  const { id, type, amount, fee = 0, coupon = 0, date, note, accountId, categoryId, excludeFromIncomeExpense } = data

  const transaction = await transactionRepo.createWithRelations({
    id,
    type,
    ruleVersion: CURRENT_RULE_VERSION,
    amount: BigInt(normalizeExpenseAmount(type, amount)),
    fee: BigInt(fee),
    coupon: BigInt(coupon),
    date,
    note,
    accountId,
    categoryId,
    excludeFromIncomeExpense: excludeFromIncomeExpense ?? false,
  })

  logger.debug({ type }, '交易创建')
  return transaction
}

export async function createTransfer(data: CreateTransferData): Promise<TransactionWithRelations> {
  const { id, amount, fee = 0, coupon = 0, date, note, accountId, toAccountId, categoryId, excludeFromIncomeExpense } = data

  const fromAccount = await accountRepo.findById(accountId)
  if (!fromAccount) throw new NotFoundError('转出账户')

  const toAccount = await accountRepo.findById(toAccountId)
  if (!toAccount) throw new NotFoundError('转入账户')

  const transaction = await transactionRepo.createWithRelations({
    id,
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
  })

  logger.debug({ type: 'transfer' }, '交易创建')
  return transaction
}

/**
 * 校验退款目标合法：只有收入/支出可退，金额必须为正。
 * 退款账户可与原账户不同（B4）；但累计退款不得超过原交易金额——
 * 可退余额统一由领域层 remainingRefundable 计算，避免报表/预算第二套口径。
 */
async function assertRefundTarget(original: { type: string }, amount: number): Promise<void> {
  if (original.type !== 'income' && original.type !== 'expense') {
    throw new ValidationError('只有收入或支出交易可以退款')
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ValidationError('退款金额必须大于 0')
  }
}

/** 分 → 「¥1,234.56」；错误文案让用户能直接看出差多少。 */
function formatRefundMoney(amount: number): string {
  return formatCurrency(minor(amount))
}

/**
 * 累计退款上限：本次金额不得超过原额 − 其它有效退款合计。
 * 软删除退款不计入（删除后原交易的「已退款」会回退），撤销恢复后重新计入。
 */
async function assertRefundWithinOriginal(
  original: { id: string; type: string; amount: bigint },
  amount: number,
  excludeRefundId?: string,
): Promise<void> {
  const originalAmount = Number(original.amount)
  const refunded = Number(
    (await transactionRepo.sumActiveRefundAmount(original.id, excludeRefundId))._sum.amount ?? 0n,
  )
  const remaining = Number(remainingRefundable(
    { id: original.id, kind: original.type as 'income' | 'expense', amount: toMinor(original.amount) },
    [{ kind: 'refund', amount: minor(refunded), relatedTransactionId: original.id }],
  ))

  if (amount > remaining) {
    throw new ValidationError(
      `退款金额超出可退余额：原交易 ${formatRefundMoney(originalAmount)}，已退款 ${formatRefundMoney(refunded)}，` +
      `本次可退 ${formatRefundMoney(remaining)}，本次退款 ${formatRefundMoney(amount)}`,
    )
  }
}

export async function createRefund(data: CreateRefundData): Promise<TransactionWithRelations> {
  const { id, amount, fee = 0, coupon = 0, date, note, accountId, relatedTransactionId, categoryId, excludeFromIncomeExpense } = data

  let relatedType: string | null = null
  let nextCategoryId = categoryId ?? null
  let nextExclude = excludeFromIncomeExpense ?? false

  if (relatedTransactionId) {
    const relatedTransaction = await transactionRepo.findById(relatedTransactionId)
    if (!relatedTransaction) throw new NotFoundError('原交易记录')
    await assertRefundTarget(relatedTransaction, amount)
    await assertRefundWithinOriginal(relatedTransaction, amount)
    relatedType = relatedTransaction.type
    // 关联退款必须落在原交易的分类下：报表按退款自身分类冲减、预算按分类子树统计，
    // 两者都靠这一列；若让退款挂在「退款」分类，预算就不会跟着回退。
    nextCategoryId = relatedTransaction.categoryId
    // 退款继承原交易的「不计收支」标记
    nextExclude = relatedTransaction.excludeFromIncomeExpense
  } else {
    // 未关联退款仍要校验金额，避免 0 或负数额写入
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ValidationError('退款金额必须大于 0')
    }
  }

  const transaction = await transactionRepo.createWithRelations({
    id,
    type: 'refund',
    ruleVersion: CURRENT_RULE_VERSION,
    amount: BigInt(amount),
    fee: BigInt(fee),
    coupon: BigInt(coupon),
    date,
    note,
    accountId,
    categoryId: nextCategoryId,
    relatedTransactionId: relatedType ? relatedTransactionId : null,
    relatedType,
    excludeFromIncomeExpense: nextExclude,
  })

  logger.debug({ type: 'refund', linked: Boolean(relatedType) }, '交易创建')
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
  const oldTransaction = await transactionRepo.findById(id)
  if (!oldTransaction) throw new NotFoundError('交易记录')

  // 改类型会反转已有退款的冲减方向（收入退款 ↔ 支出退款），必须先处理退款
  const nextType = data.type || oldTransaction.type
  if (nextType !== oldTransaction.type) {
    const refundCount = await transactionRepo.countIncludingDeleted({ relatedTransactionId: id })
    if (refundCount > 0) {
      throw new ValidationError('该交易存在退款，不能修改交易类型')
    }
  }

  const merged = mergeTransactionData(oldTransaction, data)

  return updateWithEvent(id, oldTransaction, {
    ...merged,
    type: nextType,
    amount: BigInt(normalizeExpenseAmount(nextType, Number(merged.amount))),
  })
}

export async function updateTransfer(id: string, data: UpdateTransferData): Promise<TransactionWithRelations> {
  const oldTransaction = await transactionRepo.findById(id)
  if (!oldTransaction) throw new NotFoundError('交易记录')

  const merged = mergeTransactionData(oldTransaction, data)

  return updateWithEvent(id, oldTransaction, { ...merged, toAccountId: data.toAccountId || oldTransaction.toAccountId! })
}

export async function updateRefund(id: string, data: UpdateRefundData): Promise<TransactionWithRelations> {
  const oldTransaction = await transactionRepo.findById(id)
  if (!oldTransaction) throw new NotFoundError('交易记录')

  const rawRelatedId =
    data.relatedTransactionId !== undefined
      ? data.relatedTransactionId
      : oldTransaction.relatedTransactionId
  const relatedId = rawRelatedId || null

  if (relatedId === id) {
    throw new ValidationError('退款不能关联到自身')
  }

  // 退款冲减方向由 relatedType 决定：换原交易时必须同步，否则报表按旧类型算方向。
  // 累计上限排除本笔（编辑金额/换原交易后仍要重新校验，避免编辑绕过上限）。
  let relatedType: string | null = null
  let relatedCategoryId: string | null = null
  if (relatedId) {
    const original = await transactionRepo.findById(relatedId)
    if (!original) throw new NotFoundError('原交易记录')
    const nextAmount = data.amount ?? Number(oldTransaction.amount)
    await assertRefundTarget(original, nextAmount)
    await assertRefundWithinOriginal(original, nextAmount, id)
    relatedType = original.type
    relatedCategoryId = original.categoryId
  }

  const merged = mergeTransactionData(oldTransaction, data)

  return updateWithEvent(id, oldTransaction, {
    ...merged,
    // 与创建一致：关联退款归属原交易分类，避免预算口径漏冲减
    ...(relatedId ? { categoryId: relatedCategoryId } : {}),
    relatedTransactionId: relatedId ?? null,
    relatedType,
  })
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

  const categoryAccounts = await accountRepo.findMany({
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
  startInclusive?: Date,
  endExclusive?: Date,
) => {
  if (!startInclusive && !endExclusive) {
    return
  }

  where.date = {
    ...(startInclusive ? { gte: startInclusive } : {}),
    ...(endExclusive ? { lt: endExclusive } : {}),
  }
}

/** 关键词里出现的交易方向词，命中时按类型筛。 */
const KEYWORD_TYPE_LABELS: readonly { label: string; type: string }[] = [
  { label: '支出', type: 'expense' },
  { label: '收入', type: 'income' },
  { label: '转账', type: 'transfer' },
  { label: '退款', type: 'refund' },
  { label: '调整', type: 'adjustment' },
]

export const buildTransactionListWhere = async (
  params: TransactionListParams,
): Promise<Prisma.TransactionWhereInput> => {
  const where: Prisma.TransactionWhereInput = {}
  // 多个条件都各自需要 OR 时放进 AND，避免互相覆盖（账户 / 关键词）。
  const and: Prisma.TransactionWhereInput[] = []

  const [accountIds, categoryIds] = await Promise.all([
    resolveAccountIds(params.accountId),
    resolveCategoryIds(params.categoryId),
  ])

  if (accountIds) {
    and.push({ OR: accountIds.flatMap(id => [{ accountId: id }, { toAccountId: id }]) })
  }

  const keyword = params.keyword?.trim()
  if (keyword) {
    const typeMatches = KEYWORD_TYPE_LABELS
      .filter(({ label }) => label.includes(keyword))
      .map(({ type }) => ({ type }))
    and.push({
      OR: [
        { note: { contains: keyword } },
        { account: { name: { contains: keyword } } },
        { category: { name: { contains: keyword } } },
        ...typeMatches,
      ],
    })
  }

  if (and.length > 0) {
    where.AND = and
  }

  if (categoryIds) {
    where.categoryId = { in: categoryIds }
  }

  const types = normalizeStringArray(params.type)
  if (types.length > 0) {
    where.type = { in: types }
  }

  if (params.amountMin !== undefined || params.amountMax !== undefined) {
    where.amount = {
      ...(params.amountMin !== undefined ? { gte: BigInt(params.amountMin) } : {}),
      ...(params.amountMax !== undefined ? { lte: BigInt(params.amountMax) } : {}),
    }
  }

  applyDateRange(where, params.from ?? params.startDate, params.to ?? params.endDate)

  return where
}

export async function getTransactionList(params: TransactionListParams): Promise<TransactionListResult> {
  const {
    page = 1,
    pageSize = 20,
  } = params

  const where = await buildTransactionListWhere(params)

  const total = await transactionRepo.countActive(where)
  const transactions = await transactionRepo.findActive(where, {
    include: transactionRepo.TRANSACTION_RELATIONS,
    // date 精确到毫秒；同毫秒记录用 id 作第二键保证翻页稳定
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
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
    transactionRepo.sumActiveAmountByFlowKind(where),
    transactionRepo.countActive({
      ...where,
      type: 'transfer',
      ...(params.includeExcluded ? {} : { excludeFromIncomeExpense: false }),
    }),
  ])

  const flows = summarizeAggregatedFlows(
    grouped.map((row) => ({
      kind: row.type as LedgerTransaction['kind'],
      relatedType: row.relatedType,
      excludeFromIncomeExpense: row.excludeFromIncomeExpense,
      ruleVersion: row.ruleVersion,
      amount: toMinor(row._sum.amount),
    })),
    { includeExcluded: params.includeExcluded },
  )

  return {
    income: flows.netIncome,
    expense: flows.netExpense,
    refund: add(flows.incomeRefunds, flows.expenseRefunds),
    balance: flows.balance,
    transferCount,
  }
}

export async function getTransactionById(id: string): Promise<TransactionWithRelations | null> {
  return transactionRepo.findByIdWithRelations(id)
}

/**
 * 可关联原交易：收入/支出中仍有可退余额的记录。
 * `refunds` 只含未删除退款，因此删除退款后原交易会自动回到可关联列表。
 */
export async function getRefundableTransactions(): Promise<TransactionWithRelations[]> {
  const list = await transactionRepo.findActive(
    { type: { in: ['income', 'expense'] } },
    {
      include: transactionRepo.TRANSACTION_RELATIONS,
      orderBy: { date: 'desc' },
      take: 200,
    },
  )
  return list.filter((transaction) => {
    const refunded = sum(transaction.refunds.map((refund) => toMinor(refund.amount)))
    return Number(remainingRefundable(
      { id: transaction.id, kind: transaction.type as 'income' | 'expense', amount: toMinor(transaction.amount) },
      [{ kind: 'refund', amount: minor(refunded), relatedTransactionId: transaction.id }],
    )) > 0
  })
}

/**
 * 软删除（B2）：写 deletedAt + 审计事件，不做二次确认，撤销靠审计事件反向写入。
 * 保留不变：存在退款记录（含回收站里的）禁止删除——半条链被软删会让可退额算错。
 */
export async function deleteTransaction(id: string): Promise<{ auditEventId: string }> {
  const transaction = await transactionRepo.findById(id)
  if (!transaction) throw new NotFoundError('交易记录')

  const refundCount = await transactionRepo.countIncludingDeleted({ relatedTransactionId: id })
  if (refundCount > 0) {
    throw new ValidationError('该交易存在退款记录，请先删除退款')
  }

  const auditEventId = await softDeleteWithEvent(transaction)
  logger.debug({ type: transaction.type }, 'transaction deleted')
  return { auditEventId }
}

export async function getEarliestTransactionDate(): Promise<Date | null> {
  return transactionRepo.findEarliestActiveDate()
}
