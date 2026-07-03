// archiver 导出的是类，ZipArchive 是专门用于 ZIP 格式的类
import { ZipArchive } from 'archiver'
// @ts-expect-error - unzipper没有类型定义
import unzipper from 'unzipper'
import { prisma } from '../index.js'
import { stripBom } from './import/shared.js'

// ─── 备份文件格式常量与类型 ───

export type DataType = 'transactions' | 'config' | 'budgets' | 'snapshots'

export const DATA_TYPE_LABELS: Record<DataType, string> = {
  transactions: '交易记录',
  config: '配置',
  budgets: '预算',
  snapshots: '投资快照',
}

export const ALL_DATA_TYPES: DataType[] = ['transactions', 'config', 'budgets', 'snapshots']

export interface BackupFiles {
  manifest?: ManifestData
  transactions?: Buffer
  config?: string
  budgets?: string
  snapshots?: Buffer
}

export interface ManifestData {
  exportedAt: string
  includes: DataType[]
  stats: {
    transactions?: number
    accounts?: number
    categories?: number
    budgets?: number
    investmentSnapshots?: number
  }
}

/**
 * 生成单个导出文件名
 */
export function generateExportFilename(type: DataType, ext: string): string {
  const date = new Date().toISOString().split('T')[0]
  return `moneybrain-${type}-${date}.${ext}`
}

/**
 * 生成完整备份 ZIP 文件名
 */
export function generateBackupFilename(): string {
  const date = new Date().toISOString().split('T')[0]
  return `moneybrain-backup-${date}.zip`
}

// ─── ZIP打包服务 ───

export async function createBackupZip(files: BackupFiles): Promise<Buffer> {
  // 使用 ZipArchive 类创建 ZIP 实例
  const archive = new ZipArchive({ zlib: { level: 9 } })
  const chunks: Buffer[] = []

  archive.on('data', (chunk: Buffer) => chunks.push(chunk))

  // 添加manifest
  if (files.manifest) {
    archive.append(JSON.stringify(files.manifest, null, 2), { name: 'manifest.json' })
  }

  // 添加各数据文件
  if (files.transactions) {
    archive.append(files.transactions, { name: 'transactions.csv' })
  }
  if (files.config) {
    archive.append(files.config, { name: 'config.json' })
  }
  if (files.budgets) {
    archive.append(files.budgets, { name: 'budgets.json' })
  }
  if (files.snapshots) {
    archive.append(files.snapshots, { name: 'snapshots.csv' })
  }

  await archive.finalize()
  return Buffer.concat(chunks)
}

// ─── ZIP解包服务 ───

export async function parseBackupZip(zipBuffer: Buffer): Promise<BackupFiles> {
  const directory = await unzipper.Open.buffer(zipBuffer)
  const files: BackupFiles = {}

  for (const file of directory.files) {
    const content = await file.buffer()
    if (file.path === 'manifest.json') {
      files.manifest = JSON.parse(content.toString())
    } else if (file.path === 'transactions.csv') {
      files.transactions = content
    } else if (file.path === 'config.json') {
      files.config = content.toString()
    } else if (file.path === 'budgets.json') {
      files.budgets = content.toString()
    } else if (file.path === 'snapshots.csv') {
      files.snapshots = content
    }
  }

  return files
}

// ─── Manifest生成 ───

export async function createManifest(includes: DataType[]): Promise<ManifestData> {
  const stats: ManifestData['stats'] = {}

  if (includes.includes('transactions')) {
    stats.transactions = await prisma.transaction.count()
  }
  if (includes.includes('config')) {
    stats.accounts = await prisma.account.count()
    stats.categories = await prisma.accountCategory.count() + await prisma.transactionCategory.count()
  }
  if (includes.includes('budgets')) {
    stats.budgets = await prisma.budget.count()
  }
  if (includes.includes('snapshots')) {
    stats.investmentSnapshots = await prisma.investmentAllocationSnapshot.count()
  }

  return {
    exportedAt: new Date().toISOString(),
    includes,
    stats
  }
}

// ─── 文件类型检测 ───

export function detectFileType(filename: string): 'zip' | 'csv' | 'json' {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.zip')) return 'zip'
  if (lower.endsWith('.csv')) return 'csv'
  if (lower.endsWith('.json')) return 'json'
  throw new Error('不支持的文件格式')
}

// ─── 文件内容识别 ───

const SNAPSHOT_CSV_FIELDS = new Set(['账户名称', '快照日期', '账户余额'])
const TRANSACTION_CSV_FIELDS = new Set(['ID', '时间', '分类', '类型', '金额'])

export async function detectFileIncludes(file: Buffer, fileType: 'zip' | 'csv' | 'json'): Promise<DataType[]> {
  if (fileType === 'csv') {
    // 区分交易记录和投资快照
    const text = stripBom(file.toString('utf-8'))
    const firstLine = text.split(/\r?\n/)[0] || ''
    const headerSet = new Set(firstLine.split(',').map(h => h.trim()))
    if (ALL_DATA_TYPES.includes('snapshots') && Array.from(SNAPSHOT_CSV_FIELDS).every(f => headerSet.has(f))) {
      return ['snapshots']
    }
    if (Array.from(TRANSACTION_CSV_FIELDS).every(f => headerSet.has(f))) {
      return ['transactions']
    }
    return []
  }

  if (fileType === 'json') {
    const data = JSON.parse(file.toString())
    if (data.type === 'config') return ['config']
    if (data.type === 'budgets') return ['budgets']
    return []
  }

  if (fileType === 'zip') {
    const files = await parseBackupZip(file)
    return files.manifest?.includes || []
  }

  return []
}
