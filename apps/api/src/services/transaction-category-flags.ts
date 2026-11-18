/**
 * TransactionCategory cashFlowType 有效属性解析（严格根节点继承）。
 *
 * cashFlowType 只允许在根节点配置，所有子分类无条件继承所属根节点的值。
 * 子分类自身存储的 cashFlowType 一律忽略，历史脏数据不会影响计算结果。
 * 根节点 cashFlowType 为 null 时，整个分类树的有效值均为 null（遵循 uncategorized 规则）。
 *
 * 纯计算函数：不访问数据库，调用方负责传入全量 TransactionCategory 行。
 */
import { buildChildrenMap } from '../common/index.js'

type CategoryRow = {
  id: string
  parentId: string | null
  cashFlowType: string | null
}

export type EffectiveCashFlowType = 'operating' | 'investing' | 'financing' | null

export interface ResolvedTransactionCategoryFlags {
  /** 每个 categoryId 的有效 cashFlowType（继承后的结果）。 */
  effectiveCashFlowTypes: Map<string, EffectiveCashFlowType>
}

/**
 * 从全量 TransactionCategory 行解析有效 cashFlowType。
 * 算法与 resolveAccountCategoryFlags 对称：根节点值向下 BFS 传播。
 * 孤立节点（parentId 指向不存在的 id）使用自身 cashFlowType 作为安全兜底。
 */
export function resolveTransactionCategoryFlags(
  categories: readonly CategoryRow[],
): ResolvedTransactionCategoryFlags {
  const childrenMap = buildChildrenMap(categories as unknown as Array<{ id: string; parentId: string | null }>)

  const idSet = new Set<string>()
  for (const c of categories) idSet.add(c.id)

  const roots: CategoryRow[] = []
  for (const c of categories) {
    if (c.parentId === null || !idSet.has(c.parentId)) {
      roots.push(c)
    }
  }

  const effectiveCashFlowTypes = new Map<string, EffectiveCashFlowType>()

  for (const root of roots) {
    const rootType = root.cashFlowType as EffectiveCashFlowType
    effectiveCashFlowTypes.set(root.id, rootType)

    const queue = [root.id]
    while (queue.length > 0) {
      const current = queue.shift()!
      const children = childrenMap.get(current) ?? []
      for (const child of children) {
        effectiveCashFlowTypes.set(child.id, rootType)
        queue.push(child.id)
      }
    }
  }

  return { effectiveCashFlowTypes }
}
