import { prisma } from '../index.js'
import { NotFoundError, ValidationError } from '../common/index.js'
import { toDecimal, ZERO } from '../common/index.js'

export async function getNextAccountSort(categoryId: string | null): Promise<number> {
  const maxSortResult = await prisma.account.aggregate({
    where: { categoryId: categoryId || null },
    _max: { sort: true },
  })

  return (maxSortResult._max.sort ?? -1) + 1
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
  cashFlowType?: string | null
  initialBalance?: number
  initialBalanceDate?: string
}

export async function getAccounts() {
  return prisma.account.findMany({
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
  balance?: number
  icon?: string | null
  categoryId?: string | null
  initialBalance?: number
  initialBalanceDate?: string
}) {
  const actualBalance = data.balance ?? data.initialBalance ?? 0
  const actualInitialBalance = data.initialBalance ?? data.balance ?? 0

  return prisma.account.create({
    data: {
      name: data.name,
      type: data.type,
      balance: actualBalance,
      initialBalance: actualInitialBalance,
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
    cashFlowType: data.cashFlowType,
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
    updateData.balance = data.initialBalance
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

  if (!forceDelete && transactionsCount > 0) {
    throw new ValidationError(`该账户下存在 ${transactionsCount} 条交易记录，无法删除`)
  }

  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { accountId } }),
    prisma.account.delete({ where: { id: accountId } }),
  ])

  return {
    message: '删除成功',
    deletedTransactions: transactionsCount,
  }
}

export interface AccountStats {
  transactionCount: number
  totalIncome: number
  totalExpense: number
}

export async function getAccountStats(accountId: string): Promise<AccountStats> {
  const transactions = await prisma.transaction.findMany({
    where: { accountId },
  })

  const transactionCount = transactions.length
  let totalIncome = ZERO
  let totalExpense = ZERO

  transactions.forEach(t => {
    if (t.type === 'income') {
      totalIncome = totalIncome.plus(t.amount)
    } else if (t.type === 'expense') {
      totalExpense = totalExpense.plus(t.amount)
    }
  })

  return {
    transactionCount,
    totalIncome: totalIncome.toNumber(),
    totalExpense: totalExpense.toNumber(),
  }
}

export async function adjustAccountBalance(
  accountId: string,
  amount: number,
  date?: string,
  note?: string,
): Promise<{ transaction: any; newBalance: number }> {
  const account = await prisma.account.findUnique({ where: { id: accountId } })
  if (!account) throw new NotFoundError('账户')

  const adjustDate = date ? new Date(`${date}T00:00:00`) : new Date()

  const result = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
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

    const newBalance = account.balance.plus(amount)
    await tx.account.update({
      where: { id: accountId },
      data: { balance: newBalance },
    })

    return { transaction, newBalance: newBalance.toNumber() }
  })

  return result
}

export async function batchAdjustAccountBalances(
  adjustments: Array<{ accountId: string; amount: number }>,
  date?: string,
  note?: string,
): Promise<{ date: Date; count: number; adjustments: any[] }> {
  const adjustDate = date ? new Date(`${date}T00:00:00`) : new Date()
  const results = []

  for (const adj of adjustments) {
    const { accountId, amount } = adj
    const account = await prisma.account.findUnique({ where: { id: accountId } })
    if (!account || amount === 0) continue

    const { transaction, newBalance } = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          type: 'adjustment',
          amount: toDecimal(amount),
          date: adjustDate,
          note: note || '批量平账调整',
          accountId,
          isAdjustment: true,
        },
      })

      const newBalance = account.balance.plus(amount)
      await tx.account.update({
        where: { id: accountId },
        data: { balance: newBalance },
      })

      return { transaction, newBalance: newBalance.toNumber() }
    })

    results.push({
      accountId,
      accountName: account.name,
      amount,
      transactionId: transaction.id,
      newBalance,
    })
  }

  return { date: adjustDate, count: results.length, adjustments: results }
}
