// ─── 通用类型定义 ───

import Papa from 'papaparse'
import { formatDateLocal, rootLogger } from '../../common/index.js'
import { type Minor } from '../../../../../packages/domain/src/index.js'
import type {
  ImportFileSummary,
  ImportFullResult,
  ImportSkippedRow,
} from '../../../../../packages/contracts/types/index.js'
import { type TransactionClient } from '../../prisma.js'

export const logger = rootLogger.child({ module: 'import' })

// Prisma 事务客户端类型（re-export 自 src/prisma.ts，单一来源）
export type { TransactionClient } from '../../prisma.js'
export type { ImportFullResult }

// ─── Account 缓存 ───

export interface AccountCache {
  id: string
  /** 原始账户名：缓存键会带上 type，这里保留名字用于同名歧义判定。 */
  name: string
  type: string
  categoryId: string | null
  isInvestment: boolean
}

// ─── 导入上下文（按数据类型拆分后，所有子模块共享） ───

/**
 * 导入文件摘要收集器。
 * 在解析过程中顺手累计，预览与正式导入共用同一段代码，
 * 所以预览看到的数字与真正写入的结果不会漂移。
 */
export interface ImportSummaryCollector {
  /** 可解析的流水笔数（含重复跳过的） */
  total: number
  /** 金额绝对值合计（分） */
  amountTotal: number
  dateFrom: Date | null
  dateTo: Date | null
  unknownAccounts: Set<string>
  unknownCategories: Set<string>
  duplicates: number
  /** 解析/入库失败被跳过的行；绝不静默丢弃 */
  skippedRows: ImportSkippedRow[]
  /** 已安全自动修正的行数（金额浮点尾差等） */
  autoFixedRows: number
}

export function createImportSummaryCollector(): ImportSummaryCollector {
  return {
    total: 0,
    amountTotal: 0,
    dateFrom: null,
    dateTo: null,
    unknownAccounts: new Set(),
    unknownCategories: new Set(),
    duplicates: 0,
    skippedRows: [],
    autoFixedRows: 0,
  }
}

/**
 * 记录一条被跳过的行。
 * 解析阶段拿到的原始字段优先；已经解析成 ParsedRow 的用核心字段还原。
 */
export function recordSkippedRow(
  summary: ImportSummaryCollector | undefined,
  rowNumber: number,
  reason: string,
  raw: Record<string, string>
): void {
  if (!summary) return
  summary.skippedRows.push({ rowNumber, reason, raw })
}

/** 只保留非空的核心字段，避免把账单图片 URL 等长字段塞进摘要。 */
export function compactCsvRaw(record: Record<string, string>): Record<string, string> {
  const keys = ['ID', '时间', '分类', '二级分类', '类型', '金额', '币种', '账户1', '账户2', '备注', '手续费', '优惠券', '账单标记', '关联账单']
  const raw: Record<string, string> = {}
  for (const key of keys) {
    const value = record[key]
    if (value) raw[key] = value
  }
  return raw
}

export function recordRowSummary(
  summary: ImportSummaryCollector | undefined,
  date: Date,
  amount: Minor
): void {
  if (!summary) return
  summary.total += 1
  summary.amountTotal += Math.abs(amount)
  if (!summary.dateFrom || date < summary.dateFrom) summary.dateFrom = date
  if (!summary.dateTo || date > summary.dateTo) summary.dateTo = date
}

export function toImportFileSummary(summary: ImportSummaryCollector): ImportFileSummary {
  return {
    total: summary.total,
    amountTotal: summary.amountTotal,
    dateFrom: summary.dateFrom ? formatDateLocal(summary.dateFrom) : null,
    dateTo: summary.dateTo ? formatDateLocal(summary.dateTo) : null,
    unknownAccounts: [...summary.unknownAccounts].sort(),
    unknownCategories: [...summary.unknownCategories].sort(),
    duplicates: summary.duplicates,
    skippedRows: [...summary.skippedRows],
    autoFixedRows: summary.autoFixedRows,
  }
}

export interface ImportContext {
  defaultAssetCategory: { id: string }
  defaultLiabilityCategory: { id: string }
  /** 账户缓存：键为 `${type}:${name}`，同名资产/负债是不同的两条记录。 */
  accountCache: Map<string, AccountCache>
  /** 同名账户候选：name → 全部同名的已加载/新建账户，用于判定跨类型歧义。 */
  accountCandidates: Map<string, AccountCache[]>
  accountCategoryCache: Map<string, { id: string; isInvestment: boolean }>
  transactionCategoryCache: Map<string, string>
  investmentAssetClassCache: Map<string, string>
  /**
   * 内存 sort 计数器：避免每次新建账户/分类时查 `MAX(sort)+1` 的 SQL。
   */
  sortCounters: SortCounters
  /** 文件摘要收集器（可选，单元测试可省略） */
  summary?: ImportSummaryCollector
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
  /** CSV 数据行号（含表头，从 1 起算），跳过行报错时用它定位。 */
  rowNumber: number
  csvId: string
  time: string
  category1: string
  category2: string
  typeStr: string
  amountStr: string
  account1: string
  account2: string
  note: string
  fee: Minor
  coupon: Minor
  relatedCsvId: string
  excludeFromIncomeExpense?: boolean // 账单标记为「不计收支」时导出为 true
}

// ─── Config 导入类型 ───

export interface ImportAccountCategory {
  name: string
  type: string
  sort: number
  isCashEquivalent?: boolean
  isInvestment?: boolean
  /** 受控图标 key；旧备份缺省时保持原值 / 默认图标。 */
  iconKey?: string | null
  children?: ImportAccountCategory[]
}

export interface ImportAccount {
  name: string
  type: string
  initialBalance?: string
  initialBalanceDate?: string
  sort?: number
  categoryName?: string
}

export interface ImportTransactionCategory {
  name: string
  type: string
  cashFlowType?: string
  /** 受控图标 key；旧备份缺省时保持原值 / 按名称映射。 */
  iconKey?: string | null
  sort: number
  children?: ImportTransactionCategory[]
}

export interface ImportInvestmentAssetClass {
  accountName: string
  name: string
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
//
// 结果结构定义在 packages/contracts——前后端共用一份，
// 预览与正式导入返回同一结构，预览数字才能直接和实际结果对照。

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

function incBucket(bucket: Record<string, number>, key: string, by: number): void {
  bucket[key] = (bucket[key] ?? 0) + by
}

export function incImported(result: { imported: Record<string, number> }, key: string, by = 1): void {
  incBucket(result.imported, key, by)
}

export function incUpdated(result: { updated: Record<string, number> }, key: string, by = 1): void {
  incBucket(result.updated, key, by)
}

export function incSkipped(result: { skipped: Record<string, number> | { snapshots: number } }, key: string, by = 1): void {
  incBucket(result.skipped as Record<string, number>, key, by)
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

// ─── 交易 CSV 表头（导出与导入共用的唯一来源）───
// 列名与顺序逐字固定：导出端按 `join(',')` 输出，导入端按此数组映射字段。
export const TRANSACTION_CSV_HEADER = [
  'ID', '时间', '分类', '二级分类', '类型', '金额', '币种',
  '账户1', '账户2', '备注', '已报销', '手续费', '优惠券',
  '记账者', '账单标记', '标签', '账单图片', '关联账单',
] as const


