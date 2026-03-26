import React, { useMemo } from 'react'
import { Button, Select, TreeSelect, Space, Tag, Collapse, Row, Col, DatePicker } from 'antd'
import { FilterOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { Account, AccountCategory, Category } from '../../services/api'
import DynamicIcon from '../DynamicIcon'

const { RangePicker } = DatePicker
const { Panel } = Collapse

const typeLabels: Record<string, string> = {
  income: '收入',
  expense: '支出',
  transfer: '转账',
  refund: '退款',
}

export interface TransactionFilterValues {
  type: string[]
  accountId: string[]
  categoryId: string[]
  dateRange: [dayjs.Dayjs, dayjs.Dayjs] | null
}

interface TransactionFilterProps {
  accounts: Account[]
  categories: Category[]
  accountCategories: AccountCategory[]
  filters: TransactionFilterValues
  filterExpanded: boolean
  onFilterChange: (filters: TransactionFilterValues) => void
  onFilterExpandedChange: (expanded: boolean) => void
  onSearch: () => void
  onReset: () => void
}

const TransactionFilter: React.FC<TransactionFilterProps> = ({
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
        title: (
          <Tag color={category.color || 'default'}>
            <DynamicIcon name={category.icon} size={14} /> {category.name}
          </Tag>
        ),
        value: `category_${category.id}`,
        key: `category_${category.id}`,
        children: accounts
          .filter(a => a.categoryId === category.id)
          .map(account => ({
            title: (
              <Tag color={account.color || 'default'}>
                <DynamicIcon name={account.icon} size={14} /> {account.name}
              </Tag>
            ),
            value: account.id,
            key: account.id,
          })),
      }))
    }
    
    const uncategorizedAccounts = accounts.filter(a => !a.categoryId)
    const tree = buildAccountTree()
    
    if (uncategorizedAccounts.length > 0) {
      tree.push({
        title: <Tag color="default">未分类账户</Tag>,
        value: 'uncategorized',
        key: 'uncategorized',
        children: uncategorizedAccounts.map(account => ({
          title: (
            <Tag color={account.color || 'default'}>
              <DynamicIcon name={account.icon} size={14} /> {account.name}
            </Tag>
          ),
          value: account.id,
          key: account.id,
        })),
      })
    }
    
    return tree
  }, [accounts, accountCategories])

  // 构建分类树形数据（按收入/支出分组，支持多级，可选择父分类筛选所有子分类）
  const categoryTreeData = useMemo(() => {
    const buildCategoryTree = (parentId: string | null, type: string): any[] => {
      const children = categories.filter(c => c.parentId === parentId && c.type === type)
      return children.map(category => ({
        title: (
          <Tag color={category.color || 'default'}>
            <DynamicIcon name={category.icon} size={14} /> {category.name}
          </Tag>
        ),
        value: category.id,
        key: category.id,
        children: buildCategoryTree(category.id, type),
      }))
    }

    return [
      {
        title: <Tag color="red"><span style={{ fontWeight: 'bold' }}>支出分类</span></Tag>,
        value: 'expense_group',
        key: 'expense_group',
        selectable: false,
        children: buildCategoryTree(null, 'expense'),
      },
      {
        title: <Tag color="green"><span style={{ fontWeight: 'bold' }}>收入分类</span></Tag>,
        value: 'income_group',
        key: 'income_group',
        selectable: false,
        children: buildCategoryTree(null, 'income'),
      },
    ]
  }, [categories])

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
    <Space wrap>
      {filters.type.map(t => (
        <Tag 
          key={t} 
          closable 
          onClose={() => removeFilter('type', t)}
          color={t === 'income' ? 'green' : t === 'expense' ? 'red' : t === 'transfer' ? 'blue' : 'orange'}
        >
          {typeLabels[t]}
        </Tag>
      ))}
      {filters.accountId.map(id => {
        // 处理账户分类选择
        if (id.startsWith('category_')) {
          const categoryId = id.replace('category_', '')
          const accountCategory = accountCategories.find(c => c.id === categoryId)
          return accountCategory ? (
            <Tag key={id} closable onClose={() => removeFilter('accountId', id)} color={accountCategory.color || 'blue'}>
              <DynamicIcon name={accountCategory.icon} size={14} /> {accountCategory.name} (全部分类)
            </Tag>
          ) : null
        }
        // 处理单个账户选择
        const account = accounts.find(a => a.id === id)
        return account ? (
          <Tag key={id} closable onClose={() => removeFilter('accountId', id)} color={account.color || 'default'}>
            <DynamicIcon name={account.icon} size={14} /> {account.name}
          </Tag>
        ) : null
      })}
      {filters.categoryId.map(id => {
        const category = categories.find(c => c.id === id)
        // 检查是否有子分类，如果有则显示为父分类
        const hasChildren = categories.some(c => c.parentId === id)
        return category ? (
          <Tag key={id} closable onClose={() => removeFilter('categoryId', id)} color={category.color || (hasChildren ? 'purple' : 'default')}>
            <DynamicIcon name={category.icon} size={14} /> {category.name}{hasChildren ? ' (含子分类)' : ''}
          </Tag>
        ) : null
      })}
      {filters.dateRange && (
        <Tag closable onClose={() => removeFilter('dateRange')}>
          {filters.dateRange[0].format('YYYY-MM-DD')} ~ {filters.dateRange[1].format('YYYY-MM-DD')}
        </Tag>
      )}
    </Space>
  )

  return (
    <>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space wrap>
          <Button 
            icon={<FilterOutlined />} 
            onClick={() => onFilterExpandedChange(!filterExpanded)}
          >
            筛选 {filterExpanded ? '收起' : '展开'}
          </Button>
          {hasActiveFilters && (
            <Button onClick={onReset}>重置</Button>
          )}
        </Space>
        {renderFilterTags()}
      </Space>

      <Collapse 
        activeKey={filterExpanded ? 'filter' : undefined} 
        onChange={(keys) => onFilterExpandedChange(keys.includes('filter'))}
        style={{ marginTop: 16 }}
      >
        <Panel header="筛选条件" key="filter">
          <Row gutter={16}>
            <Col span={6}>
              <div style={{ marginBottom: 8 }}>类型</div>
              <Select
                mode="multiple"
                placeholder="选择类型"
                allowClear
                style={{ width: '100%' }}
                value={filters.type}
                onChange={type => onFilterChange({ ...filters, type })}
              >
                <Select.Option value="income">
                  <Tag color="green">收入</Tag>
                </Select.Option>
                <Select.Option value="expense">
                  <Tag color="red">支出</Tag>
                </Select.Option>
                <Select.Option value="transfer">
                  <Tag color="blue">转账</Tag>
                </Select.Option>
                <Select.Option value="refund">
                  <Tag color="orange">退款</Tag>
                </Select.Option>
              </Select>
            </Col>
            <Col span={6}>
              <div style={{ marginBottom: 8 }}>账户</div>
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
                filterTreeNode={(node: any, searchValue) => {
                  const title = node.title
                  if (typeof title === 'string') {
                    return title.toLowerCase().includes(searchValue.toLowerCase())
                  }
                  return false
                }}
              />
            </Col>
            <Col span={6}>
              <div style={{ marginBottom: 8 }}>分类</div>
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
                filterTreeNode={(node: any, searchValue) => {
                  const title = node.title
                  if (typeof title === 'string') {
                    return title.toLowerCase().includes(searchValue.toLowerCase())
                  }
                  return false
                }}
              />
            </Col>
            <Col span={6}>
              <div style={{ marginBottom: 8 }}>日期范围</div>
              <RangePicker
                style={{ width: '100%' }}
                value={filters.dateRange}
                onChange={dates => onFilterChange({ ...filters, dateRange: dates as [dayjs.Dayjs, dayjs.Dayjs] | null })}
              />
            </Col>
          </Row>
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Space>
              <Button onClick={onReset}>重置</Button>
              <Button type="primary" onClick={onSearch}>查询</Button>
            </Space>
          </div>
        </Panel>
      </Collapse>
    </>
  )
}

export default TransactionFilter
