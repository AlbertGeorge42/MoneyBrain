import { prisma } from '../index.js'

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

interface TreeNode {
  id: string
  parentId: string | null
  name: string
  type: string
  sort: number
  children?: TreeNode[]
}

function buildCategoryTree(items: TreeNode[]): TreeNode[] {
  const itemMap = new Map<string, TreeNode>()
  const roots: TreeNode[] = []

  for (const item of items) {
    itemMap.set(item.id, { ...item, children: [] })
  }

  for (const item of items) {
    const node = itemMap.get(item.id)!
    if (item.parentId && itemMap.has(item.parentId)) {
      const parent = itemMap.get(item.parentId)!
      if (!parent.children) parent.children = []
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

function serializeAccountCategory(category: TreeNode & { icon?: string; isCashEquivalent: boolean; isInvestment: boolean }): ExportAccountCategory {
  const result: ExportAccountCategory = {
    name: category.name,
    type: category.type,
    icon: category.icon,
    sort: category.sort,
    isCashEquivalent: category.isCashEquivalent,
    isInvestment: category.isInvestment,
  }
  if (category.children && category.children.length > 0) {
    result.children = category.children.map((child) => serializeAccountCategory(child as TreeNode & { icon?: string; isCashEquivalent: boolean; isInvestment: boolean }))
  }
  return result
}

function serializeTransactionCategory(category: TreeNode & { icon?: string; color?: string; cashFlowType?: string }): ExportTransactionCategory {
  const result: ExportTransactionCategory = {
    name: category.name,
    type: category.type,
    icon: category.icon,
    color: category.color,
    cashFlowType: category.cashFlowType ?? null,
    sort: category.sort,
  }
  if (category.children && category.children.length > 0) {
    result.children = category.children.map((child) => serializeTransactionCategory(child as TreeNode & { icon?: string; color?: string; cashFlowType?: string }))
  }
  return result
}

export async function exportConfig(): Promise<string> {
  const categoryMap = new Map<string, string>()

  const data: ConfigBackupData['data'] = {}

  // 导出账户分类
  const accountCategories = await prisma.accountCategory.findMany({
    orderBy: { sort: 'asc' },
  })
  for (const c of accountCategories) {
    categoryMap.set(c.id, c.name)
  }
  const accountCategoryTreeNodes: TreeNode[] = accountCategories.map((c) => ({
    id: c.id,
    parentId: c.parentId,
    name: c.name,
    type: c.type,
    sort: c.sort,
    icon: c.icon ?? undefined,
    isCashEquivalent: c.isCashEquivalent,
    isInvestment: c.isInvestment,
  }))
  const accountCategoryTree = buildCategoryTree(accountCategoryTreeNodes)
  data.accountCategories = accountCategoryTree.map((cat) => serializeAccountCategory(cat as TreeNode & { icon?: string; isCashEquivalent: boolean; isInvestment: boolean }))

  // 导出账户
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

  // 导出收支分类
  const transactionCategories = await prisma.transactionCategory.findMany({
    orderBy: { sort: 'asc' },
  })
  const transactionCategoryTreeNodes: TreeNode[] = transactionCategories.map((c) => ({
    id: c.id,
    parentId: c.parentId,
    name: c.name,
    type: c.type,
    sort: c.sort,
    icon: c.icon ?? undefined,
    color: c.color ?? undefined,
    cashFlowType: c.cashFlowType ?? undefined,
  }))
  const transactionCategoryTree = buildCategoryTree(transactionCategoryTreeNodes)
  data.transactionCategories = transactionCategoryTree.map((cat) => serializeTransactionCategory(cat as TreeNode & { icon?: string; color?: string; cashFlowType?: string }))

  const result: ConfigBackupData = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    type: 'config',
    data,
  }

  return JSON.stringify(result, null, 2)
}
