// ─── 智能导入（ZIP / CSV / JSON） ───

import { prisma } from '../../index.js'
import { parseBackupZip, detectFileType, detectFileIncludes } from '../backup.service.js'
import { clearAllDataForImport } from '../clear-data.service.js'
import { importConfig } from './config-import.service.js'
import { importBudgets } from './budget-import.service.js'
import { importSnapshotsFromCsv } from './snapshot-import.service.js'
import { importTransactionsFromCsv } from './transaction-import.service.js'
import {
  type ImportFullResult,
  type ImportSnapshotsResult,
  type ImportConfigResult,
  type ImportBudgetResult,
  createEmptyImportFullResult,
  stripBom,
} from './shared.js'

// ─── ZIP 备份导入 ───

async function importZipBackup(
  file: Buffer,
  mode: 'merge' | 'overwrite',
  result: ImportFullResult
): Promise<ImportFullResult> {
  const files = await parseBackupZip(file)
  const includes = files.manifest?.includes ?? []
  const detected = await detectFileIncludes(file, 'zip')
  const allIncludes = includes.length > 0 ? includes : detected

  // Wrap everything in a single transaction for atomicity
  await prisma.$transaction(async (tx) => {
    // 覆盖模式下，先清空所有数据（在同一事务内）
    if (mode === 'overwrite') {
      await clearAllDataForImport(tx)
    }

    // 按依赖顺序导入：先 config，再 transactions，最后 budgets/snapshots
    if (allIncludes.includes('config') && files.config) {
      const configResult: ImportConfigResult = await importConfig(JSON.parse(files.config), mode, tx)
      mergeConfigResult(result, configResult)
    }

    if (allIncludes.includes('transactions') && files.transactions) {
      const transactionResult = await importTransactionsFromCsv(files.transactions, undefined, undefined, tx)
      result.imported.transactions = transactionResult.imported
      result.skipped.transactions = transactionResult.skipped
    }

    if (allIncludes.includes('budgets') && files.budgets) {
      const budgetResult: ImportBudgetResult = await importBudgets(JSON.parse(files.budgets), mode, tx)
      result.imported.budgets = budgetResult.imported
      result.updated.budgets = budgetResult.updated
      result.skipped.budgets = budgetResult.skipped
      result.errors.push(...budgetResult.errors)
    }

    if (allIncludes.includes('snapshots') && files.snapshots) {
      const snapshotResult: ImportSnapshotsResult = await importSnapshotsFromCsv(files.snapshots, mode, tx)
      mergeSnapshotsResult(result, snapshotResult)
    }
  })

  return result
}

// ─── CSV 单文件导入（区分交易 vs 投资快照） ───

async function importCsvBackup(
  file: Buffer,
  mode: 'merge' | 'overwrite',
  result: ImportFullResult
): Promise<ImportFullResult> {
  const csvText = stripBom(file.toString('utf-8'))
  const firstLine = csvText.split(/\r?\n/)[0] || ''
  if (firstLine.includes('投资快照') || firstLine.includes('快照日期')) {
    const snapshotResult = await importSnapshotsFromCsv(file, mode)
    mergeSnapshotsResult(result, snapshotResult)
  } else {
    const transactionResult = await importTransactionsFromCsv(file, undefined, undefined)
    result.imported.transactions = transactionResult.imported
    result.skipped.transactions = transactionResult.skipped
  }
  return result
}

// ─── JSON 单文件导入（config / budgets） ───

async function importJsonBackup(
  file: Buffer,
  mode: 'merge' | 'overwrite',
  result: ImportFullResult
): Promise<ImportFullResult> {
  const data = JSON.parse(file.toString())
  if (data.type === 'config') {
    const configResult: ImportConfigResult = await importConfig(data, mode)
    mergeConfigResult(result, configResult)
  } else if (data.type === 'budgets') {
    const budgetResult: ImportBudgetResult = await importBudgets(data, mode)
    result.imported.budgets = budgetResult.imported
    result.updated.budgets = budgetResult.updated
    result.skipped.budgets = budgetResult.skipped
    result.errors.push(...budgetResult.errors)
  }
  return result
}

// ─── 结果合并辅助 ───

function mergeConfigResult(target: ImportFullResult, source: ImportConfigResult): void {
  target.imported.accountCategories = source.imported.accountCategories
  target.imported.accounts = source.imported.accounts
  target.imported.transactionCategories = source.imported.transactionCategories
  target.updated.accountCategories = source.updated.accountCategories
  target.updated.accounts = source.updated.accounts
  target.updated.transactionCategories = source.updated.transactionCategories
  target.skipped.accountCategories = source.skipped.accountCategories
  target.skipped.accounts = source.skipped.accounts
  target.skipped.transactionCategories = source.skipped.transactionCategories
  target.errors.push(...source.errors)
}

function mergeSnapshotsResult(target: ImportFullResult, source: ImportSnapshotsResult): void {
  target.imported.investmentSnapshots = source.imported.snapshots
  target.imported.investmentItems = source.imported.items
  target.updated.investmentSnapshots = source.updated.snapshots
  target.skipped.investmentSnapshots = source.skipped.snapshots
  target.errors.push(...source.errors)
}

// ─── 公开 API：switch 分发 ───

export async function importBackup(
  file: Buffer,
  filename: string,
  mode: 'merge' | 'overwrite'
): Promise<ImportFullResult> {
  const result = createEmptyImportFullResult()
  const fileType = detectFileType(filename)

  switch (fileType) {
    case 'zip':
      return importZipBackup(file, mode, result)
    case 'csv':
      return importCsvBackup(file, mode, result)
    case 'json':
      return importJsonBackup(file, mode, result)
    default:
      return result
  }
}
