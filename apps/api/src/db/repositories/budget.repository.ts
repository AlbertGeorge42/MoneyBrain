import { prisma, type TransactionClient } from '../../prisma.js'
import type { Budget, Prisma } from '@prisma/client'

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
  return db(tx).budget.create({ data, include: BUDGET_RELATIONS })
}

export async function updateWithRelations(
  id: string,
  data: Prisma.BudgetUncheckedUpdateInput,
  tx?: TransactionClient,
): Promise<BudgetWithRelations> {
  return db(tx).budget.update({ where: { id }, data, include: BUDGET_RELATIONS })
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
