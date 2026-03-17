import React, { useEffect, useState } from 'react'
import { Modal, Table, Switch, message, Tabs, Select, Tag, Spin } from 'antd'
import { useStore } from '../stores'
import { AccountCategory, Category, categoryApi } from '../services/api'
import DynamicIcon from '../components/DynamicIcon'

interface Props {
  visible: boolean
  onClose: () => void
}

const CashFlowConfigModal: React.FC<Props> = ({ visible, onClose }) => {
  const { accountCategories, categories, fetchAccountCategories, fetchCategories, updateAccountCategoryCashEquivalent } = useStore()
  
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (visible) {
      setLoading(true)
      Promise.all([fetchAccountCategories(), fetchCategories()]).finally(() => setLoading(false))
    }
  }, [visible])

  const handleCashEquivalentChange = async (id: string, checked: boolean) => {
    try {
      await updateAccountCategoryCashEquivalent(id, checked)
      message.success('更新成功')
    } catch (error) {
      message.error('更新失败')
    }
  }

  // 设置一级分类时，同时更新所有子分类
  const handleCashFlowTypeChange = async (parentId: string, value: 'operating' | 'investing' | 'financing' | null) => {
    try {
      // 获取该一级分类下的所有子分类
      const childCategories = categories.filter(c => c.parentId === parentId)
      
      // 更新一级分类和所有子分类
      const updatePromises = [
        categoryApi.update(parentId, { cashFlowType: value }),
        ...childCategories.map(child => 
          categoryApi.update(child.id, { cashFlowType: value })
        )
      ]
      
      await Promise.all(updatePromises)
      await fetchCategories()
      message.success(`已更新一级分类及其 ${childCategories.length} 个子分类`)
    } catch (error) {
      message.error('更新失败')
    }
  }

  const accountCategoryColumns = [
    {
      title: '图标',
      dataIndex: 'icon',
      width: 50,
      render: (icon: string) => <DynamicIcon name={icon} size={16} fallback="folder" />,
    },
    { title: '分类名称', dataIndex: 'name', key: 'name' },
    {
      title: '现金等价物',
      dataIndex: 'isCashEquivalent',
      width: 120,
      render: (value: boolean, record: AccountCategory) => (
        <Switch 
          checked={value} 
          onChange={(checked) => handleCashEquivalentChange(record.id, checked)}
          size="small"
        />
      ),
    },
  ]

  // 只显示一级分类，并显示子分类数量
  const categoryColumns = [
    {
      title: '图标',
      dataIndex: 'icon',
      width: 50,
      render: (icon: string) => <DynamicIcon name={icon} size={16} fallback="file-text" />,
    },
    { 
      title: '分类名称', 
      dataIndex: 'name', 
      key: 'name',
      render: (name: string, record: Category) => {
        const childCount = categories.filter(c => c.parentId === record.id).length
        return (
          <span>
            {name}
            {childCount > 0 && (
              <span style={{ color: '#999', fontSize: 12, marginLeft: 8 }}>
                ({childCount} 个子分类)
              </span>
            )}
          </span>
        )
      }
    },
    {
      title: '现金流活动类型',
      dataIndex: 'cashFlowType',
      width: 180,
      render: (value: string, record: Category) => (
        <Select
          value={value as 'operating' | 'investing' | 'financing' | null | undefined}
          onChange={(v: 'operating' | 'investing' | 'financing' | null) => handleCashFlowTypeChange(record.id, v)}
          size="small"
          style={{ width: '100%' }}
          placeholder="请选择"
          allowClear
        >
          <Select.Option value="operating">
            <Tag color="green">经营</Tag> 经营活动
          </Select.Option>
          <Select.Option value="investing">
            <Tag color="blue">投资</Tag> 投资活动
          </Select.Option>
          <Select.Option value="financing">
            <Tag color="orange">筹资</Tag> 筹资活动
          </Select.Option>
        </Select>
      ),
    },
  ]

  // 只获取一级分类
  const getParentCategories = (type: 'income' | 'expense') => {
    return categories.filter(c => c.type === type && !c.parentId)
  }

  const tabItems = [
    {
      key: 'cash-equivalent',
      label: '现金等价物配置',
      children: (
        <div>
          <p style={{ color: '#666', marginBottom: 12 }}>
            标记为现金等价物的账户分类将纳入现金流量表统计
          </p>
          <Table
            dataSource={accountCategories.filter(c => c.type === 'asset' && !c.parentId)}
            columns={accountCategoryColumns}
            rowKey="id"
            size="small"
            pagination={false}
          />
        </div>
      ),
    },
    {
      key: 'activity-type',
      label: '活动类型配置',
      children: (
        <div>
          <p style={{ color: '#666', marginBottom: 12 }}>
            为一级收支分类配置现金流活动类型，设置后自动应用到所有子分类
          </p>
          <Tabs
            items={[
              {
                key: 'income',
                label: '收入分类',
                children: (
                  <Table
                    dataSource={getParentCategories('income')}
                    columns={categoryColumns}
                    rowKey="id"
                    size="small"
                    pagination={false}
                  />
                ),
              },
              {
                key: 'expense',
                label: '支出分类',
                children: (
                  <Table
                    dataSource={getParentCategories('expense')}
                    columns={categoryColumns}
                    rowKey="id"
                    size="small"
                    pagination={false}
                  />
                ),
              },
            ]}
          />
        </div>
      ),
    },
  ]

  return (
    <Modal
      title="现金流量表设置"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={700}
    >
      <Spin spinning={loading}>
        <Tabs items={tabItems} />
      </Spin>
    </Modal>
  )
}

export default CashFlowConfigModal
