// ─── 配置导入（账户/账户分类/收支分类/投资资产类别） ───

import { parseAmount } from '../../../../../packages/domain/src/index.js'
import {
  type ConfigImportData,
  type ImportAccount,
  type ImportAccountCategory,
  type ImportConfigResult,
  type ImportInvestmentAssetClass,
  type ImportSummaryCollector,
  type ImportTransactionCategory,
  type TransactionClient,
  type SortCounters,
  buildSortCounters,
  takeNextSort,
  incImported,
  incUpdated,
  incSkipped,
} from './shared.js'
import * as accountRepo from '../../db/repositories/account.repository.js'
import { parseDateLocal } from '../../common/index.js'
import * as accountCategoryRepo from '../../db/repositories/account-category.repository.js'
import * as transactionCategoryRepo from '../../db/repositories/transaction-category.repository.js'
import * as investmentAssetClassRepo from '../../db/repositories/investment-asset-class.repository.js'

// ─── importAccountCategories ───

async function importAccountCategories(
  categories: ImportAccountCategory[],
  tx: TransactionClient,
  result: ImportConfigResult,
  nameMap: Map<string, string>,
  counters: SortCounters,
  mode: 'merge' | 'overwrite',
  parentId: string | null = null,
  summary?: ImportSummaryCollector
): Promise<void> {
  for (const item of categories) {
    try {
      const existing = await accountCategoryRepo.findFirst(
        { where: { name: item.name, type: item.type, parentId } },
        tx,
      )

      let currentId: string

      if (existing) {
        if (mode === 'merge') {
          await accountCategoryRepo.update(
            {
              where: { id: existing.id },
              data: {
                sort: item.sort ?? existing.sort,
                isCashEquivalent: item.isCashEquivalent ?? existing.isCashEquivalent,
                isInvestment: item.isInvestment ?? existing.isInvestment,
              },
            },
            tx,
          )
        }
        currentId = existing.id
        incUpdated(result, 'accountCategories')
      } else {
        const sort = item.sort ?? takeNextSort(counters, 'accountCategory', item.type)
        const created = await accountCategoryRepo.create(
          {
            data: {
              name: item.name,
              type: item.type,
              parentId,
              isCashEquivalent: item.isCashEquivalent ?? false,
              isInvestment: item.isInvestment ?? false,
              sort,
            },
          },
          tx,
        )
        currentId = created.id
        incImported(result, 'accountCategories')
        summary?.unknownCategories.add(item.name)
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
          currentId,
          summary
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
  mode: 'merge' | 'overwrite',
  summary?: ImportSummaryCollector
): Promise<void> {
  for (const account of accounts) {
    try {
      const existing = await accountRepo.findFirst({ where: { name: account.name } }, tx)

      let categoryId: string | null = null
      if (account.categoryName) {
        // 优先用 nameMap 精确匹配；否则按 name + type 查找
        const keyByName = buildCategoryKey(account.type, account.categoryName, null)
        if (categoryNameMap.has(keyByName)) {
          categoryId = categoryNameMap.get(keyByName)!
        } else {
          const matched = await accountCategoryRepo.findFirst(
            { where: { name: account.categoryName, type: account.type } },
            tx,
          )
          if (matched) {
            categoryId = matched.id
          }
        }
      }

      // 兜底：使用默认分类
      if (!categoryId) {
        const defaultCategory = await accountCategoryRepo.findFirst(
          { where: { type: account.type, parentId: null } },
          tx,
        )
        if (defaultCategory) {
          categoryId = defaultCategory.id
        }
      }

      // 分类是报表口径的来源，宁可报错也不静默写 null
      if (!categoryId) {
        throw new Error(`缺少可用的账户分类（type=${account.type}），请先导入账户分类`)
      }

      if (existing) {
        if (mode === 'merge') {
          await accountRepo.updateWithCategory(
            existing.id,
            {
              type: account.type ?? existing.type,
              initialBalance: account.initialBalance
                ? BigInt(parseAmount(account.initialBalance))
                : existing.initialBalance,
              initialBalanceDate: account.initialBalanceDate
                ? parseDateLocal(account.initialBalanceDate)
                : existing.initialBalanceDate,
              sort: account.sort ?? existing.sort,
              categoryId: categoryId ?? existing.categoryId,
            },
            tx,
          )
          incUpdated(result, 'accounts')
        } else {
          incSkipped(result, 'accounts')
        }
      } else {
        const sort = account.sort ?? takeNextSort(counters, 'account', categoryId ?? 'default')
        await accountRepo.createWithCategory(
          {
            name: account.name,
            type: account.type,
            initialBalance: account.initialBalance ? BigInt(parseAmount(account.initialBalance)) : BigInt(0),
            initialBalanceDate: account.initialBalanceDate
              ? parseDateLocal(account.initialBalanceDate)
              : null,
            sort,
            categoryId,
          },
          tx,
        )
        incImported(result, 'accounts')
        summary?.unknownAccounts.add(account.name)
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
  parentId: string | null = null,
  summary?: ImportSummaryCollector
): Promise<void> {
  for (const item of categories) {
    try {
      const existing = await transactionCategoryRepo.findFirst(
        { where: { name: item.name, type: item.type, parentId } },
        tx,
      )

      let currentId: string

      if (existing) {
        if (mode === 'merge') {
          await transactionCategoryRepo.update(
            {
              where: { id: existing.id },
              data: {
                cashFlowType: item.cashFlowType ?? existing.cashFlowType,
                sort: item.sort ?? existing.sort,
              },
            },
            tx,
          )
        }
        currentId = existing.id
        incUpdated(result, 'transactionCategories')
      } else {
        const sortGroupKey = `${item.type}:${parentId ?? 'root'}`
        const sort = item.sort ?? takeNextSort(counters, 'transactionCategory', sortGroupKey)
        const created = await transactionCategoryRepo.create(
          {
            data: {
              name: item.name,
              type: item.type,
              parentId,
              cashFlowType: item.cashFlowType,
              sort,
            },
          },
          tx,
        )
        currentId = created.id
        incImported(result, 'transactionCategories')
        summary?.unknownCategories.add(item.name)
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
          currentId,
          summary
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
      const account = await accountRepo.findFirst({ where: { name: ac.accountName } }, tx)
      if (!account) {
        result.errors.push(`投资资产类别关联账户不存在: ${ac.accountName}`)
        incSkipped(result, 'investmentAssetClasses')
        continue
      }

      const existing = await investmentAssetClassRepo.findFirst(
        { where: { accountId: account.id, name: ac.name } },
        tx,
      )

      if (existing) {
        if (mode === 'merge') {
          await investmentAssetClassRepo.update(
            {
              where: { id: existing.id },
              data: {
                targetRatio: ac.targetRatio ?? existing.targetRatio,
                sort: ac.sort ?? existing.sort,
              },
            },
            tx,
          )
          incUpdated(result, 'investmentAssetClasses')
        } else {
          incSkipped(result, 'investmentAssetClasses')
        }
      } else {
        await investmentAssetClassRepo.create(
          {
            data: {
              accountId: account.id,
              name: ac.name,
              targetRatio: ac.targetRatio,
              sort: ac.sort,
            },
          },
          tx,
        )
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
  tx: TransactionClient,
  summary?: ImportSummaryCollector
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
        mode,
        null,
        summary
      )
    }

    if (configData.data.accounts) {
      await importAccounts(
        configData.data.accounts,
        tx,
        result,
        accountCategoryNameMap,
        counters,
        mode,
        summary
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
        mode,
        null,
        summary
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

  await executeImport(tx)

  return result
}

// ─── 辅助函数 ───

function buildCategoryKey(type: string, name: string, parentId: string | null): string {
  return `${type}:${name}:${parentId ?? 'root'}`
}
