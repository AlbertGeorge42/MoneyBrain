import { prisma } from '../index.js'
import { getNextAccountCategorySort } from './account-category.service.js'
import { getNextAccountSort } from './account.service.js'
import { getNextTransactionCategorySort } from './transaction-category.service.js'

interface ImportAccountCategory {
  name: string
  type: string
  icon?: string
  sort: number
  isCashEquivalent?: boolean
  isInvestment?: boolean
  children?: ImportAccountCategory[]
}

interface ImportAccount {
  name: string
  type: string
  initialBalance?: string
  initialBalanceDate?: string
  icon?: string
  color?: string
  sort?: number
  categoryName?: string
}

interface ImportTransactionCategory {
  name: string
  type: string
  icon?: string
  color?: string
  cashFlowType?: string
  sort: number
  children?: ImportTransactionCategory[]
}

interface ConfigImportData {
  version?: string
  type?: string
  data: {
    accounts?: ImportAccount[]
    accountCategories?: ImportAccountCategory[]
    transactionCategories?: ImportTransactionCategory[]
  }
}

export interface ImportConfigResult {
  imported: {
    accountCategories: number
    accounts: number
    transactionCategories: number
  }
  updated: {
    accountCategories: number
    accounts: number
    transactionCategories: number
  }
  skipped: {
    accountCategories: number
    accounts: number
    transactionCategories: number
  }
  errors: string[]
}

type TransactionClient = Parameters<Parameters<typeof prisma['$transaction']>[0]>[0]

export async function importConfig(
  configData: ConfigImportData,
  mode: 'merge' | 'overwrite'
): Promise<ImportConfigResult> {
  const result: ImportConfigResult = {
    imported: { accountCategories: 0, accounts: 0, transactionCategories: 0 },
    updated: { accountCategories: 0, accounts: 0, transactionCategories: 0 },
    skipped: { accountCategories: 0, accounts: 0, transactionCategories: 0 },
    errors: [],
  }

  await prisma.$transaction(async (tx) => {
    if (mode === 'overwrite') {
      await tx.account.deleteMany()
      await tx.accountCategory.deleteMany({ where: { parentId: { not: null } } })
      await tx.accountCategory.deleteMany()
      await tx.transactionCategory.deleteMany({ where: { parentId: { not: null } } })
      await tx.transactionCategory.deleteMany()
    }

    const accountCategoryNameMap = new Map<string, string>()
    const accountCategoryTypeMap = new Map<string, string>()

    if (configData.data.accountCategories) {
      await importAccountCategories(
        configData.data.accountCategories,
        tx,
        result,
        accountCategoryNameMap,
        accountCategoryTypeMap,
        mode
      )
    }

    if (configData.data.accounts) {
      await importAccounts(
        configData.data.accounts,
        tx,
        result,
        accountCategoryNameMap,
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
        mode
      )
    }
  })

  return result
}

async function importAccountCategories(
  categories: ImportAccountCategory[],
  tx: TransactionClient,
  result: ImportConfigResult,
  nameMap: Map<string, string>,
  typeMap: Map<string, string>,
  mode: string,
  parentId: string | null = null
): Promise<void> {
  for (const category of categories) {
    try {
      const existing = await tx.accountCategory.findFirst({
        where: { name: category.name, type: category.type, parentId },
      })

      if (existing) {
        if (mode === 'merge') {
          await tx.accountCategory.update({
            where: { id: existing.id },
            data: {
              icon: category.icon ?? existing.icon,
              sort: category.sort ?? existing.sort,
              isCashEquivalent: category.isCashEquivalent ?? existing.isCashEquivalent,
              isInvestment: category.isInvestment ?? existing.isInvestment,
            },
          })
          nameMap.set(category.name, existing.id)
          typeMap.set(category.name, existing.type)
          result.updated.accountCategories++
        } else {
          result.skipped.accountCategories++
        }
      } else {
        const sort = category.sort ?? (await getNextAccountCategorySort(category.type))
        const created = await tx.accountCategory.create({
          data: {
            name: category.name,
            type: category.type,
            icon: category.icon,
            sort,
            parentId,
            isCashEquivalent: category.isCashEquivalent ?? false,
            isInvestment: category.isInvestment ?? false,
          },
        })
        nameMap.set(category.name, created.id)
        typeMap.set(category.name, created.type)
        result.imported.accountCategories++
      }

      const currentId = nameMap.get(category.name)!

      if (category.children && category.children.length > 0) {
        await importAccountCategories(
          category.children,
          tx,
          result,
          nameMap,
          typeMap,
          mode,
          currentId
        )
      }
    } catch (error) {
      result.errors.push(`账户分类 "${category.name}" 导入失败: ${(error as Error).message}`)
      result.skipped.accountCategories++
    }
  }
}

async function importAccounts(
  accounts: ImportAccount[],
  tx: TransactionClient,
  result: ImportConfigResult,
  categoryNameMap: Map<string, string>,
  mode: string
): Promise<void> {
  for (const account of accounts) {
    try {
      const existing = await tx.account.findFirst({
        where: { name: account.name },
      })

      let categoryId: string | null = null
      if (account.categoryName && categoryNameMap.has(account.categoryName)) {
        categoryId = categoryNameMap.get(account.categoryName)!
      } else {
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
              initialBalance: account.initialBalance ? parseFloat(account.initialBalance) : existing.initialBalance,
              initialBalanceDate: account.initialBalanceDate ? new Date(account.initialBalanceDate) : existing.initialBalanceDate,
              icon: account.icon ?? existing.icon,
              color: account.color ?? existing.color,
              sort: account.sort ?? existing.sort,
              categoryId: categoryId ?? existing.categoryId,
            },
          })
          result.updated.accounts++
        } else {
          result.skipped.accounts++
        }
      } else {
        const sort = account.sort ?? (await getNextAccountSort(categoryId))
        await tx.account.create({
          data: {
            name: account.name,
            type: account.type,
            initialBalance: account.initialBalance ? parseFloat(account.initialBalance) : 0,
            initialBalanceDate: account.initialBalanceDate ? new Date(account.initialBalanceDate) : null,
            icon: account.icon,
            color: account.color,
            sort,
            categoryId,
          },
        })
        result.imported.accounts++
      }
    } catch (error) {
      result.errors.push(`账户 "${account.name}" 导入失败: ${(error as Error).message}`)
      result.skipped.accounts++
    }
  }
}

async function importTransactionCategories(
  categories: ImportTransactionCategory[],
  tx: TransactionClient,
  result: ImportConfigResult,
  nameMap: Map<string, string>,
  mode: string,
  parentId: string | null = null
): Promise<void> {
  for (const category of categories) {
    try {
      const existing = await tx.transactionCategory.findFirst({
        where: { name: category.name, type: category.type, parentId },
      })

      if (existing) {
        if (mode === 'merge') {
          await tx.transactionCategory.update({
            where: { id: existing.id },
            data: {
              icon: category.icon ?? existing.icon,
              color: category.color ?? existing.color,
              cashFlowType: category.cashFlowType ?? existing.cashFlowType,
              sort: category.sort ?? existing.sort,
            },
          })
          nameMap.set(`${category.type}:${category.name}`, existing.id)
          result.updated.transactionCategories++
        } else {
          result.skipped.transactionCategories++
        }
      } else {
        const sort = category.sort ?? (await getNextTransactionCategorySort(category.type, parentId))
        const created = await tx.transactionCategory.create({
          data: {
            name: category.name,
            type: category.type,
            icon: category.icon,
            color: category.color,
            cashFlowType: category.cashFlowType,
            sort,
            parentId,
          },
        })
        nameMap.set(`${category.type}:${category.name}`, created.id)
        result.imported.transactionCategories++
      }

      const currentId = nameMap.get(`${category.type}:${category.name}`)!

      if (category.children && category.children.length > 0) {
        await importTransactionCategories(
          category.children,
          tx,
          result,
          nameMap,
          mode,
          currentId
        )
      }
    } catch (error) {
      result.errors.push(`收支分类 "${category.name}" 导入失败: ${(error as Error).message}`)
      result.skipped.transactionCategories++
    }
  }
}
