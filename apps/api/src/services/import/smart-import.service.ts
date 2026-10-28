// ─── 智能导入（ZIP / CSV / JSON） ───
//
// 导入的唯一编排入口。预览与正式导入走**同一个 runImport**：
// 预览只是把事务回滚掉，让调用方先看到数字。
//
// 为什么不写一份「预览专用」的统计逻辑：那份逻辑迟早与真实导入漂移，
// 用户看到的预览数字和实际结果对不上——这比没有预览更糟。
//
// 事务边界与清空范围都归这一层管：子服务只负责「把数据写进去」，
// 各自清空、各自开事务的老写法会让预览无法整体回滚。

import { prisma } from '../../prisma.js'
import {
  parseBackupZip,
  detectFileType,
  detectFileIncludes,
  assertBackupVersion,
  type DataType,
} from '../backup.service.js'
import { clearSelectedDataForImport } from '../clear-data.service.js'
import { createSnapshot } from '../rollback.service.js'
import { ValidationError } from '../../common/index.js'
import { importConfig } from './config-import.service.js'
import { importBudgets } from './budget-import.service.js'
import { importSnapshotsFromCsv } from './snapshot-import.service.js'
import { importTransactionsFromCsv } from './transaction-import.service.js'
import {
  type ImportFullResult,
  type ImportSnapshotsResult,
  type ImportConfigResult,
  type ImportBudgetResult,
  type TransactionClient,
  createEmptyImportFullResult,
  stripBom,
  logger,
} from './shared.js'

/** 导入模式：合并（保留现有数据）或覆盖（先清空所选范围） */
export type ImportMode = 'merge' | 'overwrite'

// ─── ZIP 备份导入 ───

async function importZipBackup(
  file: Buffer,
  mode: ImportMode,
  result: ImportFullResult,
  includes: DataType[] | undefined,
  tx: TransactionClient
): Promise<ImportFullResult> {
  const files = await parseBackupZip(file)
  await assertBackupVersion(files.manifest)
  const manifestIncludes = files.manifest?.includes ?? []
  const detected = await detectFileIncludes(file, 'zip')
  const availableIncludes = manifestIncludes.length > 0 ? manifestIncludes : detected
  const selectedIncludes = includes
    ? availableIncludes.filter((item) => includes.includes(item))
    : availableIncludes

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
    const transactionResult = await importTransactionsFromCsv(files.transactions, tx)
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

  return result
}

// ─── CSV 单文件导入（区分交易 vs 投资快照） ───

async function importCsvBackup(
  file: Buffer,
  mode: ImportMode,
  result: ImportFullResult,
  includes: DataType[] | undefined,
  tx: TransactionClient
): Promise<ImportFullResult> {
  const csvText = stripBom(file.toString('utf-8'))
  const firstLine = csvText.split(/\r?\n/)[0] || ''
  const isSnapshot = firstLine.includes('投资快照') || firstLine.includes('快照日期')
  const kind: DataType = isSnapshot ? 'snapshots' : 'transactions'

  if (includes && !includes.includes(kind)) {
    return result
  }

  if (mode === 'overwrite') {
    // CSV 文件里只有这一类数据，清空范围也只限它——
    // 导交易 CSV 不该把预算和投资快照一起删掉。
    await clearSelectedDataForImport(tx, [kind])
  }

  if (isSnapshot) {
    const snapshotResult = await importSnapshotsFromCsv(file, mode, tx)
    mergeSnapshotsResult(result, snapshotResult)
  } else {
    const transactionResult = await importTransactionsFromCsv(file, tx)
    result.imported.transactions = transactionResult.imported
    result.skipped.transactions = transactionResult.skipped
  }
  return result
}

// ─── JSON 单文件导入（config / budgets） ───

async function importJsonBackup(
  file: Buffer,
  mode: ImportMode,
  result: ImportFullResult,
  includes: DataType[] | undefined,
  tx: TransactionClient
): Promise<ImportFullResult> {
  const data = JSON.parse(file.toString())
  if (data.type === 'config') {
    if (includes && !includes.includes('config')) return result
    if (mode === 'overwrite') {
      await clearSelectedDataForImport(tx, ['config'])
    }
    const configResult: ImportConfigResult = await importConfig(data, mode, tx)
    mergeConfigResult(result, configResult)
  } else if (data.type === 'budgets') {
    if (includes && !includes.includes('budgets')) return result
    if (mode === 'overwrite') {
      await clearSelectedDataForImport(tx, ['budgets'])
    }
    const budgetResult: ImportBudgetResult = await importBudgets(data, mode, tx)
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

// ─── 公开 API ───

/**
 * 在给定事务内执行导入。
 *
 * 预览与正式导入共用这一个函数——差异只有事务最后是提交还是回滚。
 */
export async function runImport(
  tx: TransactionClient,
  file: Buffer,
  filename: string,
  mode: ImportMode,
  includes?: DataType[]
): Promise<ImportFullResult> {
  const result = createEmptyImportFullResult()
  const fileType = detectFileType(filename)

  switch (fileType) {
    case 'zip':
      return importZipBackup(file, mode, result, includes, tx)
    case 'csv':
      return importCsvBackup(file, mode, result, includes, tx)
    case 'json':
      return importJsonBackup(file, mode, result, includes, tx)
    default:
      return result
  }
}

/**
 * 正式导入：跑完并提交。
 */
export async function importBackup(
  file: Buffer,
  filename: string,
  mode: ImportMode,
  includes?: DataType[]
): Promise<ImportFullResult> {
  const start = Date.now()
  logger.info({ action: 'start', mode, includes }, 'import started')
  const result = await prisma.$transaction((tx) => runImport(tx, file, filename, mode, includes))
  logger.info({ action: 'finish', mode, durationMs: Date.now() - start }, 'import completed')
  return result
}

/**
 * 覆盖导入：先留回滚点，再执行导入。
 *
 * 顺序很重要——快照必须赶在清空之前落盘，
 * 否则回滚点里存的就是已经被清空的数据。
 */
export async function importBackupWithRollback(
  file: Buffer,
  filename: string,
  includes?: DataType[]
): Promise<{ result: ImportFullResult; rollbackPointId: string }> {
  const scope = await resolveOverwriteScope(file, filename, includes)
  const snapshot = await createSnapshot('覆盖导入前', scope)
  const result = await importBackup(file, filename, 'overwrite', includes)
  return { result, rollbackPointId: snapshot.id }
}

/**
 * 导入预览：跑完再回滚，让用户先看到数字。
 *
 * 走的是**同一个 runImport**，所以预览数字与正式导入必然一致。
 */
export async function previewImport(
  file: Buffer,
  filename: string,
  mode: ImportMode,
  includes?: DataType[]
): Promise<ImportFullResult> {
  let captured: ImportFullResult | undefined
  try {
    await prisma.$transaction(async (tx) => {
      captured = await runImport(tx, file, filename, mode, includes)
      // 抛错触发回滚：预览不该留下任何数据改动
      throw new PreviewRollback()
    })
  } catch (error) {
    if (!(error instanceof PreviewRollback)) {
      throw error
    }
  }
  return captured!
}

/** 触发预览回滚的哨兵错误 */
class PreviewRollback extends Error {
  constructor() {
    super('preview rollback')
    this.name = 'PreviewRollback'
  }
}

/**
 * 覆盖导入前清空范围的数据类型。
 *
 * 与 runImport 内部实际清空的范围必须一致——
 * 预览告诉用户「会清空这些」，实际就得只清这些。
 */
export async function resolveOverwriteScope(
  file: Buffer,
  filename: string,
  includes?: DataType[]
): Promise<DataType[]> {
  const fileType = detectFileType(filename)

  if (fileType === 'zip') {
    const files = await parseBackupZip(file)
    const manifestIncludes = files.manifest?.includes ?? []
    const detected = await detectFileIncludes(file, 'zip')
    const availableIncludes = manifestIncludes.length > 0 ? manifestIncludes : detected
    return includes
      ? availableIncludes.filter((item) => includes.includes(item))
      : availableIncludes
  }

  if (fileType === 'csv') {
    const csvText = stripBom(file.toString('utf-8'))
    const firstLine = csvText.split(/\r?\n/)[0] || ''
    const kind: DataType = firstLine.includes('投资快照') || firstLine.includes('快照日期')
      ? 'snapshots'
      : 'transactions'
    return includes && !includes.includes(kind) ? [] : [kind]
  }

  if (fileType === 'json') {
    const data = JSON.parse(file.toString())
    const kind: DataType = data.type === 'budgets' ? 'budgets' : 'config'
    return includes && !includes.includes(kind) ? [] : [kind]
  }

  throw new ValidationError('不支持的文件格式')
}
