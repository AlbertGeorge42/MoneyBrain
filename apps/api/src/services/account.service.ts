import { prisma } from '../prisma.js'
import { NotFoundError, ValidationError } from '../common/index.js'
import { toMinor } from '../common/index.js'
import type { AccountStats } from '../../../../packages/contracts/types/index.js'

type AccountSortItem = {
  id: string
  sort: number
  categoryId: string | null
}

type AccountUpdateData = {
  name?: string
  type?: string
  icon?: string | null
  color?: string | null
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
  color?: string | null
  categoryId?: string | null
  initialBalance?: number
  initialBalanceDate?: string
}) {
  return prisma.account.create({
    data: {
      name: data.name,
      type: data.type,
      initialBalance: BigInt(data.initialBalance ?? 0),
      initialBalanceDate: data.initialBalanceDate
        ? new Date(`${data.initialBalanceDate}T00:00:00`)
        : new Date(),
      icon: data.icon,
      color: data.color,
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
    initialBalanceDate: data.initialBalanceDate
      ? new Date(`${data.initialBalanceDate}T00:00:00`)
      : undefined,
  }

  if (data.icon !== undefined) {
    updateData.icon = data.icon
  }
  if (data.color !== undefined) {
    updateData.color = data.color
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
    updateData.initialBalance = BigInt(data.initialBalance)
  }

  return prisma.account.update({
    where: { id: accountId },
    data: updateData,
    include: { category: true },
  })
}

export async function deleteAccount(accountId: string, forceDelete = false) {
  const account = await prisma.account.findUnique({ where: { id: accountId } })
  if (!account) {
    throw new NotFoundError('账户')
  }

  const transactionsCount = await prisma.transaction.count({
    where: { accountId },
  })

  // 转入交易（toAccountId 指向本账户）不会计入 transactionsCount，
  // 但账户被删除后这些交易会被外键置空 toAccountId，静默破坏转账配对，
  // 因此必须一并纳入"关联数据"判定与级联删除。
  const incomingTransfersCount = await prisma.transaction.count({
    where: { toAccountId: accountId },
  })

  // 该账户（作为转出或转入方）被预算引用时，外键为 RESTRICT，
  // 若不先删除预算，删除账户会直接抛出外键错误。
  const budgetsCount = await prisma.budget.count({
    where: { OR: [{ accountId }, { toAccountId: accountId }] },
  })

  const assetClassesCount = await prisma.investmentAssetClass.count({
    where: { accountId },
  })

  const snapshotsCount = await prisma.investmentAllocationSnapshot.count({
    where: { accountId },
  })

  const hasRelatedData =
    transactionsCount > 0 ||
    incomingTransfersCount > 0 ||
    budgetsCount > 0 ||
    assetClassesCount > 0 ||
    snapshotsCount > 0

  if (!forceDelete && hasRelatedData) {
    const messages: string[] = []
    if (transactionsCount > 0) messages.push(`${transactionsCount} 条交易记录`)
    if (incomingTransfersCount > 0) messages.push(`${incomingTransfersCount} 条转入交易`)
    if (budgetsCount > 0) messages.push(`${budgetsCount} 个预算`)
    if (assetClassesCount > 0) messages.push(`${assetClassesCount} 个投资大类`)
    if (snapshotsCount > 0) messages.push(`${snapshotsCount} 个投资快照`)
    throw new ValidationError(`该账户下存在 ${messages.join('、')}，无法删除`)
  }

  if (forceDelete && hasRelatedData) {
    await prisma.$transaction(async (tx) => {
      // 先删引用账户的子表（交易、预算），再删账户
      if (transactionsCount > 0) {
        await tx.transaction.deleteMany({ where: { accountId } })
      }
      if (incomingTransfersCount > 0) {
        await tx.transaction.deleteMany({ where: { toAccountId: accountId } })
      }
      if (budgetsCount > 0) {
        await tx.budget.deleteMany({ where: { OR: [{ accountId }, { toAccountId: accountId }] } })
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
    deletedIncomingTransfers: incomingTransfersCount,
    deletedBudgets: budgetsCount,
    deletedAssetClasses: assetClassesCount,
    deletedSnapshots: snapshotsCount,
  }
}

export async function getAccountStats(accountId: string): Promise<AccountStats> {
  // isAdjustment 已删除：type='adjustment' 已能区分非业务调整
  // 不计收支标记的交易不计入账户收入/支出统计（仍计入账户余额）
  const [countResult, incomeResult, expenseResult] = await Promise.all([
    prisma.transaction.count({
      where: { accountId },
    }),
    prisma.transaction.aggregate({
      where: { accountId, type: 'income', excludeFromIncomeExpense: false },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { accountId, type: 'expense', excludeFromIncomeExpense: false },
      _sum: { amount: true },
    }),
  ])

  return {
    transactionCount: countResult,
    totalIncome: toMinor(incomeResult._sum.amount),
    totalExpense: toMinor(expenseResult._sum.amount),
  }
}
