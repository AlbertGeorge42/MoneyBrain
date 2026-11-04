// ─── 预算导入 ───

import { parseAmount } from '../../../../../packages/domain/src/index.js'
import { dayStart } from '../../common/date.js'
import {
  type BudgetImportData,
  type ImportBudgetResult,
  type TransactionClient,
} from './shared.js'
import * as accountRepo from '../../db/repositories/account.repository.js'
import * as transactionCategoryRepo from '../../db/repositories/transaction-category.repository.js'
import * as budgetRepo from '../../db/repositories/budget.repository.js'

const BUDGET_TYPES = ['income', 'expense', 'transfer'] as const
const BUDGET_PERIODS = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const

export async function importBudgets(
  budgetData: BudgetImportData,
  mode: 'merge' | 'overwrite',
  tx: TransactionClient
): Promise<ImportBudgetResult> {
  const result: ImportBudgetResult = {
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  }

  const executeImport = async (tx: TransactionClient) => {
    const accountNameMap = new Map<string, string>()
    const accounts = await accountRepo.findMany({}, tx)
    for (const a of accounts) {
      accountNameMap.set(a.name, a.id)
    }

    // 复合键 `${type}:${name}` 避免同名不同类别的分类互相覆盖
    const categoryMap = new Map<string, string>()
    const categories = await transactionCategoryRepo.findMany({}, tx)
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
      const nextSort = (await transactionCategoryRepo.findMaxSort({ type }, tx)) + 1
      const created = await transactionCategoryRepo.create(
        { data: { name, type, sort: nextSort } },
        tx,
      )
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

        const existing = await budgetRepo.findFirst({ where: { name: budget.name } }, tx)

        if (existing) {
          if (mode === 'merge') {
            await budgetRepo.updateWithRelations(
              existing.id,
              {
                type: budget.type,
                amount: BigInt(parseAmount(budget.amount)),
                period: budget.period,
                startDate: dayStart(budget.startDate),
                endDate: budget.endDate ? dayStart(budget.endDate) : null,
                transactionTime: budget.transactionTime ?? null,
                note: budget.note ?? null,
                isActive: budget.isActive ?? true,
                accountId,
                toAccountId,
                categoryId,
              },
              tx,
            )
            result.updated++
          } else {
            result.skipped++
          }
        } else {
          await budgetRepo.createWithRelations(
            {
              name: budget.name,
              type: budget.type,
              amount: BigInt(parseAmount(budget.amount)),
              period: budget.period,
              startDate: dayStart(budget.startDate),
              endDate: budget.endDate ? dayStart(budget.endDate) : null,
              transactionTime: budget.transactionTime ?? null,
              note: budget.note ?? null,
              isActive: budget.isActive ?? true,
              accountId,
              toAccountId,
              categoryId,
            },
            tx,
          )
          result.imported++
        }
      } catch (error) {
        result.errors.push(`预算 "${budget.name}" 导入失败: ${(error as Error).message}`)
        result.skipped++
      }
    }
  }

  await executeImport(tx)

  return result
}
