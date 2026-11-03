import { prisma, type TransactionClient } from '../../prisma.js'
import type { InvestmentAllocationSnapshot, Prisma } from '@prisma/client'

// 投资配置快照表数据访问的唯一入口（D1）。没有软删除字段。
// 快照读取固定带明细（items + assetClass，按 sort 升序），常量收口防止 include 漂移；
// 需要额外关联（account / previousSnapshot / nextSnapshots）时在调用点 spread 常量。

const db = (tx?: TransactionClient) => tx ?? prisma

export const SNAPSHOT_ITEMS_RELATIONS = {
  items: {
    include: { assetClass: true },
    orderBy: { sort: 'asc' },
  },
} satisfies Prisma.InvestmentAllocationSnapshotInclude

/** 带明细（items + assetClass）的快照行类型。 */
export type SnapshotWithItems = Prisma.InvestmentAllocationSnapshotGetPayload<{
  include: typeof SNAPSHOT_ITEMS_RELATIONS
}>

export async function findMany<T extends Prisma.InvestmentAllocationSnapshotFindManyArgs>(
  args: Prisma.SelectSubset<T, Prisma.InvestmentAllocationSnapshotFindManyArgs>,
  tx?: TransactionClient,
): Promise<Prisma.InvestmentAllocationSnapshotGetPayload<T>[]> {
  return db(tx).investmentAllocationSnapshot.findMany(
    args as Prisma.SelectSubset<T, Prisma.InvestmentAllocationSnapshotFindManyArgs>,
  )
}

export async function findFirst<T extends Prisma.InvestmentAllocationSnapshotFindFirstArgs>(
  args: Prisma.SelectSubset<T, Prisma.InvestmentAllocationSnapshotFindFirstArgs>,
  tx?: TransactionClient,
): Promise<Prisma.InvestmentAllocationSnapshotGetPayload<T> | null> {
  return db(tx).investmentAllocationSnapshot.findFirst(
    args as Prisma.SelectSubset<T, Prisma.InvestmentAllocationSnapshotFindFirstArgs>,
  )
}

export async function findUnique<T extends Prisma.InvestmentAllocationSnapshotFindUniqueArgs>(
  args: Prisma.SelectSubset<T, Prisma.InvestmentAllocationSnapshotFindUniqueArgs>,
  tx?: TransactionClient,
): Promise<Prisma.InvestmentAllocationSnapshotGetPayload<T> | null> {
  return db(tx).investmentAllocationSnapshot.findUnique(
    args as Prisma.SelectSubset<T, Prisma.InvestmentAllocationSnapshotFindUniqueArgs>,
  )
}

export async function create<T extends Prisma.InvestmentAllocationSnapshotCreateArgs>(
  args: Prisma.SelectSubset<T, Prisma.InvestmentAllocationSnapshotCreateArgs>,
  tx?: TransactionClient,
): Promise<Prisma.InvestmentAllocationSnapshotGetPayload<T>> {
  return db(tx).investmentAllocationSnapshot.create(
    args as Prisma.SelectSubset<T, Prisma.InvestmentAllocationSnapshotCreateArgs>,
  )
}

export async function update<T extends Prisma.InvestmentAllocationSnapshotUpdateArgs>(
  args: Prisma.SelectSubset<T, Prisma.InvestmentAllocationSnapshotUpdateArgs>,
  tx?: TransactionClient,
): Promise<Prisma.InvestmentAllocationSnapshotGetPayload<T>> {
  return db(tx).investmentAllocationSnapshot.update(
    args as Prisma.SelectSubset<T, Prisma.InvestmentAllocationSnapshotUpdateArgs>,
  )
}

export async function deleteById(
  id: string,
  tx?: TransactionClient,
): Promise<InvestmentAllocationSnapshot> {
  return db(tx).investmentAllocationSnapshot.delete({ where: { id } })
}

export async function deleteManyWhere(
  where: Prisma.InvestmentAllocationSnapshotWhereInput | undefined,
  tx?: TransactionClient,
): Promise<Prisma.BatchPayload> {
  return db(tx).investmentAllocationSnapshot.deleteMany({ where })
}

export async function count(
  where?: Prisma.InvestmentAllocationSnapshotWhereInput,
  tx?: TransactionClient,
): Promise<number> {
  return db(tx).investmentAllocationSnapshot.count({ where })
}
