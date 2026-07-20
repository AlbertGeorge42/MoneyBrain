import { prisma } from '../../index.js'
import { buildTree } from '../../common/tree.js'
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

function serializeAccountCategory(category: { name: string; type: string; icon?: string; sort: number; isCashEquivalent: boolean; isInvestment: boolean; children: unknown[] }): ImportAccountCategory {
  const result: ImportAccountCategory = {
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

function serializeTransactionCategory(category: { name: string; type: string; icon?: string; color?: string; cashFlowType?: string; sort: number; children: unknown[] }): ImportTransactionCategory {
  const result: ImportTransactionCategory = {
    name: category.name,
    type: category.type,
    icon: category.icon,
    color: category.color,
    cashFlowType: category.cashFlowType,
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
      color: c.color ?? undefined,
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
    initialBalanceDate: a.initialBalanceDate?.toISOString().split('T')[0],
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

  // 投资资产类别（属于配置数据）
  const investmentAssetClasses = await prisma.investmentAssetClass.findMany({
    include: {
      account: { select: { name: true } }
    },
    orderBy: [{ accountId: 'asc' }, { sort: 'asc' }]
  })
  data.investmentAssetClasses = investmentAssetClasses.map(ac => ({
    accountName: ac.account.name,
    name: ac.name,
    icon: ac.icon,
    color: ac.color,
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
