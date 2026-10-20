import React, { useMemo } from 'react'
import { TreeSelect } from 'antd'
import type { TreeSelectProps } from 'antd'
import type { Account, AccountCategory } from '../../services/api'
import { buildAccountTreeData, type AccountTreeDataNode } from '../../utils/accountTree'

interface AccountSelectProps {
  accounts: Account[]
  accountCategories: AccountCategory[]
  /** 选择模式: 'leaf' 只允许选择叶子节点（账户），'all' 允许选择所有节点（含分类和资产/负债根） */
  selectableMode?: 'leaf' | 'all'
  /** 是否多选（筛选器模式使用） */
  multiple?: boolean
  value?: string | string[]
  onChange?: (value: string | string[]) => void
  placeholder?: string
  allowClear?: boolean
  disabled?: boolean
  style?: React.CSSProperties
  /** 弹出下拉面板的最小宽度，默认 280 */
  dropdownMinWidth?: number
  /** 自定义多选标签渲染（筛选器模式使用） */
  tagRender?: TreeSelectProps['tagRender']
}

const AccountSelect: React.FC<AccountSelectProps> = ({
  accounts,
  accountCategories,
  selectableMode = 'all',
  multiple = false,
  value,
  onChange,
  placeholder = '请选择账户',
  allowClear,
  disabled,
  style,
  dropdownMinWidth = 280,
  tagRender,
}) => {
  const treeData = useMemo(() => {
    const data = buildAccountTreeData(accounts, accountCategories)
    if (selectableMode === 'leaf') {
      const markLeafOnly = (nodes: AccountTreeDataNode[]): AccountTreeDataNode[] =>
        nodes.map(node => {
          if (node.children?.length) {
            return {
              ...node,
              selectable: false,
              children: markLeafOnly(node.children),
            }
          }
          return node
        })
      return markLeafOnly(data)
    }
    return data
  }, [accounts, accountCategories, selectableMode])

  const handleChange = (newValue: unknown) => {
    onChange?.(newValue as string | string[])
  }

  return (
    <TreeSelect
      style={{ width: '100%', ...style }}
      value={value}
      onChange={handleChange}
      treeData={treeData}
      placeholder={placeholder}
      allowClear={allowClear}
      disabled={disabled}
      multiple={multiple}
      showSearch
      treeNodeFilterProp="title"
      popupMatchSelectWidth={false}
      dropdownStyle={{ minWidth: dropdownMinWidth }}
      tagRender={tagRender}
    />
  )
}

export default AccountSelect
