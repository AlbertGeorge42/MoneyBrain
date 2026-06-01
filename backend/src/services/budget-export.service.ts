import { prisma } from '../index.js'

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
