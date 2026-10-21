// ─── 智能导入（ZIP / CSV / JSON） ───

import { prisma } from '../../prisma.js'
import {
  parseBackupZip,
  detectFileType,
  detectFileIncludes,
  assertBackupVersion,
  type DataType,
} from '../backup.service.js'
import { clearSelectedDataForImport } from '../clear-data.service.js'
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
  logger,
} from './shared.js'

// ─── ZIP 备份导入 ───

async function importZipBackup(
  file: Buffer,
  mode: 'merge' | 'overwrite',
  result: ImportFullResult,
  includes?: DataType[]
): Promise<ImportFullResult> {
  const files = await parseBackupZip(file)
  await assertBackupVersion(files.manifest)
  const manifestIncludes = files.manifest?.includes ?? []
  const detected = await detectFileIncludes(file, 'zip')
  const availableIncludes = manifestIncludes.length > 0 ? manifestIncludes : detected
  const selectedIncludes = includes
    ? availableIncludes.filter((item) => includes.includes(item))
    : availableIncludes

  // Wrap everything in a single transaction for atomicity
  await prisma.$transaction(async (tx) => {
    // 覆盖模式下只清空本次选择的范围，避免部分导入误删其他数据。
    if (mode === 'overwrite' && selectedIncludes.length > 0) {
      await clearSelectedDataForImport(tx, selectedIncludes)
    }

    // 按依赖顺序导入：先 config，再 transactions，最后 budgets/snapshots
    if (selectedIncludes.includes('config') && files.config) {
      const configResult: ImportConfigResult = await importConfig(JSON.parse(files.config), mode, tx)
      mergeConfigResult(result, configResult)
    }

    if (selectedIncludes.includes('transactions') && files.transactions) {
      const transactionResult = await importTransactionsFromCsv(
        files.transactions,
        undefined,
        undefined,
        mode,
        tx,
      )
      result.imported.transactions = transactionResult.imported
      result.skipped.transactions = transactionResult.skipped
    }

    if (selectedIncludes.includes('budgets') && files.budgets) {
      const budgetResult: ImportBudgetResult = await importBudgets(JSON.parse(files.budgets), mode, tx)
      result.imported.budgets = budgetResult.imported
      result.updated.budgets = budgetResult.updated
      result.skipped.budgets = budgetResult.skipped
      result.errors.push(...budgetResult.errors)
    }

    if (selectedIncludes.includes('snapshots') && files.snapshots) {
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
  result: ImportFullResult,
  includes?: DataType[]
): Promise<ImportFullResult> {
  const csvText = stripBom(file.toString('utf-8'))
  const firstLine = csvText.split(/\r?\n/)[0] || ''
  const isSnapshot = firstLine.includes('投资快照') || firstLine.includes('快照日期')
  const kind: DataType = isSnapshot ? 'snapshots' : 'transactions'

  if (includes && !includes.includes(kind)) {
    return result
  }

  if (isSnapshot) {
    const snapshotResult = await importSnapshotsFromCsv(file, mode)
    mergeSnapshotsResult(result, snapshotResult)
  } else {
    const transactionResult = await importTransactionsFromCsv(file, undefined, undefined, mode)
    result.imported.transactions = transactionResult.imported
    result.skipped.transactions = transactionResult.skipped
  }
  return result
}

// ─── JSON 单文件导入（config / budgets） ───

async function importJsonBackup(
  file: Buffer,
  mode: 'merge' | 'overwrite',
  result: ImportFullResult,
  includes?: DataType[]
): Promise<ImportFullResult> {
  const data = JSON.parse(file.toString())
  if (data.type === 'config') {
    if (includes && !includes.includes('config')) return result
    const configResult: ImportConfigResult = await importConfig(data, mode)
    mergeConfigResult(result, configResult)
  } else if (data.type === 'budgets') {
    if (includes && !includes.includes('budgets')) return result
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
  mode: 'merge' | 'overwrite',
  includes?: DataType[]
): Promise<ImportFullResult> {
  const start = Date.now()
  logger.info({ action: 'start', mode, includes }, 'import started')
  const result = createEmptyImportFullResult()
  const fileType = detectFileType(filename)

  switch (fileType) {
    case 'zip': {
      const r = await importZipBackup(file, mode, result, includes)
      logger.info({ action: 'finish', mode, durationMs: Date.now() - start }, 'import completed')
      return r
    }
    case 'csv': {
      const r = await importCsvBackup(file, mode, result, includes)
      logger.info({ action: 'finish', mode, durationMs: Date.now() - start }, 'import completed')
      return r
    }
    case 'json': {
      const r = await importJsonBackup(file, mode, result, includes)
      logger.info({ action: 'finish', mode, durationMs: Date.now() - start }, 'import completed')
      return r
    }
    default:
      return result
  }
}
