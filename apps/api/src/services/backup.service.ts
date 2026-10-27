// archiver 导出的是类，ZipArchive 是专门用于 ZIP 格式的类
import { ZipArchive } from 'archiver'
// @ts-expect-error - unzipper没有类型定义
import unzipper from 'unzipper'
import Papa from 'papaparse'
import { prisma } from '../prisma.js'
import { ValidationError, rootLogger } from '../common/index.js'
import { BACKUP_DATA_TYPES, type BackupDataType } from '../../../../packages/contracts/constants.js'

// ─── 备份文件格式常量与类型 ───

export type DataType = BackupDataType

export const ALL_DATA_TYPES: DataType[] = [...BACKUP_DATA_TYPES]

export interface BackupFiles {
  manifest?: ManifestData
  transactions?: Buffer
  config?: string
  budgets?: string
  snapshots?: Buffer
}

export interface ManifestData {
  exportedAt: string
  /** 导出时的 schema 版本（最新已应用的迁移名）；未知时为 'unknown' */
  schemaVersion: string
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
    schemaVersion: await getSchemaVersion(),
    includes,
    stats
  }
}

/**
 * 当前 schema 版本：取最新一条已应用的迁移名。
 * 迁移名是时间戳前缀，字典序即时间序，可直接比较新旧。
 * 尚未使用版本化迁移的库（没有 _prisma_migrations 表）返回 'unknown'。
 */
export async function getSchemaVersion(): Promise<string> {
  try {
    const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY finished_at DESC LIMIT 1
    `
    return rows[0]?.migration_name ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * 校验备份版本：
 * - 备份比当前应用新：无法可靠解读，直接拒绝
 * - 备份比当前应用旧：允许导入（不认识的字段会被忽略），但记一条警告
 * - 版本未知（老备份没有版本号）：按现状导入
 */
export async function assertBackupVersion(manifest: ManifestData | undefined): Promise<void> {
  const backupVersion = manifest?.schemaVersion
  if (!backupVersion || backupVersion === 'unknown') return

  const currentVersion = await getSchemaVersion()
  if (currentVersion === 'unknown') return

  if (backupVersion > currentVersion) {
    throw new ValidationError('备份来自更新版本的应用，请先升级应用再导入')
  }
  if (backupVersion < currentVersion) {
    rootLogger
      .child({ module: 'backup' })
      .warn(
        { action: 'import-older-backup', backupVersion, currentVersion },
        '备份版本较旧，按兼容模式导入',
      )
  }
}

// ─── 文件类型检测 ───

export function detectFileType(filename: string): 'zip' | 'csv' | 'json' {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.zip')) return 'zip'
  if (lower.endsWith('.csv')) return 'csv'
  if (lower.endsWith('.json')) return 'json'
  throw new ValidationError('不支持的文件格式')
}

// ─── 文件内容识别 ───

const SNAPSHOT_CSV_FIELDS = new Set(['账户名称', '快照日期', '账户余额'])
const TRANSACTION_CSV_FIELDS = new Set(['ID', '时间', '分类', '类型', '金额'])

export async function detectFileIncludes(file: Buffer, fileType: 'zip' | 'csv' | 'json'): Promise<DataType[]> {
  if (fileType === 'csv') {
    // 区分交易记录和投资快照（使用 papaparse 解析 header，自动处理 BOM）
    const result = Papa.parse(file.toString('utf-8'), {
      header: true,
      skipEmptyLines: true,
    })
    const headerSet = new Set(result.meta.fields ?? [])
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
