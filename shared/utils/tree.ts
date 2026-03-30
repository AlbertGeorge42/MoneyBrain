export interface TreeNode {
  id: string
  parentId: string | null
  children?: TreeNode[]
  [key: string]: unknown
}

/**
 * 将扁平的 parentId 关联数组构建为树形结构
 * 使用 Map 索引，时间复杂度 O(n)
 */
export function buildTree<T extends { id: string; parentId: string | null }>(
  items: T[],
  parentId: string | null = null
): (T & { children: (T & { children: any[] })[] })[] {
  const childrenMap = new Map<string | null, T[]>()

  for (const item of items) {
    const key = item.parentId ?? null
    if (!childrenMap.has(key)) {
      childrenMap.set(key, [])
    }
    childrenMap.get(key)!.push(item)
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

/**
 * 构建排序后的树形结构（前端用，按 sort 字段排序）
 */
export function buildSortedTree<T extends { id: string; parentId: string | null; sort?: number }>(
  items: T[],
  parentId: string | null = null
): (T & { children: (T & { children: any[] })[] })[] {
  const childrenMap = new Map<string | null, T[]>()

  for (const item of items) {
    const key = item.parentId ?? null
    if (!childrenMap.has(key)) {
      childrenMap.set(key, [])
    }
    childrenMap.get(key)!.push(item)
  }

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
