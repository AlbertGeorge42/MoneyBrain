import React, { useMemo } from 'react'
import { Button, Select, TreeSelect, Tag, Collapse } from 'antd'
import { RangeTimePickerField, type RangeTimePickerConfig, type RangeTimeValue } from '../common'
import { Account, AccountCategory, TransactionCategory } from '../../services/api'
import {
  createQuarterRangePreset,
  createRangePeriodPreset,
  createTrailingRangePreset,
  createYearToDatePreset,
  formatRangeValue,
} from '../../utils/timePicker'
import {
  colorIncome,
  colorExpense,
  colorTransfer,
  colorWarning,
  colorInvestment,
  spaceSm,
  spaceMd,
} from '../../styles/tokens'

const transactionTimePickerConfig: RangeTimePickerConfig = {
  label: '筛选周期',
  allowedGranularities: ['day', 'month', 'year'],
  presets: {
    day: [
      createRangePeriodPreset('today', '今天', 'day'),
      createRangePeriodPreset('yesterday', '昨天', 'day', -1),
      createTrailingRangePreset('last-7-days', '近7天', 7, 'day'),
      createTrailingRangePreset('last-30-days', '近30天', 30, 'day'),
    ],
    month: [
      createRangePeriodPreset('current-month', '本月', 'month'),
      createRangePeriodPreset('previous-month', '上月', 'month', -1),
      createTrailingRangePreset('last-3-months', '近3个月', 3, 'month'),
      createQuarterRangePreset('current-quarter', '本季'),
    ],
    year: [
      createRangePeriodPreset('current-year', '今年', 'year'),
      createRangePeriodPreset('previous-year', '去年', 'year', -1),
      createTrailingRangePreset('last-3-years', '近3年', 3, 'year'),
      createYearToDatePreset('year-to-date', '今年至今'),
    ],
  },
}

const filterTreeNodeByName = (inputValue: string, node: any): boolean => {
  const name = node.name
  return typeof name === 'string' && name.toLowerCase().includes(inputValue.toLowerCase())
}

const resolveAccountLabel = (
  id: string,
  accounts: Account[],
  accountCategories: AccountCategory[]
): string | null => {
  if (id.startsWith('category_')) {
    const categoryId = id.replace('category_', '')
    const cat = accountCategories.find(c => c.id === categoryId)
    return cat?.name ?? null
  }
  const account = accounts.find(a => a.id === id)
  return account?.name ?? null
}

export interface TransactionFilterValues {
  type: string[]
  accountId: string[]
  categoryId: string[]
  dateRange: RangeTimeValue | null
}

interface TransactionFilterProps {
  accounts: Account[]
  categories: TransactionCategory[]
  accountCategories: AccountCategory[]
  filters: TransactionFilterValues
  filterExpanded: boolean
  onFilterChange: (filters: TransactionFilterValues) => void
  onFilterExpandedChange: (expanded: boolean) => void
  onSearch: () => void
  onReset: () => void
}

const TransactionFilterComponent: React.FC<TransactionFilterProps> = ({
  accounts,
  categories,
  accountCategories,
  filters,
  filterExpanded,
  onFilterChange,
  onFilterExpandedChange,
  onSearch,
  onReset,
}) => {
  // 构建账户树形数据（按账户分类分组，支持选择分类筛选所有下属账户）
  const accountTreeData = useMemo(() => {
    const buildAccountTree = () => {
      const topLevelCategories = accountCategories.filter(c => !c.parentId)
      
      return topLevelCategories.map(category => ({
        title: <Tag>{category.name}</Tag>,
        value: `category_${category.id}`,
        key: `category_${category.id}`,
        name: category.name,
        children: accounts
          .filter(a => a.categoryId === category.id)
          .map(account => ({
            title: <Tag>{account.name}</Tag>,
            value: account.id,
            key: account.id,
            name: account.name,
          })),
      }))
    }
    
    const uncategorizedAccounts = accounts.filter(a => !a.categoryId)
    const tree = buildAccountTree()
    
    if (uncategorizedAccounts.length > 0) {
      tree.push({
        title: <Tag>未分类账户</Tag>,
        value: 'uncategorized',
        key: 'uncategorized',
        name: '未分类账户',
        children: uncategorizedAccounts.map(account => ({
          title: <Tag>{account.name}</Tag>,
          value: account.id,
          key: account.id,
          name: account.name,
        })),
      })
    }
    
    return tree
  }, [accounts, accountCategories])

  // 构建分类树形数据（按收入/支出/转账分组，支持多级，可选择父分类筛选所有子分类）
  const categoryTreeData = useMemo(() => {
    const buildCategoryTree = (parentId: string | null, type: string): any[] => {
      const children = categories.filter(c => c.parentId === parentId && c.type === type)
      return children.map(category => ({
        title: <Tag>{category.name}</Tag>,
        value: category.id,
        key: category.id,
        name: category.name,
        children: buildCategoryTree(category.id, type),
      }))
    }

    return [
      {
        title: <Tag style={{ color: colorExpense, borderColor: colorExpense, backgroundColor: 'transparent' }}>支出</Tag>,
        value: 'expense_group',
        key: 'expense_group',
        selectable: false,
        name: '支出',
        children: buildCategoryTree(null, 'expense'),
      },
      {
        title: <Tag style={{ color: colorIncome, borderColor: colorIncome, backgroundColor: 'transparent' }}>收入</Tag>,
        value: 'income_group',
        key: 'income_group',
        selectable: false,
        name: '收入',
        children: buildCategoryTree(null, 'income'),
      },
      {
        title: <Tag style={{ color: colorTransfer, borderColor: colorTransfer, backgroundColor: 'transparent' }}>转账</Tag>,
        value: 'transfer_group',
        key: 'transfer_group',
        selectable: false,
        name: '转账',
        children: buildCategoryTree(null, 'transfer'),
      },
    ]
  }, [categories])

  const TRANSACTION_TYPE_CONFIG = {
income: { color: colorIncome, text: '收入' },
  expense: { color: colorExpense, text: '支出' },
  transfer: { color: colorTransfer, text: '转账' },
    refund: { color: colorWarning, text: '退款' },
    adjustment: { color: colorInvestment, text: '平账' },
  } as const

  // 移除单个筛选条件
  const removeFilter = (key: keyof TransactionFilterValues, value?: string) => {
    if (key === 'dateRange') {
      onFilterChange({ ...filters, [key]: null })
    } else if (value) {
      onFilterChange({ 
        ...filters, 
        [key]: filters[key].filter((v: string) => v !== value) 
      })
    } else {
      onFilterChange({ ...filters, [key]: [] })
    }
  }

  const hasActiveFilters = filters.type.length > 0 || filters.accountId.length > 0 || filters.categoryId.length > 0 || filters.dateRange !== null

  // 渲染已选筛选条件标签
  const renderFilterTags = () => (
    <>
      {filters.type.map(t => {
        const config = TRANSACTION_TYPE_CONFIG[t as keyof typeof TRANSACTION_TYPE_CONFIG]
        return (
          <Tag 
            key={t} 
            closable 
            onClose={() => removeFilter('type', t)}
            style={{ color: config?.color, borderColor: config?.color, backgroundColor: 'transparent' }}
          >
            {config?.text || t}
          </Tag>
        )
      })}
      {filters.accountId.map(id => {
        const label = resolveAccountLabel(id, accounts, accountCategories)
        return label ? (
          <Tag key={id} closable onClose={() => removeFilter('accountId', id)}>
            {label}
          </Tag>
        ) : null
      })}
      {filters.categoryId.map(id => {
        const category = categories.find(c => c.id === id)
        return category ? (
          <Tag key={id} closable onClose={() => removeFilter('categoryId', id)}>
            {category.name}
          </Tag>
        ) : null
      })}
      {filters.dateRange && (
        <Tag closable onClose={() => removeFilter('dateRange')}>
          {formatRangeValue(filters.dateRange)}
        </Tag>
      )}
    </>
  )

  return (
    <>
      <Collapse
        activeKey={filterExpanded ? ['1'] : []}
        onChange={(keys) => onFilterExpandedChange(keys.length > 0)}
        items={[
          {
            key: '1',
            label: (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <span>筛选条件</span>
                {hasActiveFilters && (
                  <div className="filter-tags-inline">
                    {renderFilterTags()}
                  </div>
                )}
              </div>
            ),
            children: (
              <>
                <div className="filter-grid">
                  <div>
                    <div style={{ marginBottom: spaceSm }}>类型</div>
                    <Select
                      mode="multiple"
                      placeholder="选择类型"
                      allowClear
                      style={{ width: '100%' }}
                      value={filters.type}
                      onChange={type => onFilterChange({ ...filters, type })}
                      tagRender={(props) => {
                        const { value, closable, onClose } = props
                        const config = TRANSACTION_TYPE_CONFIG[value as keyof typeof TRANSACTION_TYPE_CONFIG]
                        return (
                          <Tag closable={closable} onClose={onClose} style={{ color: config?.color, borderColor: config?.color, backgroundColor: 'transparent' }}>
                            {config?.text || value}
                          </Tag>
                        )
                      }}
                    >
                      {Object.entries(TRANSACTION_TYPE_CONFIG).map(([value, { color, text }]) => (
                        <Select.Option key={value} value={value}>
                          <Tag style={{ color, borderColor: color, backgroundColor: 'transparent' }}>{text}</Tag>
                        </Select.Option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <div style={{ marginBottom: spaceSm }}>账户</div>
                    <TreeSelect
                      treeData={accountTreeData}
                      placeholder="选择账户"
                      allowClear
                      multiple
                      showSearch
                      treeDefaultExpandAll
                      style={{ width: '100%' }}
                      value={filters.accountId}
                      onChange={accountId => onFilterChange({ ...filters, accountId })}
                      tagRender={(props) => {
                        const { value, closable, onClose } = props
                        const label = resolveAccountLabel(String(value), accounts, accountCategories)
                        return (
                          <Tag closable={closable} onClose={onClose}>
                            {label || String(value)}
                          </Tag>
                        )
                      }}
                      filterTreeNode={filterTreeNodeByName}
                    />
                  </div>
                  <div>
                    <div style={{ marginBottom: spaceSm }}>分类</div>
                    <TreeSelect
                      treeData={categoryTreeData}
                      placeholder="选择分类"
                      allowClear
                      multiple
                      showSearch
                      treeDefaultExpandAll
                      style={{ width: '100%' }}
                      value={filters.categoryId}
                      onChange={categoryId => onFilterChange({ ...filters, categoryId })}
                      tagRender={(props) => {
                        const { value, closable, onClose } = props
                        const category = categories.find(c => c.id === String(value))
                        return (
                          <Tag closable={closable} onClose={onClose}>
                            {category?.name || String(value)}
                          </Tag>
                        )
                      }}
                      filterTreeNode={filterTreeNodeByName}
                    />
                  </div>
                  <div>
                    <div style={{ marginBottom: spaceSm }}>日期范围</div>
                    <RangeTimePickerField
                      value={filters.dateRange}
                      config={transactionTimePickerConfig}
                      placeholder="选择时间"
                      style={{ width: '100%' }}
                      onChange={(dateRange) => onFilterChange({ ...filters, dateRange })}
                    />
                  </div>
                </div>
                <div style={{ marginTop: spaceMd, textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <Button onClick={onReset}>重置</Button>
                  <Button type="primary" onClick={onSearch}>查询</Button>
                </div>
              </>
            ),
          },
        ]}
      />
    </>
  )
}

export default TransactionFilterComponent
