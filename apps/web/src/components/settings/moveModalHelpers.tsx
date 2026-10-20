import { useState } from 'react'
import type { MoveModalState, MoveTreeDataNode } from './treeTypes'

export const useMoveModal = <T extends { id: string; name: string }>() => {
  const [state, setState] = useState<MoveModalState<T>>({
    visible: false,
    item: null,
    targetId: undefined,
    loading: false,
  })

  const open = (item: T) => {
    setState({ visible: true, item, targetId: undefined, loading: false })
  }

  const close = () => {
    setState(prev => ({ ...prev, visible: false }))
  }

  const setTargetId = (targetId: string | null | undefined) => {
    setState(prev => ({ ...prev, targetId }))
  }

  const setLoading = (loading: boolean) => {
    setState(prev => ({ ...prev, loading }))
  }

  return { ...state, open, close, setTargetId, setLoading }
}

export const buildMoveTargetTreeForCategory = (
  categories: { id: string; name: string; parentId: string | null; type?: string }[],
  currentId: string,
  currentParentId?: string
): MoveTreeDataNode[] => {
  const topLevelCategories = categories.filter(c => c.id !== currentId && !c.parentId)

  return [
    { value: 'null', title: '作为一级分类', disabled: !currentParentId },
    ...topLevelCategories.map(cat => ({
      value: cat.id,
      title: cat.name,
      disabled: cat.id === currentParentId,
    }))
  ]
}

export const getCurrentPositionLabel = (
  parentId: string | undefined,
  parentMap: Map<string, { name: string }>
): string => {
  if (!parentId) return '一级分类'
  const parent = parentMap.get(parentId)
  return parent ? `${parent.name}（二级分类）` : '二级分类'
}
