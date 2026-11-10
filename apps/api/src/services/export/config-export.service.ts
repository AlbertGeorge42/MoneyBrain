import { buildTree } from '../../common/tree.js'
import { formatDateLocal } from '../../common/index.js'
import { formatAmount, minor } from '../../../../../packages/domain/src/index.js'
import * as accountRepo from '../../db/repositories/account.repository.js'
import * as accountCategoryRepo from '../../db/repositories/account-category.repository.js'
import * as transactionCategoryRepo from '../../db/repositories/transaction-category.repository.js'
import * as assetClassRepo from '../../db/repositories/investment-asset-class.repository.js'
import {
  type ImportAccount,
  type ImportAccountCategory,
  type ImportInvestmentAssetClass,
  type ImportTransactionCategory,
} from '../import/shared.js'

interface ConfigBackupData {
  exportedAt: string
  type: string
  data: {
    accounts?: ImportAccount[]
    accountCategories?: ImportAccountCategory[]
    transactionCategories?: ImportTransactionCategory[]
    investmentAssetClasses?: ImportInvestmentAssetClass[]
  }
}

/** 分类树递归序列化的共享骨架：字段映射交给 makeBase，iconKey 与 children 在这里统一处理。 */
function serializeCategoryTree<T>(
  category: { iconKey?: string | null; children: unknown[] },
  makeBase: (node: unknown) => T,
): T {
  const result = makeBase(category) as T & { iconKey?: string | null; children?: T[] }
  if (category.iconKey) result.iconKey = category.iconKey
  if (category.children.length > 0) {
    result.children = category.children.map((child) =>
      serializeCategoryTree(child as { iconKey?: string | null; children: unknown[] }, makeBase)
    )
  }
  return result
}

function serializeAccountCategory(category: { name: string; type: string; sort: number; isCashEquivalent: boolean; isInvestment: boolean; iconKey?: string | null; children: unknown[] }): ImportAccountCategory {
  // 旧账本 iconKey 为 null：不写进备份，保持导出格式向后兼容。
  return serializeCategoryTree(category, (node) => {
    const c = node as Parameters<typeof serializeAccountCategory>[0]
    return {
      name: c.name,
      type: c.type,
      sort: c.sort,
      isCashEquivalent: c.isCashEquivalent,
      isInvestment: c.isInvestment,
    }
  })
}

function serializeTransactionCategory(category: { name: string; type: string; cashFlowType?: string; iconKey?: string | null; sort: number; children: unknown[] }): ImportTransactionCategory {
  return serializeCategoryTree(category, (node) => {
    const c = node as Parameters<typeof serializeTransactionCategory>[0]
    return {
      name: c.name,
      type: c.type,
      cashFlowType: c.cashFlowType,
      sort: c.sort,
    }
  })
}

export async function exportConfig(): Promise<string> {
  const data: ConfigBackupData['data'] = {}

  const accountCategories = await accountCategoryRepo.findMany({
    orderBy: { sort: 'asc' },
  })
  const accountCategoryTree = buildTree(
    accountCategories.map(c => ({
      id: c.id,
      parentId: c.parentId,
      name: c.name,
      type: c.type,
      sort: c.sort,
      isCashEquivalent: c.isCashEquivalent,
      isInvestment: c.isInvestment,
    }))
  )
  data.accountCategories = accountCategoryTree.map((cat) => serializeAccountCategory(cat as Parameters<typeof serializeAccountCategory>[0]))

  const accounts = await accountRepo.findMany({
    orderBy: { sort: 'asc' },
    include: { category: true },
  })
  data.accounts = accounts.map((a) => ({
    name: a.name,
    type: a.type,
    initialBalance: formatAmount(minor(Number(a.initialBalance))),
    // 用本地格式导出，保持与导入时的字符串格式一致（round-trip 不回退一天）
    // 原可选链语义：null 时输出 undefined（JSON 序列化时省略该字段）
    initialBalanceDate: a.initialBalanceDate ? formatDateLocal(a.initialBalanceDate) : undefined,
    sort: a.sort,
    categoryName: a.category?.name ?? undefined,
  }))

  const transactionCategories = await transactionCategoryRepo.findMany({
    orderBy: { sort: 'asc' },
  })
  const transactionCategoryTree = buildTree(
    transactionCategories.map(c => ({
      id: c.id,
      parentId: c.parentId,
      name: c.name,
      type: c.type,
      sort: c.sort,
      cashFlowType: c.cashFlowType ?? undefined,
    }))
  )
  data.transactionCategories = transactionCategoryTree.map((cat) => serializeTransactionCategory(cat as Parameters<typeof serializeTransactionCategory>[0]))

  // 投资资产类别（属于配置数据）
  const investmentAssetClasses = await assetClassRepo.findMany({
    include: {
      account: { select: { name: true } }
    },
    orderBy: [{ accountId: 'asc' }, { sort: 'asc' }]
  })
  data.investmentAssetClasses = investmentAssetClasses.map(ac => ({
    accountName: ac.account.name,
    name: ac.name,
    // Prisma 返回 Decimal | null；JSON 序列化前转 number（Decimal 会被序列化为字符串，破坏向后兼容）
    targetRatio: ac.targetRatio == null ? null : Number(ac.targetRatio),
    sort: ac.sort
  }))

  const result: ConfigBackupData = {
    exportedAt: new Date().toISOString(),
    type: 'config',
    data,
  }

  return JSON.stringify(result, null, 2)
}
