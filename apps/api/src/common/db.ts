import { prisma } from '../prisma.js'
import { buildChildrenMap } from './tree.js'

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

/**
 * 构建交易分类 parent→children 映射（select id/parentId）。
 * - 可选按分类类型过滤（供报表/分析按类型下钻时使用）
 * - 顶级分类（parentId 为 null）统一归入 null key
 */
export async function buildCategoryChildrenMap(
  type?: string,
  categories?: { id: string; parentId: string | null }[]
): Promise<Map<string | null, { id: string; parentId: string | null }[]>> {
  const allCategories = categories ?? (await prisma.transactionCategory.findMany({
    where: type ? { type } : undefined,
    select: { id: true, parentId: true },
  }))
  return buildChildrenMap(allCategories)
}
