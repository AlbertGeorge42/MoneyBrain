// ─── 通用类型定义 ───

import Papa from 'papaparse'
import { prisma } from '../../index.js'
import { rootLogger } from '../../common/index.js'

export const logger = rootLogger.child({ module: 'import' })

// AntD 13 个官方预设色（与前端 colorPalette.ts 保持一致）
const ANTD_PRESET_COLORS = new Set([
  'red',
  'volcano',
  'orange',
  'gold',
  'yellow',
  'lime',
  'green',
  'cyan',
  'blue',
  'geekblue',
  'purple',
  'magenta',
  'pink',
])

/**
 * 校验颜色字符串是否是 AntD 13 官方预设色之一。
 * 用于导入时拒绝非预设色，避免前端 CategoryIcon 落回中性态。
 */
export function isAntDPresetColor(value: string | null | undefined): value is string {
  if (!value) return false
  return ANTD_PRESET_COLORS.has(value)
}

// Prisma 事务客户端类型
export type TransactionClient = Parameters<Parameters<typeof prisma['$transaction']>[0]>[0]

// ─── Account 缓存 ───

export interface AccountCache {
  id: string
  type: string
  categoryId: string | null
  isInvestment: boolean
}

// ─── 导入上下文（按数据类型拆分后，所有子模块共享） ───

export interface ImportContext {
  defaultAssetCategory: { id: string }
  defaultLiabilityCategory: { id: string }
  accountCache: Map<string, AccountCache>
  accountCategoryCache: Map<string, { id: string; isInvestment: boolean }>
  transactionCategoryCache: Map<string, string>
  investmentAssetClassCache: Map<string, string>
  /**
   * 内存 sort 计数器：避免每次新建账户/分类时查 `MAX(sort)+1` 的 SQL。
   */
  sortCounters: SortCounters
}

// ─── Sort 计数器（避免导入过程中反复查 MAX(sort)+1） ───

export interface SortCounters {
  account: Map<string, number>
  accountCategory: Map<string, number>
  transactionCategory: Map<string, number>
}

/**
 * 基于现有数据预计算各模型下一可用 sort 值。
 * - account: key = categoryId
 * - accountCategory: key = type（仅顶层分类）
 * - transactionCategory: key = `${type}:${parentId ?? 'root'}`
 */
export async function buildSortCounters(client: TransactionClient): Promise<SortCounters> {
  const [accounts, accountCategories, transactionCategories] = await Promise.all([
    client.account.findMany({ select: { categoryId: true, sort: true } }),
    client.accountCategory.findMany({ select: { type: true, parentId: true, sort: true } }),
    client.transactionCategory.findMany({ select: { type: true, parentId: true, sort: true } }),
  ])

  const account = new Map<string, number>()
  for (const a of accounts) {
    if (!a.categoryId) continue
    const cur = account.get(a.categoryId) ?? 0
    if (a.sort > cur) account.set(a.categoryId, a.sort)
  }
  for (const [key, val] of account) {
    account.set(key, val + 1)
  }

  const accountCategory = new Map<string, number>()
  for (const c of accountCategories) {
    if (c.parentId) continue
    const key = c.type
    const cur = accountCategory.get(key) ?? 0
    if (c.sort > cur) accountCategory.set(key, c.sort)
  }
  for (const [key, val] of accountCategory) {
    accountCategory.set(key, val + 1)
  }

  const transactionCategory = new Map<string, number>()
  for (const c of transactionCategories) {
    const key = `${c.type}:${c.parentId ?? 'root'}`
    const cur = transactionCategory.get(key) ?? 0
    if (c.sort > cur) transactionCategory.set(key, c.sort)
  }
  for (const [key, val] of transactionCategory) {
    transactionCategory.set(key, val + 1)
  }

  return { account, accountCategory, transactionCategory }
}

/**
 * 从内存计数器取下一个 sort 值并递增。
 */
export function takeNextSort(
  counters: SortCounters,
  model: keyof SortCounters,
  groupKey: string
): number {
  const next = counters[model].get(groupKey) ?? 1
  counters[model].set(groupKey, next + 1)
  return next
}

// ─── ParsedRow（CSV 交易） ───

export interface ParsedRow {
  csvId: string
  time: string
  category1: string
  category2: string
  typeStr: string
  amountStr: string
  account1: string
  account2: string
  note: string
  fee: number
  coupon: number
  relatedCsvId: string
}

// ─── Config 导入类型 ───

export interface ImportAccountCategory {
  name: string
  type: string
  icon?: string
  color?: string
  sort: number
  isCashEquivalent?: boolean
  isInvestment?: boolean
  children?: ImportAccountCategory[]
}

export interface ImportAccount {
  name: string
  type: string
  initialBalance?: string
  initialBalanceDate?: string
  icon?: string
  color?: string
  sort?: number
  categoryName?: string
}

export interface ImportTransactionCategory {
  name: string
  type: string
  icon?: string
  color?: string
  cashFlowType?: string
  sort: number
  children?: ImportTransactionCategory[]
}

export interface ImportInvestmentAssetClass {
  accountName: string
  name: string
  icon: string | null
  color: string | null
  targetRatio: number | null
  sort: number
}

export interface ConfigImportData {
  version?: string
  type?: string
  data: {
    accounts?: ImportAccount[]
    accountCategories?: ImportAccountCategory[]
    transactionCategories?: ImportTransactionCategory[]
    investmentAssetClasses?: ImportInvestmentAssetClass[]
  }
}

export interface ImportConfigResult {
  imported: {
    accountCategories: number
    accounts: number
    transactionCategories: number
    investmentAssetClasses: number
  }
  updated: {
    accountCategories: number
    accounts: number
    transactionCategories: number
    investmentAssetClasses: number
  }
  skipped: {
    accountCategories: number
    accounts: number
    transactionCategories: number
    investmentAssetClasses: number
  }
  errors: string[]
}

// ─── Budget 导入类型 ───

export interface ImportBudget {
  name: string
  type: string
  amount: string
  period: string
  startDate: string
  endDate?: string | null
  transactionTime?: number | null
  note?: string | null
  isActive?: boolean
  accountName: string
  toAccountName?: string | null
  categoryName: string
}

export interface BudgetImportData {
  version?: string
  type?: string
  data: {
    budgets: ImportBudget[]
  }
}

export interface ImportBudgetResult {
  imported: number
  updated: number
  skipped: number
  errors: string[]
}

// ─── 投资快照导入类型 ───

export interface ImportSnapshotCsvRow {
  accountName: string
  date: string
  accountBalance: string
  previousSnapshotDate: string
  note: string
  assetClassName: string
  marketValue: string
  periodNetFlow: string
  sort: string
}

export interface ImportSnapshotsResult {
  imported: { snapshots: number; items: number }
  updated: { snapshots: number }
  skipped: { snapshots: number }
  errors: string[]
}

// ─── 智能导入（ZIP/CSV/JSON）总结果 ───

export interface ImportFullResult {
  imported: {
    accountCategories: number
    accounts: number
    transactionCategories: number
    transactions: number
    budgets: number
    investmentSnapshots: number
    investmentItems: number
  }
  updated: {
    accountCategories: number
    accounts: number
    transactionCategories: number
    budgets: number
    investmentSnapshots: number
  }
  skipped: {
    accountCategories: number
    accounts: number
    transactionCategories: number
    transactions: number
    budgets: number
    investmentSnapshots: number
  }
  errors: string[]
}

export function createEmptyImportFullResult(): ImportFullResult {
  return {
    imported: {
      accountCategories: 0,
      accounts: 0,
      transactionCategories: 0,
      transactions: 0,
      budgets: 0,
      investmentSnapshots: 0,
      investmentItems: 0,
    },
    updated: {
      accountCategories: 0,
      accounts: 0,
      transactionCategories: 0,
      budgets: 0,
      investmentSnapshots: 0,
    },
    skipped: {
      accountCategories: 0,
      accounts: 0,
      transactionCategories: 0,
      transactions: 0,
      budgets: 0,
      investmentSnapshots: 0,
    },
    errors: [],
  }
}

// ─── Counter 辅助函数（避免到处 ++） ───

export function incImported(
  result: { imported: Record<string, number> },
  key: string,
  by = 1
): void {
  result.imported[key] = (result.imported[key] ?? 0) + by
}

export function incUpdated(
  result: { updated: Record<string, number> },
  key: string,
  by = 1
): void {
  result.updated[key] = (result.updated[key] ?? 0) + by
}

export function incSkipped(
  result: { skipped: Record<string, number> | { snapshots: number } },
  key: string,
  by = 1
): void {
  const bucket = result.skipped as Record<string, number>
  bucket[key] = (bucket[key] ?? 0) + by
}

// ─── 通用 CSV 记录读取（使用 papaparse） ───

/**
 * 读取 CSV 内容并返回按字段名索引的记录数组。
 * - papaparse 自动处理 UTF-8 BOM、引号转义、换行符
 * - 默认 trim 字段值
 * - 跳过空行
 */
export function readCsvRecords<T extends string>(
  buffer: Buffer | string,
  headers: readonly T[],
  options: { trim?: boolean } = {}
): Record<T, string>[] {
  const trim = options.trim ?? true
  const text = typeof buffer === 'string' ? buffer : buffer.toString('utf-8')

  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
  })

  if (result.errors.length > 0 && result.data.length === 0) {
    return []
  }

  const headerSet = new Set(headers as readonly string[])
  const records: Record<T, string>[] = []

  for (const row of result.data as Record<string, string>[]) {
    const record = {} as Record<T, string>
    for (const field of headers) {
      const value = row[field] ?? ''
      record[field] = headerSet.has(field) && trim ? value.trim() : value
    }
    records.push(record)
  }

  return records
}

// ─── 字符串映射器（去除 UTF-8 BOM） ───

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}


