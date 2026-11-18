/**
 * 分类计算属性解析（严格根节点继承）。
 *
 * 计算属性只属于根分类：isCashEquivalent / isInvestment / cashFlowType 只在
 * parentId = null 的根分类上有值，子分类字段恒为 null。本解析器从根节点向下
 * BFS 传播有效值，子分类自身字段不参与覆盖。
 *
 * 纯计算函数：不访问数据库、不依赖 contracts / Prisma，调用方传入全量分类行。
 */

export type AccountCategoryFlagRow = {
  id: string
  parentId: string | null
  isCashEquivalent: boolean | null
  isInvestment: boolean | null
}

export interface ResolvedAccountCategoryFlags {
  /** 根节点或其任意后代被视为现金等价的 categoryId 集合。 */
  cashCategoryIds: Set<string>
  /** 根节点或其任意后代被视为投资的 categoryId 集合。 */
  investmentCategoryIds: Set<string>
  /** 每个 categoryId 的有效计算属性（继承后的结果）。 */
  effectiveFlags: Map<string, { isCashEquivalent: boolean; isInvestment: boolean }>
}

export type EffectiveCashFlowType = 'operating' | 'investing' | 'financing' | null

export type TransactionCategoryFlagRow = {
  id: string
  parentId: string | null
  cashFlowType: string | null
}

export interface ResolvedTransactionCategoryFlags {
  effectiveCashFlowTypes: Map<string, EffectiveCashFlowType>
}

function childrenMapOf(items: readonly { id: string; parentId: string | null }[]): Map<string | null, string[]> {
  const map = new Map<string | null, string[]>()
  for (const item of items) {
    const key = item.parentId
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item.id)
  }
  return map
}

function rootsOf<T extends { id: string; parentId: string | null }>(items: readonly T[]): T[] {
  const idSet = new Set(items.map((item) => item.id))
  return items.filter((item) => item.parentId === null || !idSet.has(item.parentId))
}

/**
 * 从全量 AccountCategory 行解析有效计算属性。
 * 根节点的两个标志为 null 时按 false 处理；子分类字段被忽略。
 * 孤立节点（parentId 指向不存在的 id）按自身值作为根处理。
 */
export function resolveAccountCategoryFlags(
  categories: readonly AccountCategoryFlagRow[],
): ResolvedAccountCategoryFlags {
  const childrenMap = childrenMapOf(categories)

  const effectiveFlags = new Map<string, { isCashEquivalent: boolean; isInvestment: boolean }>()
  const cashCategoryIds = new Set<string>()
  const investmentCategoryIds = new Set<string>()

  for (const root of rootsOf(categories)) {
    const flags = {
      isCashEquivalent: root.isCashEquivalent ?? false,
      isInvestment: root.isInvestment ?? false,
    }
    const queue: string[] = [root.id]
    while (queue.length > 0) {
      const current = queue.shift()!
      effectiveFlags.set(current, flags)
      if (flags.isCashEquivalent) cashCategoryIds.add(current)
      if (flags.isInvestment) investmentCategoryIds.add(current)
      for (const childId of childrenMap.get(current) ?? []) queue.push(childId)
    }
  }

  return { cashCategoryIds, investmentCategoryIds, effectiveFlags }
}

/**
 * 从全量 TransactionCategory 行解析有效 cashFlowType。
 * 根节点为 null 时整个子树 effective 为 null；子分类字段被忽略。
 * 孤立节点按自身值作为根处理。
 */
export function resolveTransactionCategoryFlags(
  categories: readonly TransactionCategoryFlagRow[],
): ResolvedTransactionCategoryFlags {
  const childrenMap = childrenMapOf(categories)

  const effectiveCashFlowTypes = new Map<string, EffectiveCashFlowType>()

  for (const root of rootsOf(categories)) {
    const rootType = (root.cashFlowType ?? null) as EffectiveCashFlowType
    const queue: string[] = [root.id]
    while (queue.length > 0) {
      const current = queue.shift()!
      effectiveCashFlowTypes.set(current, rootType)
      for (const childId of childrenMap.get(current) ?? []) queue.push(childId)
    }
  }

  return { effectiveCashFlowTypes }
}
