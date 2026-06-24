import { prisma } from '../index.js'
import { buildTree } from '../common/tree.js'
import { createBackupZip, createManifest, type BackupFiles } from './backup.service.js'

// ─── CSV 事务导出 ───

export async function exportTransactionsCSV(startDate?: Date, endDate?: Date): Promise<string> {
  const transactions = await prisma.transaction.findMany({
    where: {
      ...(startDate || endDate ? {
        date: {
          ...(startDate ? { gte: startDate } : {}),
          ...(endDate ? { lte: endDate } : {}),
        },
      } : {}),
    },
    include: {
      account: true,
      toAccount: true,
      category: true,
      relatedTransaction: {
        include: { account: true, category: true },
      },
    },
    orderBy: { date: 'desc' },
  })

  const idMap: Record<string, string> = {}
  transactions.forEach(t => {
    idMap[t.id] = `mb${Date.now()}${Math.random().toString(36).substr(2, 9)}`
  })

  const csvRows: string[] = []
  csvRows.push('ID,时间,分类,二级分类,类型,金额,币种,账户1,账户2,备注,已报销,手续费,优惠券,记账者,账单标记,标签,账单图片,关联账单')

  for (const t of transactions) {
    const id = idMap[t.id]
    const date = new Date(t.date)
      .toLocaleString('zh-CN', { hour12: false })
      .replace(/\//g, '-')
    const category1 = t.category?.name || '未分类'
    const category2 = ''
    let type: string
    if (t.type === 'income') type = '收入'
    else if (t.type === 'transfer') type = '转账'
    else if (t.type === 'refund') type = '退款'
    else type = '支出'

    const amount = t.amount.toNumber()
    const currency = 'CNY'
    const account1 = t.account?.name || ''
    const account2 = t.toAccount?.name || ''
    const note = (t.note || '').replace(/,/g, '，').replace(/\n/g, ' ')
    const reimbursed = ''
    const fee = t.fee?.toNumber() || 0
    const coupon = t.coupon?.toNumber() || 0
    const recorder = 'MoneyBrain'
    const billMark = ''
    const tags = ''
    const images = ''
    const relatedBill = t.relatedTransactionId ? (idMap[t.relatedTransactionId] || '') : ''

    csvRows.push(
      `${id},${date},${category1},${category2},${type},${amount},${currency},${account1},${account2},${note},${reimbursed},${fee},${coupon},${recorder},${billMark},${tags},${images},${relatedBill}`
    )
  }

  return '\uFEFF' + csvRows.join('\n')
}

// ─── 数据清空 ───

export async function clearAllData(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // 投资相关（子表先于父表）
    await tx.investmentAllocationItem.deleteMany()
    await tx.investmentAllocationSnapshot.deleteMany()
    await tx.investmentAssetClass.deleteMany()

    // 预算
    await tx.budget.deleteMany()

    // 交易（先于账户和分类删除，因为交易引用账户和分类）
    await tx.transaction.deleteMany()

    // 账户（引用账户分类，必须先于账户分类删除）
    await tx.account.deleteMany()

    // 账户分类（先子分类后父分类）
    await tx.accountCategory.deleteMany({ where: { parentId: { not: null } } })
    await tx.accountCategory.deleteMany()

    // 收支分类（先子分类后父分类）
    await tx.transactionCategory.deleteMany({ where: { parentId: { not: null } } })
    await tx.transactionCategory.deleteMany()
  })
}

export async function clearTransactionsOnly(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // 投资相关
    await tx.investmentAllocationItem.deleteMany()
    await tx.investmentAllocationSnapshot.deleteMany()

    // 预算
    await tx.budget.deleteMany()

    // 交易
    await tx.transaction.deleteMany()
  })
}

// ─── 配置导出 ───

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

interface ExportInvestmentAssetClass {
  accountName: string
  name: string
  icon: string | null
  targetRatio: number | null
  sort: number
}

interface ConfigBackupData {
  version: string
  exportedAt: string
  type: string
  data: {
    accounts?: ExportAccount[]
    accountCategories?: ExportAccountCategory[]
    transactionCategories?: ExportTransactionCategory[]
    investmentAssetClasses?: ExportInvestmentAssetClass[]
  }
}

function serializeAccountCategory(category: { name: string; type: string; icon?: string; sort: number; isCashEquivalent: boolean; isInvestment: boolean; children: unknown[] }): ExportAccountCategory {
  const result: ExportAccountCategory = {
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

function serializeTransactionCategory(category: { name: string; type: string; icon?: string; color?: string; cashFlowType?: string; sort: number; children: unknown[] }): ExportTransactionCategory {
  const result: ExportTransactionCategory = {
    name: category.name,
    type: category.type,
    icon: category.icon,
    color: category.color,
    cashFlowType: category.cashFlowType ?? null,
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
    initialBalanceDate: a.initialBalanceDate?.toISOString().split('T')[0] ?? null,
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
    targetRatio: ac.targetRatio,
    sort: ac.sort
  }))

  const result: ConfigBackupData = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    type: 'config',
    data,
  }

  return JSON.stringify(result, null, 2)
}

// ─── 预算导出 ───

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

// ─── 投资快照导出（CSV 格式） ───

/**
 * 转义 CSV 字段值
 */
function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * 导出投资快照为 CSV 格式
 * 资产类别已移至 config 导出
 */
export async function exportInvestmentSnapshotsCSV(): Promise<string> {
  const snapshots = await prisma.investmentAllocationSnapshot.findMany({
    include: {
      account: { select: { name: true } },
      previousSnapshot: { select: { date: true } },
      items: {
        include: { assetClass: true },
        orderBy: { sort: 'asc' }
      }
    },
    orderBy: [{ accountId: 'asc' }, { date: 'asc' }]
  })

  // CSV 表头
  const headers = [
    '账户名称',
    '快照日期',
    '账户余额',
    '上次快照日期',
    '备注',
    '资产类别',
    '市值',
    '期内净流入',
    '排序'
  ]

  const rows: string[] = [headers.join(',')]

  for (const s of snapshots) {
    const commonFields = [
      escapeCsvField(s.account.name),
      escapeCsvField(s.date.toISOString()),
      escapeCsvField(s.accountBalance),
      escapeCsvField(s.previousSnapshot?.date.toISOString() ?? ''),
      escapeCsvField(s.note ?? '')
    ]

    if (s.items.length === 0) {
      // 没有分配项时也输出一行（保留快照信息）
      rows.push([...commonFields, '', '', '', ''].join(','))
    } else {
      for (const item of s.items) {
        rows.push([
          ...commonFields,
          escapeCsvField(item.assetClass.name),
          escapeCsvField(item.marketValue),
          escapeCsvField(item.periodNetFlow),
          escapeCsvField(item.sort)
        ].join(','))
      }
    }
  }

  // 添加 UTF-8 BOM 以便 Excel 正确识别中文
  return '\ufeff' + rows.join('\n')
}

// ─── 自定义导出 ───

export interface ExportResult {
  buffer: Buffer
  filename: string
  contentType: string
}

/**
 * 完整备份导出（始终为 ZIP）
 */
export async function exportFullBackup(): Promise<Buffer> {
  const includes = ['transactions', 'config', 'budgets', 'snapshots']
  const files: BackupFiles = {}

  // 导出交易记录
  const csvContent = await exportTransactionsCSV()
  files.transactions = Buffer.from(csvContent, 'utf-8')

  // 导出配置信息（含投资资产类别）
  const configContent = await exportConfig()
  files.config = configContent

  // 导出预算配置
  const budgetsContent = await exportBudgets()
  files.budgets = budgetsContent

  // 导出投资快照（CSV 格式）
  const snapshotsContent = await exportInvestmentSnapshotsCSV()
  files.snapshots = Buffer.from(snapshotsContent, 'utf-8')

  // 创建manifest
  files.manifest = await createManifest(includes)

  // 打包为ZIP
  return await createBackupZip(files)
}

/**
 * 自定义导出
 * - 仅选择一种数据类型时，直接返回该格式的单个文件（不打包为 ZIP）
 * - 选择多种数据类型时，打包为 ZIP
 */
export async function exportCustomBackup(includes: string[]): Promise<ExportResult> {
  const date = new Date().toISOString().split('T')[0]

  // 单文件导出场景：仅选择一种数据类型
  if (includes.length === 1) {
    const type = includes[0]
    if (type === 'transactions') {
      const csvContent = await exportTransactionsCSV()
      return {
        buffer: Buffer.from(csvContent, 'utf-8'),
        filename: `moneybrain-transactions-${date}.csv`,
        contentType: 'text/csv; charset=utf-8'
      }
    }
    if (type === 'config') {
      const jsonContent = await exportConfig()
      return {
        buffer: Buffer.from(jsonContent, 'utf-8'),
        filename: `moneybrain-config-${date}.json`,
        contentType: 'application/json; charset=utf-8'
      }
    }
    if (type === 'budgets') {
      const jsonContent = await exportBudgets()
      return {
        buffer: Buffer.from(jsonContent, 'utf-8'),
        filename: `moneybrain-budgets-${date}.json`,
        contentType: 'application/json; charset=utf-8'
      }
    }
    if (type === 'snapshots') {
      const csvContent = await exportInvestmentSnapshotsCSV()
      return {
        buffer: Buffer.from(csvContent, 'utf-8'),
        filename: `moneybrain-snapshots-${date}.csv`,
        contentType: 'text/csv; charset=utf-8'
      }
    }
  }

  // 多文件导出场景：打包为 ZIP
  const files: BackupFiles = {}

  if (includes.includes('transactions')) {
    const csvContent = await exportTransactionsCSV()
    files.transactions = Buffer.from(csvContent, 'utf-8')
  }
  if (includes.includes('config')) {
    const jsonContent = await exportConfig()
    files.config = jsonContent
  }
  if (includes.includes('budgets')) {
    const jsonContent = await exportBudgets()
    files.budgets = jsonContent
  }
  if (includes.includes('snapshots')) {
    const csvContent = await exportInvestmentSnapshotsCSV()
    files.snapshots = Buffer.from(csvContent, 'utf-8')
  }

  // 创建manifest
  files.manifest = await createManifest(includes)

  const zipBuffer = await createBackupZip(files)
  return {
    buffer: zipBuffer,
    filename: `moneybrain-backup-${date}.zip`,
    contentType: 'application/zip'
  }
}
