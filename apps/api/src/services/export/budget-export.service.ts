import { prisma } from '../../prisma.js'
import { formatDateLocal } from '../../common/index.js'
import { formatAmount, minor } from '../../../../../packages/domain/src/index.js'

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
    amount: formatAmount(minor(Number(b.amount))),
    period: b.period,
    // 用本地格式导出，避免 toISOString() 在 UTC+8 下把本地零点日期导出成前一天
    startDate: formatDateLocal(b.startDate),
    endDate: b.endDate ? formatDateLocal(b.endDate) : null,
    transactionTime: b.transactionTime,
    note: b.note,
    isActive: b.isActive,
    accountName: b.account.name,
    toAccountName: b.toAccount?.name ?? null,
    categoryName: b.category.name,
  }))

  const result: BudgetBackupData = {
    exportedAt: new Date().toISOString(),
    type: 'budgets',
    data: {
      budgets: exportBudgets,
    },
  }

  return JSON.stringify(result, null, 2)
}
