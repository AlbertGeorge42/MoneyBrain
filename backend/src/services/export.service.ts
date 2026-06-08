import { prisma } from '../index.js'
import { buildTree } from '../common/tree.js'

// ─── CSV 事务导出 ───

export async function exportTransactionsCSV(startDate?: Date, endDate?: Date): Promise<string> {
  const transactions = await prisma.transaction.findMany({
    where: {
      ...(startDate || endDate ? {
        date: {
          ...(startDate ? { gte: startDate } : {}),
          ...(endDate ? { lte: endDate } : {}),
        },
      } : {}),
    },
    include: {
      account: true,
      toAccount: true,
      category: true,
      relatedTransaction: {
        include: { account: true, category: true },
      },
    },
    orderBy: { date: 'desc' },
  })

  const idMap: Record<string, string> = {}
  transactions.forEach(t => {
    idMap[t.id] = `mb${Date.now()}${Math.random().toString(36).substr(2, 9)}`
  })

  const csvRows: string[] = []
  csvRows.push('ID,时间,分类,二级分类,类型,金额,币种,账户1,账户2,备注,已报销,手续费,优惠券,记账者,账单标记,标签,账单图片,关联账单')

  for (const t of transactions) {
    const id = idMap[t.id]
    const date = new Date(t.date)
      .toLocaleString('zh-CN', { hour12: false })
      .replace(/\//g, '-')
    const category1 = t.category?.name || '未分类'
    const category2 = ''
    let type: string
    if (t.type === 'income') type = '收入'
    else if (t.type === 'transfer') type = '转账'
    else if (t.type === 'refund') type = '退款'
    else type = '支出'

    const amount = t.amount.toNumber()
    const currency = 'CNY'
    const account1 = t.account?.name || ''
    const account2 = t.toAccount?.name || ''
    const note = (t.note || '').replace(/,/g, '，').replace(/\n/g, ' ')
    const reimbursed = ''
    const fee = t.fee?.toNumber() || 0
    const coupon = t.coupon?.toNumber() || 0
    const recorder = 'MoneyBrain'
    const billMark = ''
    const tags = ''
    const images = ''
    const relatedBill = t.relatedTransactionId ? (idMap[t.relatedTransactionId] || '') : ''

    csvRows.push(
      `${id},${date},${category1},${category2},${type},${amount},${currency},${account1},${account2},${note},${reimbursed},${fee},${coupon},${recorder},${billMark},${tags},${images},${relatedBill}`
    )
  }

  return '\uFEFF' + csvRows.join('\n')
}

// ─── 数据清空 ───

export async function clearAllData(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.budget.deleteMany()
    await tx.transaction.deleteMany()
    await tx.account.deleteMany()
    await tx.accountCategory.deleteMany({ where: { parentId: { not: null } } })
    await tx.accountCategory.deleteMany()
    await tx.transactionCategory.deleteMany({ where: { parentId: { not: null } } })
    await tx.transactionCategory.deleteMany()
  })
}

export async function clearTransactionsOnly(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.budget.deleteMany()
    await tx.transaction.deleteMany()
  })
}

// ─── 配置导出 ───

interface ExportAccountCategory {
  name: string
  type: string
  icon?: string
  sort: number
  isCashEquivalent: boolean
  isInvestment: boolean
  children?: ExportAccountCategory[]
}

interface ExportAccount {
  name: string
  type: string
  initialBalance: string
  initialBalanceDate: string | null
  icon?: string
  color?: string
  sort: number
  categoryName?: string
}

interface ExportTransactionCategory {
  name: string
  type: string
  icon?: string
  color?: string
  cashFlowType: string | null
  sort: number
  children?: ExportTransactionCategory[]
}

interface ConfigBackupData {
  version: string
  exportedAt: string
  type: string
  data: {
    accounts?: ExportAccount[]
    accountCategories?: ExportAccountCategory[]
    transactionCategories?: ExportTransactionCategory[]
  }
}

function serializeAccountCategory(category: { name: string; type: string; icon?: string; sort: number; isCashEquivalent: boolean; isInvestment: boolean; children: unknown[] }): ExportAccountCategory {
  const result: ExportAccountCategory = {
    name: category.name,
    type: category.type,
    icon: category.icon,
    sort: category.sort,
    isCashEquivalent: category.isCashEquivalent,
    isInvestment: category.isInvestment,
  }
  if (category.children.length > 0) {
    result.children = category.children.map((child) =>
      serializeAccountCategory(child as Parameters<typeof serializeAccountCategory>[0])
    )
  }
  return result
}

function serializeTransactionCategory(category: { name: string; type: string; icon?: string; color?: string; cashFlowType?: string; sort: number; children: unknown[] }): ExportTransactionCategory {
  const result: ExportTransactionCategory = {
    name: category.name,
    type: category.type,
    icon: category.icon,
    color: category.color,
    cashFlowType: category.cashFlowType ?? null,
    sort: category.sort,
  }
  if (category.children.length > 0) {
    result.children = category.children.map((child) =>
      serializeTransactionCategory(child as Parameters<typeof serializeTransactionCategory>[0])
    )
  }
  return result
}

export async function exportConfig(): Promise<string> {
  const data: ConfigBackupData['data'] = {}

  const accountCategories = await prisma.accountCategory.findMany({
    orderBy: { sort: 'asc' },
  })
  const accountCategoryTree = buildTree(
    accountCategories.map(c => ({
      id: c.id,
      parentId: c.parentId,
      name: c.name,
      type: c.type,
      sort: c.sort,
      icon: c.icon ?? undefined,
      isCashEquivalent: c.isCashEquivalent,
      isInvestment: c.isInvestment,
    }))
  )
  data.accountCategories = accountCategoryTree.map((cat) => serializeAccountCategory(cat as Parameters<typeof serializeAccountCategory>[0]))

  const accounts = await prisma.account.findMany({
    orderBy: { sort: 'asc' },
    include: { category: true },
  })
  data.accounts = accounts.map((a) => ({
    name: a.name,
    type: a.type,
    initialBalance: a.initialBalance.toString(),
    initialBalanceDate: a.initialBalanceDate?.toISOString().split('T')[0] ?? null,
    icon: a.icon ?? undefined,
    color: a.color ?? undefined,
    sort: a.sort,
    categoryName: a.category?.name ?? undefined,
  }))

  const transactionCategories = await prisma.transactionCategory.findMany({
    orderBy: { sort: 'asc' },
  })
  const transactionCategoryTree = buildTree(
    transactionCategories.map(c => ({
      id: c.id,
      parentId: c.parentId,
      name: c.name,
      type: c.type,
      sort: c.sort,
      icon: c.icon ?? undefined,
      color: c.color ?? undefined,
      cashFlowType: c.cashFlowType ?? undefined,
    }))
  )
  data.transactionCategories = transactionCategoryTree.map((cat) => serializeTransactionCategory(cat as Parameters<typeof serializeTransactionCategory>[0]))

  const result: ConfigBackupData = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    type: 'config',
    data,
  }

  return JSON.stringify(result, null, 2)
}

// ─── 预算导出 ───

interface ExportBudget {
  name: string
  type: string
  amount: string
  period: string
  startDate: string
  endDate: string | null
  transactionTime: number | null
  note: string | null
  isActive: boolean
  accountName: string
  toAccountName: string | null
  categoryName: string
}

interface BudgetBackupData {
  version: string
  exportedAt: string
  type: string
  data: {
    budgets: ExportBudget[]
  }
}

export async function exportBudgets(): Promise<string> {
  const budgets = await prisma.budget.findMany({
    include: { account: true, toAccount: true, category: true },
    orderBy: { createdAt: 'asc' },
  })

  const exportBudgets: ExportBudget[] = budgets.map((b) => ({
    name: b.name,
    type: b.type,
    amount: b.amount.toString(),
    period: b.period,
    startDate: b.startDate.toISOString().split('T')[0],
    endDate: b.endDate ? b.endDate.toISOString().split('T')[0] : null,
    transactionTime: b.transactionTime,
    note: b.note,
    isActive: b.isActive,
    accountName: b.account.name,
    toAccountName: b.toAccount?.name ?? null,
    categoryName: b.category.name,
  }))

  const result: BudgetBackupData = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    type: 'budgets',
    data: {
      budgets: exportBudgets,
    },
  }

  return JSON.stringify(result, null, 2)
}
