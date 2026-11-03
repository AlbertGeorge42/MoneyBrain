import { prisma, type TransactionClient } from '../../prisma.js'
import type { Prisma, TransactionCategory } from '@prisma/client'

// 交易分类表数据访问的唯一入口（D1）。没有软删除字段，方法没有 *IncludingDeleted 变体；
// 分类的 parent→children 树查询（buildCategoryChildrenMap）在 common/db.ts，属公共工具。

const db = (tx?: TransactionClient) => tx ?? prisma

/** 带子分类关联的分类行：移动 / 删除前校验子分类用。 */
export type TransactionCategoryWithChildren = Prisma.TransactionCategoryGetPayload<{
  include: { children: true }
}>

export async function findMany<T extends Prisma.TransactionCategoryFindManyArgs>(
  args: Prisma.SelectSubset<T, Prisma.TransactionCategoryFindManyArgs>,
  tx?: TransactionClient,
): Promise<Prisma.TransactionCategoryGetPayload<T>[]> {
  return db(tx).transactionCategory.findMany(
    args as Prisma.SelectSubset<T, Prisma.TransactionCategoryFindManyArgs>,
  )
}

export async function findFirst<T extends Prisma.TransactionCategoryFindFirstArgs>(
  args: Prisma.SelectSubset<T, Prisma.TransactionCategoryFindFirstArgs>,
  tx?: TransactionClient,
): Promise<Prisma.TransactionCategoryGetPayload<T> | null> {
  return db(tx).transactionCategory.findFirst(
    args as Prisma.SelectSubset<T, Prisma.TransactionCategoryFindFirstArgs>,
  )
}

export async function findById(
  id: string,
  tx?: TransactionClient,
): Promise<TransactionCategory | null> {
  return db(tx).transactionCategory.findUnique({ where: { id } })
}

export async function findByIdWithChildren(
  id: string,
  tx?: TransactionClient,
): Promise<TransactionCategoryWithChildren | null> {
  return db(tx).transactionCategory.findUnique({ where: { id }, include: { children: true } })
}

export async function create<T extends Prisma.TransactionCategoryCreateArgs>(
  args: Prisma.SelectSubset<T, Prisma.TransactionCategoryCreateArgs>,
  tx?: TransactionClient,
): Promise<Prisma.TransactionCategoryGetPayload<T>> {
  return db(tx).transactionCategory.create(
    args as Prisma.SelectSubset<T, Prisma.TransactionCategoryCreateArgs>,
  )
}

export async function update<T extends Prisma.TransactionCategoryUpdateArgs>(
  args: Prisma.SelectSubset<T, Prisma.TransactionCategoryUpdateArgs>,
  tx?: TransactionClient,
): Promise<Prisma.TransactionCategoryGetPayload<T>> {
  return db(tx).transactionCategory.update(
    args as Prisma.SelectSubset<T, Prisma.TransactionCategoryUpdateArgs>,
  )
}

export async function deleteById(
  id: string,
  tx?: TransactionClient,
): Promise<TransactionCategory> {
  return db(tx).transactionCategory.delete({ where: { id } })
}

export async function count(
  where?: Prisma.TransactionCategoryWhereInput,
  tx?: TransactionClient,
): Promise<number> {
  return db(tx).transactionCategory.count({ where })
}

/** 批量更新排序（含父分类移动）：整个批次一个事务，部分失败全部回滚。 */
export async function updateSorts(
  items: Array<{ id: string; sort: number; parentId: string | null }>,
): Promise<void> {
  await prisma.$transaction(
    items.map((item) =>
      prisma.transactionCategory.update({
        where: { id: item.id },
        data: { sort: item.sort, parentId: item.parentId },
      })
    )
  )
}
