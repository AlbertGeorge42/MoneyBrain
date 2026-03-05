export interface TreeNode {
  id: string
  name: string
  icon?: string | null
  parentId?: string | null
  children?: TreeNode[]
}

export const buildTreeData = <T extends TreeNode>(
  items: T[], 
  parentId: string | null = null
): (T & { children?: TreeNode[] })[] => {
  return items
    .filter(item => item.parentId === parentId)
    .map(item => ({
      ...item,
      children: buildTreeData(items, item.id),
    }))
}
