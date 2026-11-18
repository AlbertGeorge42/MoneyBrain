/**
 * AccountCategory 有效属性解析（严格根节点继承）。
 *
 * isCashEquivalent / isInvestment 只允许在根节点配置，所有子分类无条件继承所属根节点的值。
 * 子分类自身存储的这两个字段一律忽略，历史脏数据不会影响计算结果。
 *
 * 纯计算函数：不访问数据库，调用方负责传入全量 AccountCategory 行。
 */
import { buildChildrenMap } from '../common/index.js'

type CategoryRow = {
  id: string
  parentId: string | null
  isCashEquivalent: boolean
  isInvestment: boolean
}

export interface ResolvedAccountCategoryFlags {
  /** 根节点或其任意后代被视为现金等价的 categoryId 集合。 */
  cashCategoryIds: Set<string>
  /** 根节点或其任意后代被视为投资的 categoryId 集合。 */
  investmentCategoryIds: Set<string>
  /** 每个 categoryId 的有效计算属性（继承后的结果，不含子分类自身脏值）。 */
  effectiveFlags: Map<string, { isCashEquivalent: boolean; isInvestment: boolean }>
}

/**
 * 从全量 AccountCategory 行解析有效计算属性。
 *
 * 算法：
 *  1. buildChildrenMap 建 parentId → 子节点映射。
 *  2. 找到所有根节点（parentId === null）。
 *  3. BFS 从每个根节点向下传播：后代节点直接拿根节点的 isCashEquivalent / isInvestment。
 *  4. 无根节点的孤立节点（parentId 指向不存在的 id）归入 orphan 集合，使用自身值（安全兜底）。
 *
 * 孤立节点处理：如果一条分类的 parentId 非 null 但在输入数组里找不到对应父节点，
 *  它会被当作自己的根节点处理——使用自身的计算属性值。这不完美但比静默继承别人的根节点更安全。
 */
export function resolveAccountCategoryFlags(
  categories: readonly CategoryRow[],
): ResolvedAccountCategoryFlags {
  const childrenMap = buildChildrenMap(categories as unknown as Array<{ id: string; parentId: string | null }>)

  const roots: CategoryRow[] = []
  const idSet = new Set<string>()
  for (const c of categories) {
    idSet.add(c.id)
  }
  for (const c of categories) {
    if (c.parentId === null || !idSet.has(c.parentId)) {
      roots.push(c)
    }
  }

  const effectiveFlags = new Map<string, { isCashEquivalent: boolean; isInvestment: boolean }>()
  const cashCategoryIds = new Set<string>()
  const investmentCategoryIds = new Set<string>()

  for (const root of roots) {
    const rootFlags = {
      isCashEquivalent: root.isCashEquivalent,
      isInvestment: root.isInvestment,
    }
    effectiveFlags.set(root.id, rootFlags)
    if (rootFlags.isCashEquivalent) cashCategoryIds.add(root.id)
    if (rootFlags.isInvestment) investmentCategoryIds.add(root.id)

    const queue = [root.id]
    while (queue.length > 0) {
      const current = queue.shift()!
      const children = childrenMap.get(current) ?? []
      for (const child of children) {
        const childFlags = { ...rootFlags }
        effectiveFlags.set(child.id, childFlags)
        if (childFlags.isCashEquivalent) cashCategoryIds.add(child.id)
        if (childFlags.isInvestment) investmentCategoryIds.add(child.id)
        queue.push(child.id)
      }
    }
  }

  return { cashCategoryIds, investmentCategoryIds, effectiveFlags }
}
