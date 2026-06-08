import { prisma } from '../index.js'
import { NotFoundError, ValidationError } from '../common/index.js'
import { toDecimal, ZERO } from '../common/index.js'
import { getNextSort } from '../common/db.js'

export async function getNextAccountSort(categoryId: string | null): Promise<number> {
  return getNextSort('account', { categoryId: categoryId || null })
}

type AccountSortItem = {
  id: string
  sort: number
  categoryId: string | null
}

type AccountUpdateData = {
  name?: string
  type?: string
  icon?: string | null
  categoryId?: string | null
  initialBalance?: number
  initialBalanceDate?: string
}

export async function getAccounts(params?: { type?: string; categoryId?: string }) {
  const where: Record<string, unknown> = {}
  if (params?.type) where.type = params.type
  if (params?.categoryId) where.categoryId = params.categoryId

  return prisma.account.findMany({
    where,
    include: { category: true },
    orderBy: [{ sort: 'asc' }, { createdAt: 'desc' }],
  })
}

export async function updateAccountSorts(items: AccountSortItem[]): Promise<void> {
  await prisma.$transaction(
    items.map(item =>
      prisma.account.update({
        where: { id: item.id },
        data: { sort: item.sort, categoryId: item.categoryId },
      })
    )
  )
}

export async function getAccountDetail(accountId: string) {
  return prisma.account.findUnique({
    where: { id: accountId },
    include: {
      category: true,
      fromTransactions: {
        take: 10,
        orderBy: { date: 'desc' },
        include: { category: true },
      },
    },
  })
}

export async function createAccount(data: {
  name: string
  type: string
  icon?: string | null
  categoryId?: string | null
  initialBalance?: number
  initialBalanceDate?: string
}) {
  return prisma.account.create({
    data: {
      name: data.name,
      type: data.type,
      initialBalance: data.initialBalance ?? 0,
      initialBalanceDate: data.initialBalanceDate
        ? new Date(`${data.initialBalanceDate}T00:00:00`)
        : new Date(),
      icon: data.icon,
      categoryId: data.categoryId,
    },
    include: { category: true },
  })
}

export async function updateAccountProfile(accountId: string, data: AccountUpdateData) {
  const currentAccount = await prisma.account.findUnique({ where: { id: accountId } })
  if (!currentAccount) {
    throw new NotFoundError('账户')
  }

  const updateData: Record<string, unknown> = {
    name: data.name,
    icon: data.icon,
    initialBalanceDate: data.initialBalanceDate
      ? new Date(`${data.initialBalanceDate}T00:00:00`)
      : undefined,
  }

  if (data.type && data.type !== currentAccount.type) {
    updateData.type = data.type

    if (!data.categoryId) {
      const defaultCategory = await prisma.accountCategory.findFirst({
        where: { type: data.type, parentId: null },
      })
      if (defaultCategory) {
        updateData.categoryId = defaultCategory.id
      }
    } else {
      updateData.categoryId = data.categoryId
    }
  } else {
    updateData.type = data.type
    updateData.categoryId = data.categoryId
  }

  if (data.initialBalance !== undefined) {
    updateData.initialBalance = data.initialBalance
  }

  return prisma.account.update({
    where: { id: accountId },
    data: updateData,
    include: { category: true },
  })
}

export async function deleteAccount(accountId: string, forceDelete = false) {
  const transactionsCount = await prisma.transaction.count({
    where: { accountId },
  })

  const assetClassesCount = await prisma.investmentAssetClass.count({
    where: { accountId },
  })

  const snapshotsCount = await prisma.investmentAllocationSnapshot.count({
    where: { accountId },
  })

  const hasRelatedData = transactionsCount > 0 || assetClassesCount > 0 || snapshotsCount > 0

  if (!forceDelete && hasRelatedData) {
    const messages: string[] = []
    if (transactionsCount > 0) messages.push(`${transactionsCount} 条交易记录`)
    if (assetClassesCount > 0) messages.push(`${assetClassesCount} 个投资大类`)
    if (snapshotsCount > 0) messages.push(`${snapshotsCount} 个投资快照`)
    throw new ValidationError(`该账户下存在 ${messages.join('、')}，无法删除`)
  }

  if (forceDelete && hasRelatedData) {
    await prisma.$transaction(async (tx) => {
      if (transactionsCount > 0) {
        await tx.transaction.deleteMany({ where: { accountId } })
      }

      if (snapshotsCount > 0) {
        await tx.investmentAllocationItem.deleteMany({
          where: { snapshot: { accountId } },
        })
        await tx.investmentAllocationSnapshot.deleteMany({ where: { accountId } })
      }

      if (assetClassesCount > 0) {
        await tx.investmentAssetClass.deleteMany({ where: { accountId } })
      }

      await tx.account.delete({ where: { id: accountId } })
    })
  } else {
    await prisma.account.delete({ where: { id: accountId } })
  }

  return {
    message: '删除成功',
    deletedTransactions: transactionsCount,
    deletedAssetClasses: assetClassesCount,
    deletedSnapshots: snapshotsCount,
  }
}

export interface AccountStats {
  transactionCount: number
  totalIncome: number
  totalExpense: number
}

export async function getAccountStats(accountId: string): Promise<AccountStats> {
  const [countResult, incomeResult, expenseResult] = await Promise.all([
    prisma.transaction.count({
      where: { accountId, isAdjustment: false },
    }),
    prisma.transaction.aggregate({
      where: { accountId, type: 'income', isAdjustment: false },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { accountId, type: 'expense', isAdjustment: false },
      _sum: { amount: true },
    }),
  ])

  return {
    transactionCount: countResult,
    totalIncome: (incomeResult._sum.amount || ZERO).toNumber(),
    totalExpense: (expenseResult._sum.amount || ZERO).toNumber(),
  }
}

export async function adjustAccountBalance(
  accountId: string,
  amount: number,
  date?: string,
  note?: string,
): Promise<{ transaction: { id: string; amount: import('@prisma/client').Prisma.Decimal; date: Date; note: string; accountId: string; isAdjustment: boolean; account: { id: string; name: string; type: string } } }> {
  const account = await prisma.account.findUnique({ where: { id: accountId } })
  if (!account) throw new NotFoundError('账户')

  const adjustDate = date ? new Date(`${date}T00:00:00`) : new Date()

  const transaction = await prisma.transaction.create({
    data: {
      type: 'adjustment',
      amount: toDecimal(amount),
      date: adjustDate,
      note: note || '平账调整',
      accountId,
      isAdjustment: true,
    },
    include: { account: true },
  })

  return { transaction }
}

export async function batchAdjustAccountBalances(
  adjustments: Array<{ accountId: string; amount: number }>,
  date?: string,
  note?: string,
): Promise<{ date: Date; count: number; adjustments: Array<{ accountId: string; accountName: string; amount: number; transactionId: string }> }> {
  const adjustDate = date ? new Date(`${date}T00:00:00`) : new Date()

  const validAdjustments = adjustments.filter(adj => adj.amount !== 0)
  if (validAdjustments.length === 0) {
    return { date: adjustDate, count: 0, adjustments: [] }
  }

  const accountIds = validAdjustments.map(adj => adj.accountId)
  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds } },
  })
  const accountMap = new Map(accounts.map(a => [a.id, a]))

  const transactionCreates = validAdjustments
    .filter(adj => accountMap.has(adj.accountId))
    .map(adj => ({
      type: 'adjustment' as const,
      amount: toDecimal(adj.amount),
      date: adjustDate,
      note: note || '批量平账调整',
      accountId: adj.accountId,
      isAdjustment: true,
    }))

  if (transactionCreates.length === 0) {
    return { date: adjustDate, count: 0, adjustments: [] }
  }

  // 用 $transaction 包裹单条 create，保证 ID 顺序与 transactionCreates 完全对齐
  // 任何一条失败整体回滚；同时省掉 createMany 之后再 findMany 找回 ID 的脆弱查询
  const createdTxList = await prisma.$transaction(
    transactionCreates.map(data =>
      prisma.transaction.create({ data, include: { account: true } })
    )
  )

  const results = transactionCreates.map((txData, i) => {
    const account = accountMap.get(txData.accountId)!
    return {
      accountId: txData.accountId,
      accountName: account.name,
      amount: txData.amount.toNumber(),
      transactionId: createdTxList[i]?.id ?? '',
    }
  })

  return { date: adjustDate, count: createdTxList.length, adjustments: results }
}
