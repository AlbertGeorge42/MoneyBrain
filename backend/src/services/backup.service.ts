// archiver 导出的是类，ZipArchive 是专门用于 ZIP 格式的类
import { ZipArchive } from 'archiver'
// @ts-ignore - unzipper没有类型定义
import unzipper from 'unzipper'
import { prisma } from '../index.js'

// ─── 类型定义 ───

export interface BackupFiles {
  manifest?: ManifestData
  transactions?: Buffer
  config?: string
  budgets?: string
  snapshots?: Buffer
}

export interface ManifestData {
  version: string
  exportedAt: string
  appVersion: string
  includes: string[]
  stats: {
    transactions?: number
    accounts?: number
    categories?: number
    budgets?: number
    investmentSnapshots?: number
  }
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

export async function createManifest(includes: string[]): Promise<ManifestData> {
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
    version: '1.0',
    exportedAt: new Date().toISOString(),
    appVersion: '1.0.0',
    includes,
    stats
  }
}

// ─── 文件类型检测 ───

export function detectFileType(filename: string): 'zip' | 'csv' | 'json' {
  if (filename.endsWith('.zip')) return 'zip'
  if (filename.endsWith('.csv')) return 'csv'
  if (filename.endsWith('.json')) return 'json'
  throw new Error('不支持的文件格式')
}

// ─── 文件内容识别 ───

export async function detectFileIncludes(file: Buffer, fileType: 'zip' | 'csv' | 'json'): Promise<string[]> {
  if (fileType === 'csv') {
    // 区分交易记录和投资快照
    const text = file.toString('utf-8').replace(/^\ufeff/, '')
    const firstLine = text.split(/\r?\n/)[0] || ''
    if (firstLine.includes('投资快照') || firstLine.includes('快照日期')) {
      return ['snapshots']
    }
    return ['transactions']
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