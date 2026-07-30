import type { MenuProps } from 'antd'

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
  color?: string | null
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
