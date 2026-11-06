// ─── 导入批次：记录一次导入实际新建了哪些行，并按批次精确撤销 ───
//
// 为什么记录 id 而不是用整库快照回滚：
// 快照恢复会把导入前就存在的数据一起覆盖回去，
// 用户后来新记的流水会丢。按 id 删除只动这一批新建的行。
//
// 新建行通过「导入前/后各查一次 id 集合」求差得到：
// 导入在同一事务里执行，期间不会有并发写入，差集就是本次新建的行。

import type { ImportBatch, ImportCounts, ImportBatchRollbackResult } from '../../../../packages/contracts/types/index.js'
import type { DataType } from './backup.service.js'
import { withTransaction } from '../db/transaction.js'
import { NotFoundError, ValidationError } from '../common/index.js'
import { prisma, type TransactionClient } from '../prisma.js'

const TRACKED_TABLES = [
  'transaction',
  'budget',
  'investmentAllocationItem',
  'investmentAllocationSnapshot',
  'investmentAssetClass',
  'account',
  'transactionCategory',
  'accountCategory',
] as const

type TrackedTable = (typeof TRACKED_TABLES)[number]

type CreatedIds = Record<TrackedTable, string[]>

type IdSnapshot = Record<TrackedTable, Set<string>>

/** 事务内读取各表现有 id。行数很大时也只传 id，开销可接受。 */
export async function collectExistingIds(tx: TransactionClient): Promise<IdSnapshot> {
  const snapshot = {} as IdSnapshot
  await Promise.all(
    TRACKED_TABLES.map(async (table) => {
      snapshot[table] = new Set(await readIds(tx, table))
    })
  )
  return snapshot
}

/** 导入后求差：本次新建的行 id。 */
export async function diffCreatedIds(
  before: IdSnapshot,
  tx: TransactionClient
  ): Promise<CreatedIds> {
  const created = {} as CreatedIds
  await Promise.all(
    TRACKED_TABLES.map(async (table) => {
      const ids = await readIds(tx, table)
      created[table] = ids.filter((id) => !before[table].has(id))
    })
  )
  return created
}

async function readIds(tx: TransactionClient, table: TrackedTable): Promise<string[]> {
  switch (table) {
    case 'transaction':
      return (await tx.transaction.findMany({ select: { id: true } })).map((row) => row.id)
    case 'budget':
      return (await tx.budget.findMany({ select: { id: true } })).map((row) => row.id)
    case 'investmentAllocationItem':
      return (await tx.investmentAllocationItem.findMany({ select: { id: true } })).map((row) => row.id)
    case 'investmentAllocationSnapshot':
      return (await tx.investmentAllocationSnapshot.findMany({ select: { id: true } })).map((row) => row.id)
    case 'investmentAssetClass':
      return (await tx.investmentAssetClass.findMany({ select: { id: true } })).map((row) => row.id)
    case 'account':
      return (await tx.account.findMany({ select: { id: true } })).map((row) => row.id)
    case 'transactionCategory':
      return (await tx.transactionCategory.findMany({ select: { id: true } })).map((row) => row.id)
    case 'accountCategory':
      return (await tx.accountCategory.findMany({ select: { id: true } })).map((row) => row.id)
  }
}

export interface CreateImportBatchInput {
  filename: string
  mode: 'merge' | 'overwrite'
  includes: DataType[]
  imported: ImportCounts
  created: CreatedIds
}

/** 与导入写库在同一事务内落批次记录：导入失败时批次记录一并回滚。 */
export async function createImportBatch(
  tx: TransactionClient,
  input: CreateImportBatchInput
) {
  return tx.importBatch.create({
    data: {
      filename: input.filename,
      mode: input.mode,
      includesJson: JSON.stringify(input.includes),
      importedJson: JSON.stringify(input.imported),
      createdJson: JSON.stringify(input.created),
      transactionCount: input.created.transaction.length,
    },
  })
}

/** 设置页展示用的批次列表（新的在前）。 */
export async function listImportBatches(limit = 10): Promise<ImportBatch[]> {
  const rows = await prisma.importBatch.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return rows.map(toPublicBatch)
}

function toPublicBatch(row: {
  id: string
  createdAt: Date
  filename: string
  mode: string
  includesJson: string
  importedJson: string
  transactionCount: number
  status: string
  rolledBackAt: Date | null
  rolledBackJson: string | null
}): ImportBatch {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    filename: row.filename,
    mode: row.mode === 'overwrite' ? 'overwrite' : 'merge',
    includes: parseJson<DataType[]>(row.includesJson, []),
    imported: parseJson<ImportCounts>(row.importedJson, {
      accountCategories: 0,
      accounts: 0,
      transactionCategories: 0,
      transactions: 0,
      budgets: 0,
      investmentSnapshots: 0,
      investmentItems: 0,
    }),
    transactionCount: row.transactionCount,
    status: row.status === 'rolledBack' ? 'rolledBack' : 'active',
    rolledBackAt: row.rolledBackAt ? row.rolledBackAt.toISOString() : null,
    rolledBack: row.rolledBackJson
      ? parseJson<Record<string, number>>(row.rolledBackJson, {})
      : null,
  }
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/**
 * 按批次精确撤销：只删该批新建的行，导入前已有的数据一行不动。
 * 删除顺序与依赖相反：流水/预算 → 快照明细 → 账户/分类。
 */
export async function rollbackImportBatch(importId: string): Promise<ImportBatchRollbackResult> {
  const result = await withTransaction(async (tx) => {
    const batch = await tx.importBatch.findUnique({ where: { id: importId } })
    if (!batch) {
      throw new NotFoundError('导入批次不存在')
    }
    if (batch.status === 'rolledBack') {
      throw new ValidationError('这批导入已经回滚过了')
    }

    const created = parseJson<CreatedIds>(batch.createdJson, {
      transaction: [],
      budget: [],
      investmentAllocationItem: [],
      investmentAllocationSnapshot: [],
      investmentAssetClass: [],
      account: [],
      transactionCategory: [],
      accountCategory: [],
    })

    const removed: Record<string, number> = {}

    removed.transaction = (
      await tx.transaction.deleteMany({ where: { id: { in: created.transaction } } })
    ).count
    removed.budget = (
      await tx.budget.deleteMany({ where: { id: { in: created.budget } } })
    ).count
    removed.investmentAllocationItem = (
      await tx.investmentAllocationItem.deleteMany({
        where: { id: { in: created.investmentAllocationItem } },
      })
    ).count
    removed.investmentAllocationSnapshot = (
      await tx.investmentAllocationSnapshot.deleteMany({
        where: { id: { in: created.investmentAllocationSnapshot } },
      })
    ).count
    removed.investmentAssetClass = (
      await tx.investmentAssetClass.deleteMany({
        where: { id: { in: created.investmentAssetClass } },
      })
    ).count
    removed.account = (
      await tx.account.deleteMany({ where: { id: { in: created.account } } })
    ).count

    // 分类有自关联：先删子再删父；被其他数据引用的分类无法删除时整个回滚失败
    removed.transactionCategory = await deleteCategoryRows(tx, 'transactionCategory', created.transactionCategory)
    removed.accountCategory = await deleteCategoryRows(tx, 'accountCategory', created.accountCategory)

    const total = Object.values(removed).reduce((sum, count) => sum + count, 0)
    await tx.importBatch.update({
      where: { id: importId },
      data: {
        status: 'rolledBack',
        rolledBackAt: new Date(),
        rolledBackJson: JSON.stringify(removed),
      },
    })

    return {
      importId,
      removed,
      removedTransactions: removed.transaction ?? 0,
      total,
    }
  })

  return {
    importId: result.importId,
    removed: result.removed,
    removedTransactions: result.removedTransactions,
  }
}

/**
 * 按父子深度删除分类：每轮删当前叶子，直到全部删完。
 * 若有分类仍被其他数据引用（不是本批新建的行），删除会抛错 → 整个事务回滚。
 */
async function deleteCategoryRows(
  tx: TransactionClient,
  table: 'transactionCategory' | 'accountCategory',
  ids: string[]
): Promise<number> {
  if (ids.length === 0) return 0

  const rows = await findCategoryRows(tx, table, ids)
  const remaining = new Map<string, string | null>(rows.map((row) => [row.id, row.parentId]))
  let removed = 0

  while (remaining.size > 0) {
    const leaves = [...remaining.entries()].filter(
      ([, parentId]) => !parentId || !remaining.has(parentId)
    )
    if (leaves.length === 0) {
      throw new ValidationError('分类层级异常，无法按批次回滚')
    }
    for (const [id] of leaves) {
      await deleteCategory(tx, table, id)
      remaining.delete(id)
      removed += 1
    }
  }
  return removed
}

async function findCategoryRows(
  tx: TransactionClient,
  table: 'transactionCategory' | 'accountCategory',
  ids: string[]
): Promise<Array<{ id: string; parentId: string | null }>> {
  if (table === 'transactionCategory') {
    return tx.transactionCategory.findMany({ where: { id: { in: ids } }, select: { id: true, parentId: true } })
  }
  return tx.accountCategory.findMany({ where: { id: { in: ids } }, select: { id: true, parentId: true } })
}

async function deleteCategory(
  tx: TransactionClient,
  table: 'transactionCategory' | 'accountCategory',
  id: string
): Promise<void> {
  if (table === 'transactionCategory') {
    await tx.transactionCategory.delete({ where: { id } })
    return
  }
  await tx.accountCategory.delete({ where: { id } })
}
