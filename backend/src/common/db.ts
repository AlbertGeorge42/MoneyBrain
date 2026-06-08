import { prisma } from '../index.js'

/**
 * 通用排序值获取：查询指定模型的最大 sort 值并返回下一个
 */
export async function getNextSort(
  model: 'accountCategory' | 'account' | 'transactionCategory',
  where: Record<string, unknown>
): Promise<number> {
  let result: { _max: { sort: number | null } }

  if (model === 'accountCategory') {
    result = await prisma.accountCategory.aggregate({ where, _max: { sort: true } })
  } else if (model === 'account') {
    result = await prisma.account.aggregate({ where, _max: { sort: true } })
  } else {
    result = await prisma.transactionCategory.aggregate({ where, _max: { sort: true } })
  }

  return (result._max.sort ?? -1) + 1
}
