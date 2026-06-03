import { useState, useCallback } from 'react'
import { RightOutlined, DownOutlined, EditOutlined, DeleteOutlined, ExportOutlined, FolderAddOutlined, WalletOutlined, HolderOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { theme } from 'antd'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

export interface MoveTreeDataNode {
  value: string
  title: string
  disabled?: boolean
  children?: MoveTreeDataNode[]
}

export interface TreeNodeWithKey {
  key: string
  children?: TreeNodeWithKey[]
}

export interface BaseTreeNode {
  id: string
  key: string
  name: string
  icon: string | null
  children?: BaseTreeNode[]
  depth: number
}

export interface AccountTreeNode extends BaseTreeNode {
  type: 'category' | 'account'
  nodeType?: 'asset' | 'liability'
  parentId?: string
  sort?: number
  initialBalance?: number
  initialBalanceDate?: string | null
}

export interface TransactionTreeNode extends BaseTreeNode {
  type: 'category'
  categoryType: 'income' | 'expense' | 'transfer'
  parentId?: string
  sort: number
}

export interface CashTreeNode extends BaseTreeNode {
  isGroup: boolean
  groupKey?: string
}

export interface ActivityTreeNode extends BaseTreeNode {
  isGroup: boolean
  groupKey?: string
  cashFlowType?: string | null
  childCount?: number
}

export interface MoveModalState<T> {
  visible: boolean
  item: T | null
  targetId: string | null | undefined
  loading: boolean
}

export interface SettingMenuOptions {
  onAddSub?: () => void
  onAddAccount?: () => void
  onEdit: () => void
  onMove?: () => void
  onDelete: () => void
  hasChildren?: boolean
  canMove?: boolean
  isAccount?: boolean
}

export type { MenuProps }

// eslint-disable-next-line react-refresh/only-export-components
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

// eslint-disable-next-line react-refresh/only-export-components
export const useSortableTable = () => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([])

  const toggleExpand = (recordKey: string) => {
    setExpandedRowKeys(prev =>
      prev.includes(recordKey) ? prev.filter(k => k !== recordKey) : [...prev, recordKey]
    )
  }

  const getVisibleSortableKeys = useCallback((nodes: TreeNodeWithKey[]): string[] => {
    const keys: string[] = []
    const traverse = (items: TreeNodeWithKey[]) => {
      items.forEach(item => {
        keys.push(item.key)
        if (item.children && expandedRowKeys.includes(item.key)) {
          traverse(item.children)
        }
      })
    }
    traverse(nodes)
    return keys
  }, [expandedRowKeys])

  return { sensors, expandedRowKeys, setExpandedRowKeys, toggleExpand, getVisibleSortableKeys }
}

interface SortableRowProps {
  isSortable?: (id: string) => boolean
  [key: string]: unknown
}

const defaultIsSortable = (id: string) => id?.startsWith('category-')

export const SortableRow = ({ isSortable = defaultIsSortable, ...props }: SortableRowProps) => {
  const { token } = theme.useToken()
  const id = props['data-row-key']
  const sortable = isSortable(id)

  const { attributes, setNodeRef, transform, transition, isDragging } = useSortable({
    id: id,
    disabled: !sortable,
  })

  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Translate.toString(transform),
    transition,
    ...(isDragging ? { opacity: 0.5, background: token.controlItemBgHover || token.colorBgTextHover } : {}),
  }

  return <tr {...props} ref={setNodeRef} style={style} {...attributes} />
}

export const DragHandle = ({ id }: { id: string }) => {
  const { token } = theme.useToken()
  const { listeners, setNodeRef } = useSortable({ id })
  return (
    <div ref={setNodeRef} {...listeners} style={{ cursor: 'grab', display: 'inline-flex' }}>
      <HolderOutlined style={{ color: token.colorTextSecondary }} />
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const renderExpandIcon = (
  record: { key: string; children?: unknown[] },
  expandedRowKeys: string[],
  onToggle: (key: string) => void,
  colorSecondary?: string,
  fontSizeSm?: string
) => {
  const cs = colorSecondary ?? 'var(--mb-color-text-secondary)'
  const fs = fontSizeSm ?? 'var(--mb-font-size-caption)'
  if (record.children && record.children.length > 0) {
    const isExpanded = expandedRowKeys.includes(record.key)
    return (
      <span
        onClick={() => onToggle(record.key)}
        style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
      >
        {isExpanded ? <DownOutlined style={{ fontSize: fs, color: cs }} /> : <RightOutlined style={{ fontSize: fs, color: cs }} />}
      </span>
    )
  }
  return <span style={{ display: 'inline-block', width: 14 }} />
}

// eslint-disable-next-line react-refresh/only-export-components
export const renderDragHandle = (record: { key: string }, isSortable: (id: string) => boolean) => {
  if (isSortable(record.key)) {
    return <DragHandle id={record.key} />
  }
  return null
}

// eslint-disable-next-line react-refresh/only-export-components
export const createSettingMenuItems = (options: SettingMenuOptions): MenuProps['items'] => {
  const { onAddSub, onAddAccount, onEdit, onMove, onDelete, hasChildren, canMove = true, isAccount = false } = options
  
  const items: MenuProps['items'] = []
  
  if (!isAccount && onAddSub) {
    items.push({ key: 'add-subcategory', label: '添加子分类', icon: <FolderAddOutlined />, onClick: onAddSub })
  }
  
  if (!isAccount && onAddAccount) {
    items.push({ key: 'add-account', label: '添加账户', icon: <WalletOutlined />, onClick: onAddAccount })
  }
  
  if (items.length > 0) {
    items.push({ type: 'divider' as const })
  }
  
  items.push({ key: 'edit', label: '编辑', icon: <EditOutlined />, onClick: onEdit })
  
  if (onMove) {
    if (hasChildren) {
      items.push({ key: 'move', label: '移动到...', icon: <ExportOutlined />, disabled: true, title: '该分类下存在子项，无法移动' })
    } else if (canMove) {
      items.push({ key: 'move', label: '移动到...', icon: <ExportOutlined />, onClick: onMove })
    }
  }
  
  items.push({ type: 'divider' as const })
  
  if (hasChildren) {
    items.push({ key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true, disabled: true, title: '该分类下存在子项，无法删除' })
  } else {
    items.push({ key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true, onClick: onDelete })
  }
  
  return items
}

// eslint-disable-next-line react-refresh/only-export-components
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

// eslint-disable-next-line react-refresh/only-export-components
export const getCurrentPositionLabel = (
  parentId: string | undefined,
  parentMap: Map<string, { name: string }>
): string => {
  if (!parentId) return '一级分类'
  const parent = parentMap.get(parentId)
  return parent ? `${parent.name}（二级分类）` : '二级分类'
}
