// ─── 导入回滚点：覆盖导入前的整库快照 ───
//
// 覆盖导入会先清空再写入，一旦文件选错或内容有误，数据就没了。
// 这里在覆盖前用 SQLite 的 VACUUM INTO 留一份**整库一致性副本**，
// 回滚时把它贴回来。
//
// 为什么用物理快照而不是「把各表导出成 JSON 存起来」：
//   - 物理快照与表结构解耦。新增表时快照代码一行都不用改
//     （表清单在回滚时从快照库自身枚举，不写死）。
//   - 物理快照是原子的、一次性完成的，不存在「导出到一半」。
//   - 恢复是整表复制，不做逐字段合并，不会有半新半旧的数据。
//
// 注意 VACUUM INTO **不能在事务内执行**（它会隐式提交），
// 所以快照必须在导入事务开始前落盘。

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { prisma } from '../prisma.js'
import { withTransaction } from '../db/transaction.js'
import { rootLogger, ValidationError } from '../common/index.js'
import type { BackupDataType } from '../../../../packages/contracts/constants.js'
import type { RollbackPoint } from '../../../../packages/contracts/types/index.js'

const logger = rootLogger.child({ module: 'rollback' })

// ===== 快照存放位置 =====

/**
 * 库所在目录：回滚点、自动备份配置等「跟着数据库走」的文件都用它定位。
 *
 * 库的真实路径由 SQLite 自己报告（PRAGMA database_list），
 * 不靠拼 DATABASE_URL——相对路径的基准随调用方而变，拼出来会错。
 */
export async function resolveDbDirectory(): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<{ file: string }[]>('PRAGMA database_list')
  const main = rows.find((r) => r.file)
  if (!main?.file) {
    throw new ValidationError('无法确定数据库文件位置，无法创建回滚点')
  }
  return dirname(main.file)
}

async function snapshotDirectory(): Promise<string> {
  return join(await resolveDbDirectory(), 'rollback-points')
}

// ===== 快照文件命名 =====

/** 快照数据文件前缀，回滚点 ID 与文件名一一对应 */
const SNAPSHOT_PREFIX = 'snapshot-'
const SNAPSHOT_SUFFIX = '.db'
/** 元数据 sidecar 后缀 */
const META_SUFFIX = '.json'

/**
 * 最多保留多少个回滚点。
 *
 * 快照是**整库副本**，体积随账本增长（当前 1.8MB/个）。
 * 不设上限的话，覆盖导入多少次就堆多少份，磁盘只增不减。
 *
 * 定 5 个的依据：回滚点的主要用途是「刚导入完发现文件选错了」，
 * 超过最近几次的旧快照几乎不会被用到；5 份约 9MB，可以接受。
 */
const MAX_ROLLBACK_POINTS = 5

function snapshotPath(directory: string, id: string): string {
  return join(directory, `${SNAPSHOT_PREFIX}${id}${SNAPSHOT_SUFFIX}`)
}

function metaPath(directory: string, id: string): string {
  return join(directory, `${SNAPSHOT_PREFIX}${id}${META_SUFFIX}`)
}

/**
 * 回滚点的元数据。
 *
 * 存在 sidecar 文件里而不是数据库表：快照本身就是「库的样子」，
 * 再往库里加一张表来记录快照，会让「回滚到某时刻」这件事
 * 陷入「连元数据一起回滚」的歧义。
 */
interface SnapshotMeta {
  id: string
  createdAt: string
  reason: string
  includes: BackupDataType[]
  stats: Record<string, number>
}

// ===== 排除的系统表 =====

/**
 * 迁移历史表不属于用户数据，回滚时不该动它——
 * 库的表结构版本必须与当前程序匹配，否则 Prisma 会读写错列。
 */
const EXCLUDED_TABLES = new Set(['_prisma_migrations', 'sqlite_sequence'])

function isRestorableTable(name: string): boolean {
  return !name.startsWith('sqlite_') && !EXCLUDED_TABLES.has(name)
}

/** 列出当前库的业务表（排除系统表与迁移历史） */
async function listBusinessTables(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`
  )
  return rows.map((r) => r.name).filter(isRestorableTable)
}

/** 统计当前库各表的行数 */
async function collectTableStats(tables?: string[]): Promise<Record<string, number>> {
  const names = tables ?? (await listBusinessTables())
  const stats: Record<string, number> = {}
  for (const name of names) {
    const rows = await prisma.$queryRawUnsafe<{ c: number }[]>(
      `SELECT COUNT(*) AS c FROM "${name}"`
    )
    stats[name] = Number(rows[0]?.c ?? 0)
  }
  return stats
}

// ===== 创建快照 =====

/**
 * 生成整库快照文件。
 *
 * 必须在事务外调用：VACUUM INTO 会隐式提交，事务内执行会失败。
 *
 * @param reason 触发原因，如「覆盖导入前」
 * @param includes 本次覆盖涉及的数据类型
 */
export async function createSnapshot(
  reason: string,
  includes: BackupDataType[]
): Promise<SnapshotMeta> {
  const directory = await snapshotDirectory()
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true })
  }

  // ID 必须唯一：时间戳只到毫秒，同一毫秒内建两个快照会撞 ID 互相覆盖。
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
  const target = snapshotPath(directory, id)

  // VACUUM INTO 要求目标文件不存在
  if (existsSync(target)) {
    rmSync(target)
  }

  await prisma.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`)

  const meta: SnapshotMeta = {
    id,
    createdAt: new Date().toISOString(),
    reason,
    includes,
    stats: await collectTableStats(),
  }
  writeFileSync(metaPath(directory, id), JSON.stringify(meta, null, 2), 'utf-8')

  logger.info(
    { action: 'snapshot-created', id, reason, includes },
    'rollback point snapshot created'
  )

  await pruneOldSnapshots()

  return meta
}

// ===== 清理超限快照 =====

/**
 * 删除超出保留上限的最旧快照。
 *
 * 每次新建快照后调用：保留最新的 MAX_ROLLBACK_POINTS 个，
 * 更旧的连同元数据一起删掉。
 */
async function pruneOldSnapshots(): Promise<void> {
  const directory = await snapshotDirectory()
  const points = await listSnapshotMetas(directory)
  if (points.length <= MAX_ROLLBACK_POINTS) {
    return
  }

  // listSnapshotMetas 按时间倒序，尾部是最旧的
  const outdated = points.slice(MAX_ROLLBACK_POINTS)
  for (const point of outdated) {
    const dataPath = snapshotPath(directory, point.id)
    if (existsSync(dataPath)) {
      rmSync(dataPath)
    }
    const metaFile = metaPath(directory, point.id)
    if (existsSync(metaFile)) {
      rmSync(metaFile)
    }
    logger.info({ action: 'snapshot-pruned', id: point.id }, '旧的回滚点已清理')
  }
}

// ===== 列出回滚点 =====

/**
 * 列出磁盘上所有回滚点，按创建时间倒序（新的在前）。
 */
export async function listSnapshotPoints(): Promise<RollbackPoint[]> {
  const directory = await snapshotDirectory()
  const metas = await listSnapshotMetas(directory)

  return metas.map((meta) => ({
    ...meta,
    sizeBytes: statSync(snapshotPath(directory, meta.id)).size,
  }))
}

/**
 * 读出磁盘上所有回滚点的元数据，按创建时间倒序（新的在前）。
 * 损坏的元数据跳过，不影响其余回滚点。
 */
async function listSnapshotMetas(directory: string): Promise<SnapshotMeta[]> {
  if (!existsSync(directory)) {
    return []
  }

  const metas: SnapshotMeta[] = []
  for (const file of readdirSync(directory)) {
    if (!file.startsWith(SNAPSHOT_PREFIX) || !file.endsWith(META_SUFFIX)) {
      continue
    }
    const id = file.slice(SNAPSHOT_PREFIX.length, -META_SUFFIX.length)
    if (!existsSync(snapshotPath(directory, id))) {
      continue
    }
    try {
      const meta = JSON.parse(readFileSync(join(directory, file), 'utf-8')) as SnapshotMeta
      metas.push(meta)
    } catch {
      logger.warn({ action: 'snapshot-meta-unreadable', id }, '回滚点元数据损坏，跳过')
    }
  }

  return metas.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// ===== 回滚 =====

/**
 * 用快照覆盖当前库的数据。
 *
 * 表清单在运行时从**快照库自身**枚举（sqlite_master），
 * 不写死表名——新增表时回滚代码无需改动。
 *
 * @param id 回滚点 ID
 */
export async function restoreSnapshot(id: string): Promise<{
  restoredTables: string[]
  stats: Record<string, number>
}> {
  const directory = await snapshotDirectory()
  const source = snapshotPath(directory, id)
  if (!existsSync(source)) {
    throw new ValidationError('回滚点不存在或已被清理')
  }

  // 附着快照库，读它的表清单
  await prisma.$executeRawUnsafe(`ATTACH DATABASE '${source.replace(/'/g, "''")}' AS snap`)

  try {
    const tableRows = await prisma.$queryRawUnsafe<{ name: string }[]>(
      `SELECT name FROM snap.sqlite_master WHERE type = 'table' ORDER BY name`
    )
    const tables = tableRows.map((r) => r.name).filter(isRestorableTable)

    if (tables.length === 0) {
      throw new ValidationError('快照内容为空，无法回滚')
    }

    // 外键在恢复过程中必须关闭：逐表复制时父子表的先后顺序无法预知
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF')

    try {
      await withTransaction(async (tx) => {
        for (const table of tables) {
          await tx.$executeRawUnsafe(`DELETE FROM main."${table}"`)
          await tx.$executeRawUnsafe(
            `INSERT INTO main."${table}" SELECT * FROM snap."${table}"`
          )
        }
      })
    } finally {
      await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON')
    }

    const stats = await collectTableStats(tables)

    logger.info(
      { action: 'snapshot-restored', id, tables },
      'rollback point restored'
    )

    return { restoredTables: tables, stats }
  } finally {
    await prisma.$executeRawUnsafe('DETACH DATABASE snap')
  }
}

/**
 * 删除回滚点（数据文件与元数据一起删）。
 */
export async function deleteSnapshot(id: string): Promise<void> {
  const directory = await snapshotDirectory()
  const dataPath = snapshotPath(directory, id)
  if (!existsSync(dataPath)) {
    throw new ValidationError('回滚点不存在')
  }
  rmSync(dataPath)
  const metaFile = metaPath(directory, id)
  if (existsSync(metaFile)) {
    rmSync(metaFile)
  }
  logger.info({ action: 'snapshot-deleted', id }, 'rollback point deleted')
}
