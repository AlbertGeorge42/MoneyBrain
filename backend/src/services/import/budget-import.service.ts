// ─── 预算导入 ───

import { prisma } from '../../index.js'
import { toDecimal } from '../../common/index.js'
import {
  type BudgetImportData,
  type ImportBudgetResult,
  type TransactionClient,
} from './shared.js'

const BUDGET_TYPES = ['income', 'expense', 'transfer'] as const
const BUDGET_PERIODS = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const

export async function importBudgets(
  budgetData: BudgetImportData,
  mode: 'merge' | 'overwrite',
  tx?: TransactionClient
): Promise<ImportBudgetResult> {
  const result: ImportBudgetResult = {
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  }

  const executeImport = async (tx: TransactionClient) => {
    if (mode === 'overwrite') {
      await tx.budget.deleteMany()
    }

    const accountNameMap = new Map<string, string>()
    const accounts = await tx.account.findMany()
    for (const a of accounts) {
      accountNameMap.set(a.name, a.id)
    }

    // 复合键 `${type}:${name}` 避免同名不同类别的分类互相覆盖
    const categoryMap = new Map<string, string>()
    const categories = await tx.transactionCategory.findMany()
    for (const c of categories) {
      categoryMap.set(`${c.type}:${c.name}`, c.id)
    }

    /**
     * 查找或创建交易分类。
     * 先按类型+名称精确匹配；再兜底按名称匹配（兼容无类型前缀的旧数据）；
     * 若都不存在则自动创建分类。
     */
    async function resolveCategoryId(
      type: string,
      name: string
    ): Promise<string> {
      // 1. 精确匹配：type:name
      const exactKey = `${type}:${name}`
      const exact = categoryMap.get(exactKey)
      if (exact) return exact

      // 2. 宽松匹配：仅 name（兼容旧格式导出数据）
      const legacy = categoryMap.get(name)
      if (legacy) return legacy

      // 3. 自动创建缺失的分类
      const maxResult = await tx.transactionCategory.aggregate({
        where: { type },
        _max: { sort: true },
      })
      const nextSort = (maxResult._max.sort ?? 0) + 1
      const created = await tx.transactionCategory.create({
        data: { name, type, sort: nextSort },
      })
      categoryMap.set(`${type}:${name}`, created.id)
      return created.id
    }

    for (const budget of budgetData.data.budgets) {
      try {
        if (!BUDGET_TYPES.includes(budget.type as typeof BUDGET_TYPES[number])) {
          result.errors.push(`预算 "${budget.name}" 类型无效: ${budget.type}`)
          result.skipped++
          continue
        }

        if (!BUDGET_PERIODS.includes(budget.period as typeof BUDGET_PERIODS[number])) {
          result.errors.push(`预算 "${budget.name}" 周期无效: ${budget.period}`)
          result.skipped++
          continue
        }

        const accountId = accountNameMap.get(budget.accountName)
        if (!accountId) {
          result.errors.push(`预算 "${budget.name}" 关联账户不存在: ${budget.accountName}`)
          result.skipped++
          continue
        }

        const categoryId = await resolveCategoryId(budget.type, budget.categoryName)

        let toAccountId: string | null = null
        if (budget.toAccountName) {
          toAccountId = accountNameMap.get(budget.toAccountName) ?? null
          if (!toAccountId) {
            result.errors.push(`预算 "${budget.name}" 目标账户不存在: ${budget.toAccountName}`)
            result.skipped++
            continue
          }
        }

        if (budget.type === 'transfer' && !toAccountId) {
          result.errors.push(`预算 "${budget.name}" 转账类型必须指定目标账户`)
          result.skipped++
          continue
        }

        const existing = await tx.budget.findFirst({ where: { name: budget.name } })

        if (existing) {
          if (mode === 'merge') {
            await tx.budget.update({
              where: { id: existing.id },
              data: {
                type: budget.type,
                amount: toDecimal(budget.amount),
                period: budget.period,
                startDate: new Date(budget.startDate),
                endDate: budget.endDate ? new Date(budget.endDate) : null,
                transactionTime: budget.transactionTime ?? null,
                note: budget.note ?? null,
                isActive: budget.isActive ?? true,
                accountId,
                toAccountId,
                categoryId,
              },
            })
            result.updated++
          } else {
            result.skipped++
          }
        } else {
          await tx.budget.create({
            data: {
              name: budget.name,
              type: budget.type,
              amount: toDecimal(budget.amount),
              period: budget.period,
              startDate: new Date(budget.startDate),
              endDate: budget.endDate ? new Date(budget.endDate) : null,
              transactionTime: budget.transactionTime ?? null,
              note: budget.note ?? null,
              isActive: budget.isActive ?? true,
              accountId,
              toAccountId,
              categoryId,
            },
          })
          result.imported++
        }
      } catch (error) {
        result.errors.push(`预算 "${budget.name}" 导入失败: ${(error as Error).message}`)
        result.skipped++
      }
    }
  }

  if (tx) {
    await executeImport(tx)
  } else {
    await prisma.$transaction(async (tx) => {
      await executeImport(tx)
    })
  }

  return result
}
