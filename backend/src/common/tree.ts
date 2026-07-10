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
