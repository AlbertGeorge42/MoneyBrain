/**
 * 收支类报表的分类结构最小视图。
 * API 从 Prisma 分类表映射而来；Domain 不认识分类表模型，也不生成「未分类」这类展示文案。
 */
export interface CategoryRef {
  id: string
  name: string
  type: string
  parentId: string | null
  sort: number
}

export type FlowCategoryType = 'income' | 'expense'

/**
 * 分类树的唯一递归实现：收支表与三来源投影共用这一份骨架。
 *
 * 负责的规则：按 parentId 分桶、按 type 过滤、递归子节点、
 * `hasChildren` 基于**真实分类层级**（不是产出节点数）、按 sort 稳定排序。
 * `makeNode` 返回 null 表示自身无数据且子树无产出，该节点整条跳过。
 * 列值口径（自身取值、子树聚合、空节点判定、节点字段）由两个报表各自的组装器提供。
 */
export function buildCategoryTree<N>(
  categories: readonly CategoryRef[],
  type: FlowCategoryType,
  makeNode: (category: CategoryRef, children: N[], hasChildren: boolean) => N | null,
): N[] {
  const childrenOf = new Map<string | null, CategoryRef[]>()
  for (const category of categories) {
    const key = category.parentId ?? null
    const siblings = childrenOf.get(key)
    if (siblings) siblings.push(category)
    else childrenOf.set(key, [category])
  }

  const walk = (parentId: string | null): N[] => {
    const produced: Array<{ sort: number; node: N }> = []
    for (const category of childrenOf.get(parentId) ?? []) {
      if (category.type !== type) continue
      const childLeaves = walk(category.id)
      const hasChildren = (childrenOf.get(category.id) ?? []).length > 0
      const node = makeNode(category, childLeaves, hasChildren)
      if (node !== null) produced.push({ sort: category.sort, node })
    }
    return produced.sort((left, right) => left.sort - right.sort).map((entry) => entry.node)
  }

  return walk(null)
}
