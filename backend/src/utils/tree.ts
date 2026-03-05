export interface TreeNode<T> extends Record<string, any> {
  id: string
  parentId: string | null
  children: TreeNode<T>[]
}

export const buildTree = <T extends { id: string; parentId: string | null }>(
  items: T[], 
  parentId: string | null = null
): TreeNode<T>[] => {
  return items
    .filter(item => item.parentId === parentId)
    .map(item => ({
      ...item,
      children: buildTree(items, item.id),
    }))
}
