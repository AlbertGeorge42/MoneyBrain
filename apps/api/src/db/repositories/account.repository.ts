import { prisma, type TransactionClient } from '../../prisma.js'
import type { Account, Prisma } from '@prisma/client'

// 账户表数据访问的唯一入口（D1）：service / route 只通过这里读写账户，
// 不再出现 prisma.account。账户没有软删除字段，方法没有 *IncludingDeleted 变体；
// 将来引入软删除或账本过滤时，默认视角只落在这一层（约定见 transaction.repository）。

const db = (tx?: TransactionClient) => tx ?? prisma

/** 账户行 + 分类关联的类型（列表 / 详情 / 写入返回共用，防止 include 漂移）。 */
export type AccountWithCategory = Prisma.AccountGetPayload<{
  include: { category: true }
}>

export async function findMany<T extends Prisma.AccountFindManyArgs>(
  args: Prisma.SelectSubset<T, Prisma.AccountFindManyArgs>,
  tx?: TransactionClient,
): Promise<Prisma.AccountGetPayload<T>[]> {
  return db(tx).account.findMany(args as Prisma.SelectSubset<T, Prisma.AccountFindManyArgs>)
}

export async function findFirst<T extends Prisma.AccountFindFirstArgs>(
  args: Prisma.SelectSubset<T, Prisma.AccountFindFirstArgs>,
  tx?: TransactionClient,
): Promise<Prisma.AccountGetPayload<T> | null> {
  return db(tx).account.findFirst(args as Prisma.SelectSubset<T, Prisma.AccountFindFirstArgs>)
}

export async function findById(id: string, tx?: TransactionClient): Promise<Account | null> {
  return db(tx).account.findUnique({ where: { id } })
}

export async function findByIdWithCategory(
  id: string,
  tx?: TransactionClient,
): Promise<AccountWithCategory | null> {
  return db(tx).account.findUnique({ where: { id }, include: { category: true } })
}

export async function createWithCategory(
  data: Prisma.AccountUncheckedCreateInput,
  tx?: TransactionClient,
): Promise<AccountWithCategory> {
  return db(tx).account.create({ data, include: { category: true } })
}

export async function updateWithCategory(
  id: string,
  data: Prisma.AccountUncheckedUpdateInput,
  tx?: TransactionClient,
): Promise<AccountWithCategory> {
  return db(tx).account.update({ where: { id }, data, include: { category: true } })
}

export async function deleteById(id: string, tx?: TransactionClient): Promise<Account> {
  return db(tx).account.delete({ where: { id } })
}

export async function count(
  where?: Prisma.AccountWhereInput,
  tx?: TransactionClient,
): Promise<number> {
  return db(tx).account.count({ where })
}

/** 批量硬删除（清库用）：where 由调用方给定。 */
export async function deleteManyWhere(
  where: Prisma.AccountWhereInput | undefined,
  tx?: TransactionClient,
): Promise<Prisma.BatchPayload> {
  return db(tx).account.deleteMany({ where })
}

/** 批量更新排序（含分类挂载）：整个批次一个事务，部分失败全部回滚。 */
export async function updateSorts(
  items: Array<{ id: string; sort: number; categoryId: string | null }>,
): Promise<void> {
  await prisma.$transaction(
    items.map((item) =>
      prisma.account.update({
        where: { id: item.id },
        data: { sort: item.sort, categoryId: item.categoryId },
      })
    )
  )
}
