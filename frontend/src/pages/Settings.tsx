import React, { useEffect, useState } from 'react'
import { Card, Button, message, Tabs, Modal, Form, Input, Table, Space, Popconfirm, TreeSelect } from 'antd'
import { DownloadOutlined, UploadOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useStore } from '../stores'
import { Category, categoryApi, accountApi, transactionApi, budgetApi } from '../services/api'

const Settings: React.FC = () => {
  const { 
    accountCategories, 
    categories, 
    fetchAccountCategories, 
    fetchCategories,
  } = useStore()

  const [categoryModalVisible, setCategoryModalVisible] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [categoryForm] = Form.useForm()
  const [categoryType, setCategoryType] = useState<'income' | 'expense'>('income')

  useEffect(() => {
    fetchAccountCategories()
    fetchCategories()
  }, [])

  const handleExportData = async () => {
    try {
      const [accountsRes, transactionsRes, budgetsRes] = await Promise.all([
        accountApi.getAll(),
        transactionApi.getAll(),
        budgetApi.getAll(),
      ])

      const exportData = {
        exportDate: new Date().toISOString(),
        accounts: accountsRes.data.data || [],
        transactions: transactionsRes.data.data?.list || [],
        budgets: budgetsRes.data.data || [],
        categories: categories,
        accountCategories: accountCategories,
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `moneybrain-backup-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      message.success('数据导出成功')
    } catch (error) {
      message.error('数据导出失败')
    }
  }

  const buildTreeData = (cats: Category[], parentId: string | null = null): any[] => {
    return cats
      .filter(c => c.parentId === parentId)
      .map(c => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        parentId: c.parentId,
        children: buildTreeData(cats, c.id),
      }))
  }

  const getTypeCategories = (type: string) => {
    const filtered = categories.filter(c => c.type === type)
    return buildTreeData(filtered)
  }

  const handleAddCategory = (type: 'income' | 'expense') => {
    setCategoryType(type)
    setEditingCategory(null)
    categoryForm.resetFields()
    setCategoryModalVisible(true)
  }

  const handleEditCategory = (record: Category) => {
    setEditingCategory(record)
    setCategoryType(record.type as 'income' | 'expense')
    categoryForm.setFieldsValue({
      name: record.name,
      icon: record.icon,
      parentId: record.parentId,
    })
    setCategoryModalVisible(true)
  }

  const handleDeleteCategory = async (id: string) => {
    try {
      await categoryApi.delete(id)
      message.success('删除成功')
      fetchCategories()
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || '删除失败')
    }
  }

  const handleCategorySubmit = async () => {
    try {
      const values = await categoryForm.validateFields()
      const data = { ...values, type: categoryType }
      if (editingCategory) {
        await categoryApi.update(editingCategory.id, data)
        message.success('更新成功')
      } else {
        await categoryApi.create(data)
        message.success('创建成功')
      }
      setCategoryModalVisible(false)
      fetchCategories()
    } catch (error) {
      message.error('操作失败')
    }
  }

  const incomeCategories = categories.filter(c => c.type === 'income')
  const expenseCategories = categories.filter(c => c.type === 'expense')

  const categoryColumns = [
    {
      title: '图标',
      dataIndex: 'icon',
      width: 60,
      render: (icon: string) => <span style={{ fontSize: 18 }}>{icon || '📝'}</span>,
    },
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: unknown, record: Category) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEditCategory(record)} />
          <Popconfirm
            title="确定要删除此分类吗？"
            onConfirm={() => handleDeleteCategory(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const items = [
    {
      key: 'data',
      label: '数据管理',
      children: (
        <Card>
          <div style={{ marginBottom: 24 }}>
            <h3>数据备份</h3>
            <p style={{ color: '#666', marginBottom: 16 }}>
              导出所有数据为JSON文件，包括账户、交易记录、预算和分类信息。
            </p>
            <Button icon={<DownloadOutlined />} onClick={handleExportData}>
              导出数据
            </Button>
          </div>
          <div>
            <h3>数据恢复</h3>
            <p style={{ color: '#666', marginBottom: 16 }}>
              从备份文件恢复数据。注意：这将覆盖现有数据。
            </p>
            <Button icon={<UploadOutlined />} disabled>
              导入数据（开发中）
            </Button>
          </div>
        </Card>
      ),
    },
    {
      key: 'income-category',
      label: '收入分类',
      children: (
        <Card 
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>收入分类管理</span>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => handleAddCategory('income')}>
                新增
              </Button>
            </div>
          }
        >
          <Table
            dataSource={incomeCategories}
            columns={categoryColumns}
            rowKey="id"
            pagination={false}
            size="small"
          />
        </Card>
      ),
    },
    {
      key: 'expense-category',
      label: '支出分类',
      children: (
        <Card 
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>支出分类管理</span>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => handleAddCategory('expense')}>
                新增
              </Button>
            </div>
          }
        >
          <Table
            dataSource={expenseCategories}
            columns={categoryColumns}
            rowKey="id"
            pagination={false}
            size="small"
          />
        </Card>
      ),
    },
    {
      key: 'about',
      label: '关于',
      children: (
        <Card>
          <h3>MoneyBrain 个人记账软件</h3>
          <p>版本: 1.0.0</p>
          <p style={{ color: '#666' }}>
            一款简洁高效的个人记账软件，支持资产负债管理、收支记录、财务报表生成与分析。
          </p>
        </Card>
      ),
    },
  ]

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>设置</h2>
      <Tabs items={items} />

      <Modal
        title={editingCategory ? '编辑分类' : '新增分类'}
        open={categoryModalVisible}
        onOk={handleCategorySubmit}
        onCancel={() => setCategoryModalVisible(false)}
        okText="确定"
        cancelText="取消"
      >
        <Form form={categoryForm} layout="vertical">
          <Form.Item
            name="name"
            label="分类名称"
            rules={[{ required: true, message: '请输入分类名称' }]}
          >
            <Input placeholder="请输入分类名称" />
          </Form.Item>
          <Form.Item name="parentId" label="父分类">
            <TreeSelect
              placeholder="请选择父分类(可选)"
              allowClear
              treeData={getTypeCategories(categoryType)}
              fieldNames={{ label: 'name', value: 'id', children: 'children' }}
            />
          </Form.Item>
          <Form.Item name="icon" label="图标">
            <Input placeholder="请输入图标(如💰)" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Settings
