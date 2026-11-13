import { prisma, type TransactionClient } from '../../prisma.js'
import type { InvestmentAssetClass, Prisma } from '@prisma/client'

// 投资资产类别表数据访问的唯一入口（D1）。没有软删除字段，方法没有 *IncludingDeleted 变体。

const db = (tx?: TransactionClient) => tx ?? prisma

export async function findMany<T extends Prisma.InvestmentAssetClassFindManyArgs>(
  args: Prisma.SelectSubset<T, Prisma.InvestmentAssetClassFindManyArgs>,
  tx?: TransactionClient,
): Promise<Prisma.InvestmentAssetClassGetPayload<T>[]> {
  return db(tx).investmentAssetClass.findMany(
    args as Prisma.SelectSubset<T, Prisma.InvestmentAssetClassFindManyArgs>,
  )
}

export async function findFirst<T extends Prisma.InvestmentAssetClassFindFirstArgs>(
  args: Prisma.SelectSubset<T, Prisma.InvestmentAssetClassFindFirstArgs>,
  tx?: TransactionClient,
): Promise<Prisma.InvestmentAssetClassGetPayload<T> | null> {
  return db(tx).investmentAssetClass.findFirst(
    args as Prisma.SelectSubset<T, Prisma.InvestmentAssetClassFindFirstArgs>,
  )
}

export async function findById(
  id: string,
  tx?: TransactionClient,
): Promise<InvestmentAssetClass | null> {
  return db(tx).investmentAssetClass.findUnique({ where: { id } })
}

export async function create<T extends Prisma.InvestmentAssetClassCreateArgs>(
  args: Prisma.SelectSubset<T, Prisma.InvestmentAssetClassCreateArgs>,
  tx?: TransactionClient,
): Promise<Prisma.InvestmentAssetClassGetPayload<T>> {
  return db(tx).investmentAssetClass.create(
    args as Prisma.SelectSubset<T, Prisma.InvestmentAssetClassCreateArgs>,
  )
}

export async function update<T extends Prisma.InvestmentAssetClassUpdateArgs>(
  args: Prisma.SelectSubset<T, Prisma.InvestmentAssetClassUpdateArgs>,
  tx?: TransactionClient,
): Promise<Prisma.InvestmentAssetClassGetPayload<T>> {
  return db(tx).investmentAssetClass.update(
    args as Prisma.SelectSubset<T, Prisma.InvestmentAssetClassUpdateArgs>,
  )
}

export async function deleteById(
  id: string,
  tx?: TransactionClient,
): Promise<InvestmentAssetClass> {
  return db(tx).investmentAssetClass.delete({ where: { id } })
}

export async function deleteManyWhere(
  where: Prisma.InvestmentAssetClassWhereInput | undefined,
  tx?: TransactionClient,
): Promise<Prisma.BatchPayload> {
  return db(tx).investmentAssetClass.deleteMany({ where })
}

export async function count(
  where?: Prisma.InvestmentAssetClassWhereInput,
  tx?: TransactionClient,
): Promise<number> {
  return db(tx).investmentAssetClass.count({ where })
}
