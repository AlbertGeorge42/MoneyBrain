import React, { useEffect } from 'react'
import { Modal, Table, Switch, message, Tabs, Select, Tag } from 'antd'
import { useStore } from '../stores'
import { AccountCategory, Category, categoryApi } from '../services/api'
import DynamicIcon from '../components/DynamicIcon'

interface Props {
  visible: boolean
  onClose: () => void
}

const CashFlowConfigModal: React.FC<Props> = ({ visible, onClose }) => {
  const { accountCategories, categories, fetchAccountCategories, fetchCategories, updateAccountCategoryCashEquivalent } = useStore()

  useEffect(() => {
    if (visible) {
      fetchAccountCategories()
      fetchCategories()
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

  const handleCashFlowTypeChange = async (id: string, value: string) => {
    try {
      await categoryApi.update(id, { cashFlowType: value })
      fetchCategories()
      message.success('更新成功')
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
      render: (value: boolean, record: AccountCategory) => 
        !record.parentId ? (
          <Switch 
            checked={value} 
            onChange={(checked) => handleCashEquivalentChange(record.id, checked)}
            size="small"
          />
        ) : null,
    },
  ]

  const categoryColumns = [
    {
      title: '图标',
      dataIndex: 'icon',
      width: 50,
      render: (icon: string) => <DynamicIcon name={icon} size={16} fallback="file-text" />,
    },
    { title: '分类名称', dataIndex: 'name', key: 'name' },
    {
      title: '现金流活动类型',
      dataIndex: 'cashFlowType',
      width: 180,
      render: (value: string, record: Category) => (
        <Select
          value={value}
          onChange={(v) => handleCashFlowTypeChange(record.id, v)}
          size="small"
          style={{ width: '100%' }}
          placeholder="请选择"
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
            为收支分类配置现金流活动类型，用于现金流量表分类展示
          </p>
          <Tabs
            items={[
              {
                key: 'income',
                label: '收入分类',
                children: (
                  <Table
                    dataSource={categories.filter(c => c.type === 'income')}
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
                    dataSource={categories.filter(c => c.type === 'expense')}
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
      <Tabs items={tabItems} />
    </Modal>
  )
}

export default CashFlowConfigModal
