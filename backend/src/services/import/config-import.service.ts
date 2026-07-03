// ─── 配置导入（账户/账户分类/收支分类/投资资产类别） ───

import { prisma } from '../../index.js'
import { clearConfigDataForImport } from '../clear-data.service.js'
import {
  type ConfigImportData,
  type ImportAccount,
  type ImportAccountCategory,
  type ImportConfigResult,
  type ImportInvestmentAssetClass,
  type ImportTransactionCategory,
  type TransactionClient,
  type SortCounters,
  buildSortCounters,
  takeNextSort,
  incImported,
  incUpdated,
  incSkipped,
} from './shared.js'

// ─── importAccountCategories ───

async function importAccountCategories(
  categories: ImportAccountCategory[],
  tx: TransactionClient,
  result: ImportConfigResult,
  nameMap: Map<string, string>,
  counters: SortCounters,
  mode: 'merge' | 'overwrite',
  parentId: string | null = null
): Promise<void> {
  for (const item of categories) {
    try {
      const existing = await tx.accountCategory.findFirst({
        where: { name: item.name, type: item.type, parentId },
      })

      let currentId: string

      if (existing) {
        if (mode === 'merge') {
          await tx.accountCategory.update({
            where: { id: existing.id },
            data: {
              icon: item.icon ?? existing.icon,
              sort: item.sort ?? existing.sort,
              isCashEquivalent: item.isCashEquivalent ?? existing.isCashEquivalent,
              isInvestment: item.isInvestment ?? existing.isInvestment,
            },
          })
        }
        currentId = existing.id
        incUpdated(result, 'accountCategories')
      } else {
        const sort = item.sort ?? takeNextSort(counters, 'accountCategory', item.type)
        const created = await tx.accountCategory.create({
          data: {
            name: item.name,
            type: item.type,
            parentId,
            icon: item.icon,
            isCashEquivalent: item.isCashEquivalent ?? false,
            isInvestment: item.isInvestment ?? false,
            sort,
          },
        })
        currentId = created.id
        incImported(result, 'accountCategories')
      }

      // key 包含 parentId，避免不同父分类下的同名子分类互相覆盖
      nameMap.set(buildCategoryKey(item.type, item.name, parentId), currentId)

      if (item.children?.length) {
        await importAccountCategories(
          item.children,
          tx,
          result,
          nameMap,
          counters,
          mode,
          currentId
        )
      }
    } catch (error) {
      result.errors.push(`${item.name} 导入失败: ${(error as Error).message}`)
      incSkipped(result, 'accountCategories')
    }
  }
}

// ─── importAccounts ───

async function importAccounts(
  accounts: ImportAccount[],
  tx: TransactionClient,
  result: ImportConfigResult,
  categoryNameMap: Map<string, string>,
  counters: SortCounters,
  mode: 'merge' | 'overwrite'
): Promise<void> {
  for (const account of accounts) {
    try {
      const existing = await tx.account.findFirst({ where: { name: account.name } })

      let categoryId: string | null = null
      if (account.categoryName) {
        // 优先用 nameMap 精确匹配；否则按 name + type 查找
        const keyByName = buildCategoryKey(account.type, account.categoryName, null)
        if (categoryNameMap.has(keyByName)) {
          categoryId = categoryNameMap.get(keyByName)!
        } else {
          const matched = await tx.accountCategory.findFirst({
            where: { name: account.categoryName, type: account.type },
          })
          if (matched) {
            categoryId = matched.id
          }
        }
      }

      // 兜底：使用默认分类
      if (!categoryId) {
        const defaultCategory = await tx.accountCategory.findFirst({
          where: { type: account.type, parentId: null },
        })
        if (defaultCategory) {
          categoryId = defaultCategory.id
        }
      }

      if (existing) {
        if (mode === 'merge') {
          await tx.account.update({
            where: { id: existing.id },
            data: {
              type: account.type ?? existing.type,
              initialBalance: account.initialBalance
                ? parseFloat(account.initialBalance)
                : existing.initialBalance,
              initialBalanceDate: account.initialBalanceDate
                ? new Date(account.initialBalanceDate)
                : existing.initialBalanceDate,
              icon: account.icon ?? existing.icon,
              color: account.color ?? existing.color,
              sort: account.sort ?? existing.sort,
              categoryId: categoryId ?? existing.categoryId,
            },
          })
          incUpdated(result, 'accounts')
        } else {
          incSkipped(result, 'accounts')
        }
      } else {
        const sort = account.sort ?? takeNextSort(counters, 'account', categoryId ?? 'default')
        await tx.account.create({
          data: {
            name: account.name,
            type: account.type,
            initialBalance: account.initialBalance ? parseFloat(account.initialBalance) : 0,
            initialBalanceDate: account.initialBalanceDate
              ? new Date(account.initialBalanceDate)
              : null,
            icon: account.icon,
            color: account.color,
            sort,
            categoryId,
          },
        })
        incImported(result, 'accounts')
      }
    } catch (error) {
      result.errors.push(`账户 "${account.name}" 导入失败: ${(error as Error).message}`)
      incSkipped(result, 'accounts')
    }
  }
}

// ─── importTransactionCategories ───

async function importTransactionCategories(
  categories: ImportTransactionCategory[],
  tx: TransactionClient,
  result: ImportConfigResult,
  nameMap: Map<string, string>,
  counters: SortCounters,
  mode: 'merge' | 'overwrite',
  parentId: string | null = null
): Promise<void> {
  for (const item of categories) {
    try {
      const existing = await tx.transactionCategory.findFirst({
        where: { name: item.name, type: item.type, parentId },
      })

      let currentId: string

      if (existing) {
        if (mode === 'merge') {
          await tx.transactionCategory.update({
            where: { id: existing.id },
            data: {
              icon: item.icon ?? existing.icon,
              color: item.color ?? existing.color,
              cashFlowType: item.cashFlowType ?? existing.cashFlowType,
              sort: item.sort ?? existing.sort,
            },
          })
        }
        currentId = existing.id
        incUpdated(result, 'transactionCategories')
      } else {
        const sortGroupKey = `${item.type}:${parentId ?? 'root'}`
        const sort = item.sort ?? takeNextSort(counters, 'transactionCategory', sortGroupKey)
        const created = await tx.transactionCategory.create({
          data: {
            name: item.name,
            type: item.type,
            parentId,
            icon: item.icon,
            color: item.color,
            cashFlowType: item.cashFlowType,
            sort,
          },
        })
        currentId = created.id
        incImported(result, 'transactionCategories')
      }

      nameMap.set(buildCategoryKey(item.type, item.name, parentId), currentId)

      if (item.children?.length) {
        await importTransactionCategories(
          item.children,
          tx,
          result,
          nameMap,
          counters,
          mode,
          currentId
        )
      }
    } catch (error) {
      result.errors.push(`${item.name} 导入失败: ${(error as Error).message}`)
      incSkipped(result, 'transactionCategories')
    }
  }
}

// ─── importInvestmentAssetClasses ───

async function importInvestmentAssetClasses(
  assetClasses: ImportInvestmentAssetClass[],
  tx: TransactionClient,
  result: ImportConfigResult,
  mode: 'merge' | 'overwrite'
): Promise<void> {
  for (const ac of assetClasses) {
    try {
      const account = await tx.account.findFirst({ where: { name: ac.accountName } })
      if (!account) {
        result.errors.push(`投资资产类别关联账户不存在: ${ac.accountName}`)
        incSkipped(result, 'investmentAssetClasses')
        continue
      }

      const existing = await tx.investmentAssetClass.findFirst({
        where: { accountId: account.id, name: ac.name },
      })

      if (existing) {
        if (mode === 'merge') {
          await tx.investmentAssetClass.update({
            where: { id: existing.id },
            data: {
              icon: ac.icon ?? existing.icon,
              targetRatio: ac.targetRatio ?? existing.targetRatio,
              sort: ac.sort ?? existing.sort,
            },
          })
          incUpdated(result, 'investmentAssetClasses')
        } else {
          incSkipped(result, 'investmentAssetClasses')
        }
      } else {
        await tx.investmentAssetClass.create({
          data: {
            accountId: account.id,
            name: ac.name,
            icon: ac.icon,
            targetRatio: ac.targetRatio,
            sort: ac.sort,
          },
        })
        incImported(result, 'investmentAssetClasses')
      }
    } catch (error) {
      result.errors.push(
        `投资资产类别 "${ac.name}" 导入失败: ${(error as Error).message}`
      )
    }
  }
}

// ─── importConfig（公开 API） ───

export async function importConfig(
  configData: ConfigImportData,
  mode: 'merge' | 'overwrite',
  tx?: TransactionClient
): Promise<ImportConfigResult> {
  const result: ImportConfigResult = {
    imported: { accountCategories: 0, accounts: 0, transactionCategories: 0, investmentAssetClasses: 0 },
    updated: { accountCategories: 0, accounts: 0, transactionCategories: 0, investmentAssetClasses: 0 },
    skipped: { accountCategories: 0, accounts: 0, transactionCategories: 0, investmentAssetClasses: 0 },
    errors: [],
  }

  const executeImport = async (tx: TransactionClient) => {
    const counters = await buildSortCounters(tx)
    const accountCategoryNameMap = new Map<string, string>()

    if (configData.data.accountCategories) {
      await importAccountCategories(
        configData.data.accountCategories,
        tx,
        result,
        accountCategoryNameMap,
        counters,
        mode
      )
    }

    if (configData.data.accounts) {
      await importAccounts(
        configData.data.accounts,
        tx,
        result,
        accountCategoryNameMap,
        counters,
        mode
      )
    }

    const transactionCategoryNameMap = new Map<string, string>()

    if (configData.data.transactionCategories) {
      await importTransactionCategories(
        configData.data.transactionCategories,
        tx,
        result,
        transactionCategoryNameMap,
        counters,
        mode
      )
    }

    // 投资资产类别（依赖账户）
    if (configData.data.investmentAssetClasses) {
      await importInvestmentAssetClasses(
        configData.data.investmentAssetClasses,
        tx,
        result,
        mode
      )
    }
  }

  if (tx) {
    await executeImport(tx)
  } else {
    await prisma.$transaction(async (tx) => {
      // 独立调用时（如单独导入 config.json），需要处理覆盖模式的清空
      if (mode === 'overwrite') {
        await clearConfigDataForImport(tx)
      }
      await executeImport(tx)
    })
  }

  return result
}

// ─── 辅助函数 ───

function buildCategoryKey(type: string, name: string, parentId: string | null): string {
  return `${type}:${name}:${parentId ?? 'root'}`
}
