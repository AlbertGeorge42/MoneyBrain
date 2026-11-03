import { prisma, type TransactionClient } from '../../prisma.js'
import type { Prisma } from '@prisma/client'

// 快照明细表（InvestmentAllocationItem）数据访问的唯一入口（D1）。
// 明细行没有独立读取场景（读取一律经快照的 items 关联），这里只有级联清理与计数。

const db = (tx?: TransactionClient) => tx ?? prisma

export async function deleteManyWhere(
  where: Prisma.InvestmentAllocationItemWhereInput | undefined,
  tx?: TransactionClient,
): Promise<Prisma.BatchPayload> {
  return db(tx).investmentAllocationItem.deleteMany({ where })
}

export async function count(
  where: Prisma.InvestmentAllocationItemWhereInput,
  tx?: TransactionClient,
): Promise<number> {
  return db(tx).investmentAllocationItem.count({ where })
}
