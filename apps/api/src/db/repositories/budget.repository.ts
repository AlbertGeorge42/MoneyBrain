import { prisma, type TransactionClient } from '../../prisma.js'
import type { Budget, Prisma } from '@prisma/client'
import { createSyncVersion, updateSyncVersion } from '../sync-version.js'

// 预算表数据访问的唯一入口（D1）：service / route 不再出现 prisma.budget。
// 预算没有软删除字段。返回给前端的预算固定带 account / toAccount / category
// （TRANSACTION_RELATIONS 同款约定，防止各处 include 漂移）；不需要关联时用 findById。

const db = (tx?: TransactionClient) => tx ?? prisma

export const BUDGET_RELATIONS = {
  account: true,
  toAccount: true,
  category: true,
} satisfies Prisma.BudgetInclude

/** 带固定关联的预算行类型（列表 / 状态 / 下钻 / 导出共用）。 */
export type BudgetWithRelations = Prisma.BudgetGetPayload<{
  include: typeof BUDGET_RELATIONS
}>

export async function findManyWithRelations(
  where?: Prisma.BudgetWhereInput,
  orderBy?: Prisma.BudgetOrderByWithRelationInput,
  tx?: TransactionClient,
): Promise<BudgetWithRelations[]> {
  return db(tx).budget.findMany({ where, orderBy, include: BUDGET_RELATIONS })
}

export async function findUniqueWithRelations(
  id: string,
  tx?: TransactionClient,
): Promise<BudgetWithRelations | null> {
  return db(tx).budget.findUnique({ where: { id }, include: BUDGET_RELATIONS })
}

export async function findById(id: string, tx?: TransactionClient): Promise<Budget | null> {
  return db(tx).budget.findUnique({ where: { id } })
}

export async function findFirst<T extends Prisma.BudgetFindFirstArgs>(
  args: Prisma.SelectSubset<T, Prisma.BudgetFindFirstArgs>,
  tx?: TransactionClient,
): Promise<Prisma.BudgetGetPayload<T> | null> {
  return db(tx).budget.findFirst(args as Prisma.SelectSubset<T, Prisma.BudgetFindFirstArgs>)
}

export async function createWithRelations(
  data: Prisma.BudgetUncheckedCreateInput,
  tx?: TransactionClient,
): Promise<BudgetWithRelations> {
  // 客户端生成的 UUID 是同步身份：同一 id 重复写入视为幂等，不产生第二行。
  if (typeof data.id === 'string') {
    const existing = await db(tx).budget.findUnique({
      where: { id: data.id },
      include: BUDGET_RELATIONS,
    })
    if (existing) return existing
  }
  return db(tx).budget.create({
    data: { ...data, ...(await createSyncVersion()) },
    include: BUDGET_RELATIONS,
  })
}

export async function updateWithRelations(
  id: string,
  data: Prisma.BudgetUncheckedUpdateInput,
  tx?: TransactionClient,
): Promise<BudgetWithRelations> {
  const current = await db(tx).budget.findUnique({
    where: { id },
    select: { rev: true, vv: true },
  })
  const version = current && typeof current.rev === 'number' ? await updateSyncVersion(current) : {}
  return db(tx).budget.update({
    where: { id },
    data: { ...data, ...version },
    include: BUDGET_RELATIONS,
  })
}

export async function deleteById(id: string, tx?: TransactionClient): Promise<Budget> {
  return db(tx).budget.delete({ where: { id } })
}

export async function count(
  where?: Prisma.BudgetWhereInput,
  tx?: TransactionClient,
): Promise<number> {
  return db(tx).budget.count({ where })
}

/** 批量硬删除（账户级联删除用）：where 由调用方给定。 */
export async function deleteManyWhere(
  where: Prisma.BudgetWhereInput | undefined,
  tx?: TransactionClient,
): Promise<Prisma.BatchPayload> {
  return db(tx).budget.deleteMany({ where })
}

/** 分类被删除时用于转移 / 撤销回填：列出挂在指定分类上的预算 id。 */
export async function findIdsByCategory(
  categoryId: string,
  tx?: TransactionClient,
): Promise<string[]> {
  const rows = await db(tx).budget.findMany({
    where: { categoryId },
    select: { id: true },
  })
  return rows.map((row) => row.id)
}

/** 把分类下的预算整体转到目标分类（分类转移删除用）。 */
export async function transferCategoryTo(
  categoryId: string,
  targetCategoryId: string,
  tx?: TransactionClient,
): Promise<Prisma.BatchPayload> {
  return db(tx).budget.updateMany({
    where: { categoryId },
    data: { categoryId: targetCategoryId },
  })
}

/** 撤销分类删除：只回填仍停在目标分类下的预算，期间被用户改走的不覆盖。 */
export async function reassignCategoryByIds(
  ids: string[],
  fromCategoryId: string,
  toCategoryId: string,
  tx?: TransactionClient,
): Promise<Prisma.BatchPayload> {
  return db(tx).budget.updateMany({
    where: { id: { in: ids }, categoryId: fromCategoryId },
    data: { categoryId: toCategoryId },
  })
}
