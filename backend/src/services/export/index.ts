// ─── 导出编排（完整/自定义备份） ───

import { createBackupZip, createManifest } from '../backup.service.js'
import { exportTransactionsCSV } from './transaction-export.service.js'
import { exportConfig } from './config-export.service.js'
import { exportBudgets } from './budget-export.service.js'
import { exportInvestmentSnapshotsCSV } from './snapshot-export.service.js'
import {
  type BackupFiles,
  type DataType,
  ALL_DATA_TYPES,
  generateExportFilename,
  generateBackupFilename,
} from '../backup.service.js'

export interface ExportResult {
  buffer: Buffer
  filename: string
  contentType: string
}

/**
 * 完整备份导出（始终为 ZIP）
 */
export async function exportFullBackup(): Promise<Buffer> {
  const files: BackupFiles = {}

  files.transactions = Buffer.from(await exportTransactionsCSV(), 'utf-8')
  files.config = await exportConfig()
  files.budgets = await exportBudgets()
  files.snapshots = Buffer.from(await exportInvestmentSnapshotsCSV(), 'utf-8')
  files.manifest = await createManifest(ALL_DATA_TYPES)

  return createBackupZip(files)
}

/**
 * 自定义导出
 * - 仅选择一种数据类型时，直接返回该格式的单个文件（不打包为 ZIP）
 * - 选择多种数据类型时，打包为 ZIP
 */
export async function exportCustomBackup(includes: DataType[]): Promise<ExportResult> {
  // 单文件导出场景
  if (includes.length === 1) {
    const type = includes[0]
    if (type === 'transactions') {
      const csvContent = await exportTransactionsCSV()
      return {
        buffer: Buffer.from(csvContent, 'utf-8'),
        filename: generateExportFilename('transactions', 'csv'),
        contentType: 'text/csv; charset=utf-8'
      }
    }
    if (type === 'config') {
      const jsonContent = await exportConfig()
      return {
        buffer: Buffer.from(jsonContent, 'utf-8'),
        filename: generateExportFilename('config', 'json'),
        contentType: 'application/json; charset=utf-8'
      }
    }
    if (type === 'budgets') {
      const jsonContent = await exportBudgets()
      return {
        buffer: Buffer.from(jsonContent, 'utf-8'),
        filename: generateExportFilename('budgets', 'json'),
        contentType: 'application/json; charset=utf-8'
      }
    }
    if (type === 'snapshots') {
      const csvContent = await exportInvestmentSnapshotsCSV()
      return {
        buffer: Buffer.from(csvContent, 'utf-8'),
        filename: generateExportFilename('snapshots', 'csv'),
        contentType: 'text/csv; charset=utf-8'
      }
    }
  }

  // 多文件导出场景：打包为 ZIP
  const files: BackupFiles = {}

  if (includes.includes('transactions')) {
    files.transactions = Buffer.from(await exportTransactionsCSV(), 'utf-8')
  }
  if (includes.includes('config')) {
    files.config = await exportConfig()
  }
  if (includes.includes('budgets')) {
    files.budgets = await exportBudgets()
  }
  if (includes.includes('snapshots')) {
    files.snapshots = Buffer.from(await exportInvestmentSnapshotsCSV(), 'utf-8')
  }

  files.manifest = await createManifest(includes)

  const zipBuffer = await createBackupZip(files)
  return {
    buffer: zipBuffer,
    filename: generateBackupFilename(),
    contentType: 'application/zip'
  }
}
