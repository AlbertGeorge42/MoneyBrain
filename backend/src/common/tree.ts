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
export const buildTree = <T extends { id: string; parentId: string | null }>(
  items: T[],
  parentId: string | null = null
): (T & { children: (T & { children: unknown[] })[] })[] => {
  const childrenMap = new Map<string | null, T[]>()

  for (const item of items) {
    const key = item.parentId ?? null
    if (!childrenMap.has(key)) {
      childrenMap.set(key, [])
    }
    childrenMap.get(key)!.push(item)
  }

  function buildSubtree(pid: string | null): (T & { children: unknown[] })[] {
    const children = childrenMap.get(pid) || []
    return children.map(item => ({
      ...item,
      children: buildSubtree(item.id),
    }))
  }

  return buildSubtree(parentId)
}
