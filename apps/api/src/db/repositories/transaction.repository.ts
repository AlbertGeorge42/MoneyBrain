import { prisma, type TransactionClient } from '../../prisma.js'
import type { Prisma, Transaction } from '@prisma/client'
import { createSyncVersion, updateSyncVersion } from '../sync-version.js'

// 交易表数据访问的唯一入口（B2-2 与 D1 的 repository 部分一并落地）。
//
// 软删除过滤**只发生在这一层**：除方法名标注 IncludingDeleted 的以外，
// 所有读取默认只看未删除交易；service / route 不允许再写 deletedAt 条件。
// 需要看已删除数据的调用点（回收站、导入幂等键、防孤儿校验）必须在
// 方法名里显式暴露，让「谁在看已删除数据」可被 grep 检查。

const db = (tx?: TransactionClient) => tx ?? prisma

/** 软删除过滤条件的唯一来源：本文件之外不得再写 deletedAt 条件。 */
const NOT_DELETED = { deletedAt: null } satisfies Prisma.TransactionWhereInput

/**
 * 交易返回给前端时固定带上的关联，避免各处 include 漂移；
 * 退款列表只含未删除、按日期倒序。
 */
export const TRANSACTION_RELATIONS = {
  account: true,
  category: true,
  toAccount: true,
  relatedTransaction: { include: { account: true, category: true } },
  refunds: {
    where: NOT_DELETED,
    include: { account: true, category: true },
    orderBy: { date: 'desc' },
  },
} satisfies Prisma.TransactionInclude

/** 带固定关联的交易行类型（service / route 的返回类型共用）。 */
export type TransactionWithRelations = Prisma.TransactionGetPayload<{
  include: typeof TRANSACTION_RELATIONS
}>

// ===== 默认视角：未删除交易 =====

export async function findActive<T extends Omit<Prisma.TransactionFindManyArgs, 'where'>>(
  where: Prisma.TransactionWhereInput,
  args: Prisma.SelectSubset<T, Omit<Prisma.TransactionFindManyArgs, 'where'>>,
  tx?: TransactionClient,
): Promise<Prisma.TransactionGetPayload<T>[]> {
  // SelectSubset 是名义条件类型：用 Object.assign 复制并补过滤（泛型条件类型不可 spread），按官方模式委托
  const merged = Object.assign({}, args, { where: { ...where, ...NOT_DELETED } })
  return db(tx).transaction.findMany(
    merged as Prisma.SelectSubset<T, Prisma.TransactionFindManyArgs>,
  )
}

export async function findFirstActive<T extends Omit<Prisma.TransactionFindFirstArgs, 'where'>>(
  where: Prisma.TransactionWhereInput,
  args: Prisma.SelectSubset<T, Omit<Prisma.TransactionFindFirstArgs, 'where'>>,
  tx?: TransactionClient,
): Promise<Prisma.TransactionGetPayload<T> | null> {
  const merged = Object.assign({}, args, { where: { ...where, ...NOT_DELETED } })
  return db(tx).transaction.findFirst(
    merged as Prisma.SelectSubset<T, Prisma.TransactionFindFirstArgs>,
  )
}

export async function countActive(where: Prisma.TransactionWhereInput, tx?: TransactionClient): Promise<number> {
  return db(tx).transaction.count({ where: { ...where, ...NOT_DELETED } })
}

/** 金额合计（账户收支统计用）。 */
export async function sumActiveAmount(
  where: Prisma.TransactionWhereInput,
  tx?: TransactionClient,
): Promise<{ _sum: { amount: bigint | null } }> {
  return db(tx).transaction.aggregate({ where: { ...where, ...NOT_DELETED }, _sum: { amount: true } })
}

/** 交易统计的口径聚合：类型 × 退款原类型 × 不计收支 × 口径版本。 */
export function sumActiveAmountByFlowKind(where: Prisma.TransactionWhereInput, tx?: TransactionClient) {
  return db(tx).transaction.groupBy({
    by: ['type', 'relatedType', 'excludeFromIncomeExpense', 'ruleVersion'],
    where: { ...where, ...NOT_DELETED },
    _sum: { amount: true },
  })
}

/** 预算用量的口径聚合：账户 × 转入账户 × 分类 × 类型 × 退款原类型 × 不计收支 × 口径版本。 */
export function sumActiveAmountByBudgetScope(where: Prisma.TransactionWhereInput, tx?: TransactionClient) {
  return db(tx).transaction.groupBy({
    by: ['accountId', 'toAccountId', 'categoryId', 'type', 'relatedType', 'excludeFromIncomeExpense', 'ruleVersion'],
    where: { ...where, ...NOT_DELETED },
    _sum: { amount: true },
  })
}

/** 按 id 查未删除交易（业务默认视角：已删除的交易视同不存在）。 */
export async function findById(id: string, tx?: TransactionClient): Promise<Transaction | null> {
  return db(tx).transaction.findUnique({ where: { id, ...NOT_DELETED } })
}

/** 按 id 查带关联的交易详情；回收站里查看已删除交易时传 includeDeleted。 */
export async function findByIdWithRelations(
  id: string,
  options: { includeDeleted?: boolean } = {},
  tx?: TransactionClient,
): Promise<TransactionWithRelations | null> {
  return db(tx).transaction.findUnique({
    where: options.includeDeleted ? { id } : { id, ...NOT_DELETED },
    include: TRANSACTION_RELATIONS,
  })
}

/** 最早一笔未删除交易的日期（报表期间参考；已删除交易不参与）。 */
export async function findEarliestActiveDate(): Promise<Date | null> {
  const earliest = await prisma.transaction.findFirst({
    where: NOT_DELETED,
    orderBy: { date: 'asc' },
    select: { date: true },
  })
  return earliest?.date ?? null
}

// ===== 已删除 / 全量视角 =====

/** 按 id 查交易，不过滤软删除（撤销反向写前核对现状用）。 */
export async function findByIdIncludingDeleted(id: string, tx?: TransactionClient): Promise<Transaction | null> {
  return db(tx).transaction.findUnique({ where: { id } })
}

/** 回收站：已删除交易，按删除时间倒序。 */
export async function listDeleted(): Promise<TransactionWithRelations[]> {
  return prisma.transaction.findMany({
    where: { deletedAt: { not: null } },
    include: TRANSACTION_RELATIONS,
    orderBy: { deletedAt: 'desc' },
  })
}

/** 不过滤软删除的计数（防孤儿校验：含回收站里的行，判定从保守）。 */
export async function countIncludingDeleted(
  where: Prisma.TransactionWhereInput,
  tx?: TransactionClient,
): Promise<number> {
  return db(tx).transaction.count({ where })
}

/** 导入幂等键查重：软删除行仍占用唯一 importKey，必须一并查出。 */
export async function findByImportKeys(
  keys: string[],
  tx?: TransactionClient,
): Promise<Array<{ id: string; importKey: string | null }>> {
  if (keys.length === 0) return []
  return db(tx).transaction.findMany({
    where: { importKey: { in: keys } },
    select: { id: true, importKey: true },
  })
}

// ===== 写入 =====

export async function createWithRelations(
  data: Prisma.TransactionUncheckedCreateInput,
  tx?: TransactionClient,
): Promise<TransactionWithRelations> {
  // 客户端生成的 UUID 是同步身份：同一 id 重复写入视为幂等，不产生第二行。
  if (typeof data.id === 'string') {
    const existing = await db(tx).transaction.findUnique({
      where: { id: data.id },
      include: TRANSACTION_RELATIONS,
    })
    if (existing) return existing
  }
  return db(tx).transaction.create({
    data: { ...data, ...(await createSyncVersion()) },
    include: TRANSACTION_RELATIONS,
  })
}

export async function updateWithRelations(
  id: string,
  data: Prisma.TransactionUncheckedUpdateInput,
  tx?: TransactionClient,
): Promise<TransactionWithRelations> {
  const current = await db(tx).transaction.findUnique({
    where: { id },
    select: { rev: true, vv: true },
  })
  const version = current && typeof current.rev === 'number' ? await updateSyncVersion(current) : {}
  return db(tx).transaction.update({
    where: { id },
    data: { ...data, ...version },
    include: TRANSACTION_RELATIONS,
  })
}

/** 裸行更新（审计反向写用），返回更新后的完整行。 */
export async function updateFields(
  id: string,
  data: Prisma.TransactionUncheckedUpdateInput,
  tx?: TransactionClient,
): Promise<Transaction> {
  const current = await db(tx).transaction.findUnique({
    where: { id },
    select: { rev: true, vv: true },
  })
  const version = current && typeof current.rev === 'number' ? await updateSyncVersion(current) : {}
  return db(tx).transaction.update({ where: { id }, data: { ...data, ...version } })
}

/** 软删除：deletedAt 的写入入口之一（撤销/恢复走 updateFields 反向写）。 */
export async function softDelete(id: string, tx?: TransactionClient): Promise<Transaction> {
  const current = await db(tx).transaction.findUnique({
    where: { id },
    select: { rev: true, vv: true },
  })
  const version = current && typeof current.rev === 'number' ? await updateSyncVersion(current) : {}
  return db(tx).transaction.update({
    where: { id },
    data: { deletedAt: new Date(), ...version },
  })
}

// ===== 批量操作（清库 / 覆盖导入 / 级联删除 / CSV 导入） =====

/** 批量硬删除，不过滤软删除（清库与覆盖导入本来就是全量删除）。 */
export async function deleteManyWhere(
  where: Prisma.TransactionWhereInput | undefined,
  tx?: TransactionClient,
): Promise<Prisma.BatchPayload> {
  return db(tx).transaction.deleteMany({ where })
}

/** 分类删除时的交易转移：包含软删除行，避免回收站里的交易悬挂 categoryId。 */
export async function transferCategoryTo(
  fromCategoryId: string,
  toCategoryId: string,
  tx?: TransactionClient,
): Promise<Prisma.BatchPayload> {
  return db(tx).transaction.updateMany({
    where: { categoryId: fromCategoryId },
    data: { categoryId: toCategoryId, rev: { increment: 1 } },
  })
}

/** CSV 批量写入。 */
export async function createMany(
  data: Prisma.TransactionCreateManyInput[],
  tx?: TransactionClient,
): Promise<Prisma.BatchPayload> {
  const version = await createSyncVersion()
  return db(tx).transaction.createMany({
    data: data.map((row) => ({ ...row, ...version })),
  })
}
