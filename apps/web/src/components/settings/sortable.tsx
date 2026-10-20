import { useCallback, useState } from 'react'
import {
  DownOutlined,
  EditOutlined,
  DeleteOutlined,
  ExportOutlined,
  FolderAddOutlined,
  HolderOutlined,
  RightOutlined,
  SettingOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { Button, Dropdown, theme } from 'antd'
import { useSortable, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { UniqueIdentifier } from '@dnd-kit/core'
import { KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { SettingMenuOptions, TreeNodeWithKey } from './treeTypes'

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
  const id = props['data-row-key'] as string
  const sortable = isSortable(id)

  const { attributes, setNodeRef, transform, transition, isDragging } = useSortable({
    id: id as UniqueIdentifier,
    disabled: !sortable,
  })

  const style: React.CSSProperties = {
    ...(props.style as React.CSSProperties),
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

interface SettingDropdownProps {
  items: MenuProps['items']
}

/** 统一的表格行操作设置按钮 */
export const SettingDropdown: React.FC<SettingDropdownProps> = ({ items }) => (
  <Dropdown menu={{ items }} trigger={['click']}>
    <Button type="text" size="small" icon={<SettingOutlined />} />
  </Dropdown>
)
