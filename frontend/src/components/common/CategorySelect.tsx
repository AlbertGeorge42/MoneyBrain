import React, { useMemo } from 'react'
import { TreeSelect } from 'antd'
import type { TreeSelectProps } from 'antd'
import type { TransactionCategory } from '../../services/api'
import { buildSortedTree } from '@shared/utils/tree'

interface TreeNode {
  title: React.ReactNode
  value: string
  key: string
  selectable?: boolean
  children?: TreeNode[]
}

interface CategorySelectProps {
  categories: TransactionCategory[]
  /**
   * 按交易类型过滤（income / expense / transfer）
   * 指定 type 时只显示该类型的分类树（表单填写模式），不指定时显示全部
   */
  type?: string
  /** 是否按支出/收入/转账分组显示（筛选器模式），优先级低于 type */
  grouped?: boolean
  /** 选择模式: 'leaf' 只允许选择叶子节点（子分类），'all' 允许选择所有节点 */
  selectableMode?: 'leaf' | 'all'
  /** 是否多选 */
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

const CategorySelect: React.FC<CategorySelectProps> = ({
  categories,
  type,
  grouped = false,
  selectableMode = 'leaf',
  multiple = false,
  value,
  onChange,
  placeholder = '请选择分类',
  allowClear,
  disabled,
  style,
  dropdownMinWidth = 280,
  tagRender,
}) => {
  const treeData = useMemo((): TreeNode[] => {
    const toNode = (
      item: TransactionCategory & { children?: (TransactionCategory & { children?: unknown[] })[] }
    ): TreeNode => {
      const hasChildren = !!(item.children?.length)
      return {
        title: item.name,
        value: item.id,
        key: item.id,
        selectable: selectableMode === 'all' || !hasChildren,
        children: hasChildren ? item.children!.map(c => toNode(c as TransactionCategory & { children?: unknown[] })) : undefined,
      }
    }

    let rawNodes: TreeNode[]

    // 模式1: 按类型过滤（表单单项选择）
    if (type) {
      const filtered = categories.filter(c => c.type === type)
      rawNodes = buildSortedTree(filtered).map(toNode)
    }
    // 模式2: 按支出/收入/转账分组（筛选器多选）
    else if (grouped) {
      const groups = [
        { key: 'expense_group', title: '支出', type: 'expense' },
        { key: 'income_group', title: '收入', type: 'income' },
        { key: 'transfer_group', title: '转账', type: 'transfer' },
      ]
      rawNodes = groups
        .map(group => {
          const children = buildSortedTree(categories.filter(c => c.type === group.type))
          if (children.length === 0) return null
          return {
            title: group.title,
            value: group.key,
            key: group.key,
            selectable: false,
            children: children.map(toNode),
          }
        })
        .filter(Boolean) as TreeNode[]
    }
    // 模式3: 全部分类（无分组）
    else {
      rawNodes = buildSortedTree(categories).map(toNode)
    }

    return rawNodes
  }, [categories, type, grouped, selectableMode])

  return (
    <TreeSelect
      style={{ width: '100%', ...style }}
      value={value}
      onChange={onChange}
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

export default CategorySelect
