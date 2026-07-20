// ===== 统一的树形结构工具 =====
// 所有 tree 构建逻辑的唯一实现，backend 和 frontend 共用

export interface TreeNode {
  id: string
  parentId: string | null
  children?: TreeNode[]
  [key: string]: unknown
}

/**
 * 将扁平的 parentId 关联数组构建为 parent→children 映射
 */
export function buildChildrenMap<T extends { id: string; parentId: string | null }>(
  items: T[]
): Map<string | null, T[]> {
  const childrenMap = new Map<string | null, T[]>()
  for (const item of items) {
    const key = item.parentId ?? null
    if (!childrenMap.has(key)) childrenMap.set(key, [])
    childrenMap.get(key)!.push(item)
  }
  return childrenMap
}

/**
 * 从 childrenMap 中收集某个父节点的所有后代 ID（含自身）
 */
export function collectDescendantIds(
  parentId: string,
  childrenMap: Map<string | null, { id: string }[]>
): string[] {
  const ids = [parentId]
  const queue = [parentId]
  while (queue.length > 0) {
    const current = queue.shift()!
    const children = childrenMap.get(current) || []
    for (const child of children) {
      ids.push(child.id)
      queue.push(child.id)
    }
  }
  return ids
}

/**
 * 将扁平的 parentId 关联数组构建为树形结构
 * 使用 Map 索引，时间复杂度 O(n)
 */
export const buildTree = <T extends { id: string; parentId: string | null }>(
  items: T[],
  parentId: string | null = null
): (T & { children: (T & { children: unknown[] })[] })[] => {
  const childrenMap = buildChildrenMap(items)

  function buildSubtree(pid: string | null): (T & { children: unknown[] })[] {
    const children = childrenMap.get(pid) || []
    return children.map(item => ({
      ...item,
      children: buildSubtree(item.id),
    }))
  }

  return buildSubtree(parentId) as (T & { children: (T & { children: unknown[] })[] })[]
}

/**
 * 构建排序后的树形结构（前端用，按 sort 字段排序）
 */
export function buildSortedTree<T extends { id: string; parentId: string | null; sort?: number }>(
  items: T[],
  parentId: string | null = null
): (T & { children: (T & { children: any[] })[] })[] {
  const childrenMap = buildChildrenMap(items)

  // 对每组子节点按 sort 排序
  for (const [, children] of childrenMap) {
    children.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
  }

  function buildSubtree(pid: string | null): (T & { children: any[] })[] {
    const children = childrenMap.get(pid) || []
    return children.map(item => ({
      ...item,
      children: buildSubtree(item.id),
    }))
  }

  return buildSubtree(parentId)
}
