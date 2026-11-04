import { prisma, type TransactionClient } from '../../prisma.js'
import type { AccountCategory, Prisma } from '@prisma/client'
import { createSyncVersion, updateSyncVersion } from '../sync-version.js'

// 账户分类表数据访问的唯一入口（D1）。没有软删除字段，方法没有 *IncludingDeleted 变体。

const db = (tx?: TransactionClient) => tx ?? prisma

export async function findMany<T extends Prisma.AccountCategoryFindManyArgs>(
  args: Prisma.SelectSubset<T, Prisma.AccountCategoryFindManyArgs>,
  tx?: TransactionClient,
): Promise<Prisma.AccountCategoryGetPayload<T>[]> {
  return db(tx).accountCategory.findMany(
    args as Prisma.SelectSubset<T, Prisma.AccountCategoryFindManyArgs>,
  )
}

export async function findFirst<T extends Prisma.AccountCategoryFindFirstArgs>(
  args: Prisma.SelectSubset<T, Prisma.AccountCategoryFindFirstArgs>,
  tx?: TransactionClient,
): Promise<Prisma.AccountCategoryGetPayload<T> | null> {
  return db(tx).accountCategory.findFirst(
    args as Prisma.SelectSubset<T, Prisma.AccountCategoryFindFirstArgs>,
  )
}

export async function findById(id: string, tx?: TransactionClient): Promise<AccountCategory | null> {
  return db(tx).accountCategory.findUnique({ where: { id } })
}

export async function create<T extends Prisma.AccountCategoryCreateArgs>(
  args: Prisma.SelectSubset<T, Prisma.AccountCategoryCreateArgs>,
  tx?: TransactionClient,
): Promise<Prisma.AccountCategoryGetPayload<T>> {
  const clientId = (args.data as { id?: unknown }).id
  if (typeof clientId === 'string') {
    const existing = await db(tx).accountCategory.findUnique({ where: { id: clientId } })
    if (existing) return existing as Prisma.AccountCategoryGetPayload<T>
  }
  const data = { ...(args.data as object), ...(await createSyncVersion()) }
  return db(tx).accountCategory.create({
    ...args,
    data,
  } as Prisma.SelectSubset<T, Prisma.AccountCategoryCreateArgs>)
}

export async function update<T extends Prisma.AccountCategoryUpdateArgs>(
  args: Prisma.SelectSubset<T, Prisma.AccountCategoryUpdateArgs>,
  tx?: TransactionClient,
): Promise<Prisma.AccountCategoryGetPayload<T>> {
  const current = await db(tx).accountCategory.findUnique({
    where: args.where as Prisma.AccountCategoryWhereUniqueInput,
    select: { rev: true, vv: true },
  })
  const version = current && typeof current.rev === 'number' ? await updateSyncVersion(current) : {}
  return db(tx).accountCategory.update({
    ...args,
    data: { ...(args.data as object), ...version },
  } as Prisma.SelectSubset<T, Prisma.AccountCategoryUpdateArgs>)
}

export async function deleteById(id: string, tx?: TransactionClient): Promise<AccountCategory> {
  return db(tx).accountCategory.delete({ where: { id } })
}

export async function count(
  where?: Prisma.AccountCategoryWhereInput,
  tx?: TransactionClient,
): Promise<number> {
  return db(tx).accountCategory.count({ where })
}

/** 批量硬删除（清库用，按 parentId 分两轮保证子表先删）：where 由调用方给定。 */
export async function deleteManyWhere(
  where: Prisma.AccountCategoryWhereInput | undefined,
  tx?: TransactionClient,
): Promise<Prisma.BatchPayload> {
  return db(tx).accountCategory.deleteMany({ where })
}

/** 批量更新排序：整个批次一个事务，部分失败全部回滚。 */
export async function updateSorts(items: Array<{ id: string; sort: number }>): Promise<void> {
  await prisma.$transaction(
    items.map((item) =>
      prisma.accountCategory.update({
        where: { id: item.id },
        data: { sort: item.sort, rev: { increment: 1 } },
      })
    )
  )
}
