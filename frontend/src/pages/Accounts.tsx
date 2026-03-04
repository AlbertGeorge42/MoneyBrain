import React, { useEffect, useState } from 'react'
import { 
  Table, Button, Modal, Form, Input, Select, InputNumber, Space, 
  Card, Popconfirm, message, TreeSelect 
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useStore } from '../stores'
import { Account, AccountCategory } from '../services/api'

const Accounts: React.FC = () => {
  const { 
    accounts, 
    accountCategories, 
    loading, 
    fetchAccounts, 
    fetchAccountCategories,
    addAccount,
    updateAccount,
    deleteAccount,
    addAccountCategory,
    updateAccountCategory,
    deleteAccountCategory,
  } = useStore()

  const [accountModalVisible, setAccountModalVisible] = useState(false)
  const [categoryModalVisible, setCategoryModalVisible] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [editingCategory, setEditingCategory] = useState<AccountCategory | null>(null)
  const [accountForm] = Form.useForm()
  const [categoryForm] = Form.useForm()

  useEffect(() => {
    fetchAccounts()
    fetchAccountCategories()
  }, [])

  const buildTreeData = (categories: AccountCategory[], parentId: string | null = null): any[] => {
    return categories
      .filter(c => c.parentId === parentId)
      .map(c => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        parentId: c.parentId,
        children: buildTreeData(categories, c.id),
      }))
  }

  const getAccountTypeCategories = (type: string) => {
    const filtered = accountCategories.filter(c => c.type === type)
    return buildTreeData(filtered)
  }

  const handleAddAccount = () => {
    setEditingAccount(null)
    accountForm.resetFields()
    setAccountModalVisible(true)
  }

  const handleEditAccount = (record: Account) => {
    setEditingAccount(record)
    accountForm.setFieldsValue({
      name: record.name,
      type: record.type,
      balance: record.balance,
      icon: record.icon,
      categoryId: record.categoryId,
    })
    setAccountModalVisible(true)
  }

  const handleDeleteAccount = async (id: string) => {
    try {
      await deleteAccount(id)
      message.success('删除成功')
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || '删除失败')
    }
  }

  const handleAccountSubmit = async () => {
    try {
      const values = await accountForm.validateFields()
      if (editingAccount) {
        await updateAccount(editingAccount.id, values)
        message.success('更新成功')
      } else {
        await addAccount(values)
        message.success('创建成功')
      }
      setAccountModalVisible(false)
      accountForm.resetFields()
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || '操作失败')
    }
  }

  const handleAddCategory = (type: string) => {
    setEditingCategory(null)
    categoryForm.resetFields()
    categoryForm.setFieldsValue({ type })
    setCategoryModalVisible(true)
  }

  const handleEditCategory = (record: AccountCategory) => {
    setEditingCategory(record)
    categoryForm.setFieldsValue({
      name: record.name,
      type: record.type,
      icon: record.icon,
      parentId: record.parentId,
    })
    setCategoryModalVisible(true)
  }

  const handleDeleteCategory = async (id: string) => {
    try {
      await deleteAccountCategory(id)
      message.success('删除成功')
      fetchAccountCategories()
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || '删除失败')
    }
  }

  const handleCategorySubmit = async () => {
    try {
      const values = await categoryForm.validateFields()
      if (editingCategory) {
        await updateAccountCategory(editingCategory.id, values)
        message.success('更新成功')
      } else {
        await addAccountCategory(values)
        message.success('创建成功')
      }
      setCategoryModalVisible(false)
      categoryForm.resetFields()
      fetchAccountCategories()
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || '操作失败')
    }
  }

  const assetAccounts = accounts.filter(a => a.type === 'asset')
  const liabilityAccounts = accounts.filter(a => a.type === 'liability')
  const totalAssets = assetAccounts.reduce((sum, a) => sum + a.balance, 0)
  const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + a.balance, 0)
  const netWorth = totalAssets - totalLiabilities

  const columns = [
    {
      title: '图标',
      dataIndex: 'icon',
      width: 60,
      render: (icon: string) => <span style={{ fontSize: 20 }}>{icon || '💰'}</span>,
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '分类',
      dataIndex: ['category', 'name'],
      key: 'category',
      render: (name: string) => name || '未分类',
    },
    {
      title: '余额',
      dataIndex: 'balance',
      key: 'balance',
      render: (balance: number, record: Account) => (
        <span style={{ color: record.type === 'asset' ? '#3f8600' : '#cf1322' }}>
          ¥{balance.toFixed(2)}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: unknown, record: Account) => (
        <Space>
          <Button 
            type="link" 
            icon={<EditOutlined />} 
            onClick={() => handleEditAccount(record)}
          />
          <Popconfirm
            title="确定要删除此账户吗？"
            onConfirm={() => handleDeleteAccount(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const categoryColumns = [
    {
      title: '图标',
      dataIndex: 'icon',
      width: 60,
      render: (icon: string) => <span style={{ fontSize: 18 }}>{icon || '📁'}</span>,
    },
    { title: '名称', dataIndex: 'name', key: 'name' },
    { 
      title: '类型', 
      dataIndex: 'type', 
      key: 'type',
      render: (type: string) => type === 'asset' ? '资产' : '负债',
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: unknown, record: AccountCategory) => (
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

  const renderAccountList = (accountList: Account[], title: string, total: number, color: string) => (
    <Card 
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{title}</span>
          <span style={{ color, fontSize: 18, fontWeight: 'bold' }}>
            ¥{total.toFixed(2)}
          </span>
        </div>
      }
      style={{ marginBottom: 16 }}
    >
      <Table 
        dataSource={accountList} 
        columns={columns} 
        rowKey="id"
        pagination={false}
        size="small"
        loading={loading}
      />
    </Card>
  )

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>账户管理</h2>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddAccount}>
            新增账户
          </Button>
          <Button onClick={() => handleAddCategory('asset')}>
            新增资产分类
          </Button>
          <Button onClick={() => handleAddCategory('liability')}>
            新增负债分类
          </Button>
        </Space>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
          <div>
            <div style={{ color: '#666', marginBottom: 8 }}>总资产</div>
            <div style={{ fontSize: 24, color: '#3f8600', fontWeight: 'bold' }}>
              ¥{totalAssets.toFixed(2)}
            </div>
          </div>
          <div>
            <div style={{ color: '#666', marginBottom: 8 }}>总负债</div>
            <div style={{ fontSize: 24, color: '#cf1322', fontWeight: 'bold' }}>
              ¥{totalLiabilities.toFixed(2)}
            </div>
          </div>
          <div>
            <div style={{ color: '#666', marginBottom: 8 }}>净资产</div>
            <div style={{ fontSize: 24, color: '#1890ff', fontWeight: 'bold' }}>
              ¥{netWorth.toFixed(2)}
            </div>
          </div>
        </div>
      </Card>

      <Card title="账户分类" style={{ marginBottom: 16 }}>
        <Table
          dataSource={accountCategories}
          columns={categoryColumns}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </Card>

      {renderAccountList(assetAccounts, '资产账户', totalAssets, '#3f8600')}
      {renderAccountList(liabilityAccounts, '负债账户', totalLiabilities, '#cf1322')}

      <Modal
        title={editingAccount ? '编辑账户' : '新增账户'}
        open={accountModalVisible}
        onOk={handleAccountSubmit}
        onCancel={() => setAccountModalVisible(false)}
        okText="确定"
        cancelText="取消"
      >
        <Form form={accountForm} layout="vertical">
          <Form.Item
            name="name"
            label="账户名称"
            rules={[{ required: true, message: '请输入账户名称' }]}
          >
            <Input placeholder="请输入账户名称" />
          </Form.Item>
          <Form.Item
            name="type"
            label="账户类型"
            rules={[{ required: true, message: '请选择账户类型' }]}
          >
            <Select placeholder="请选择账户类型">
              <Select.Option value="asset">资产</Select.Option>
              <Select.Option value="liability">负债</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="balance"
            label="初始余额"
            initialValue={0}
          >
            <InputNumber
              style={{ width: '100%' }}
              precision={2}
              placeholder="请输入初始余额"
            />
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.type !== cur.type}
          >
            {({ getFieldValue }) => {
              const type = getFieldValue('type')
              return (
                <Form.Item name="categoryId" label="账户分类">
                  <TreeSelect
                    placeholder="请选择账户分类"
                    allowClear
                    treeData={getAccountTypeCategories(type)}
                    fieldNames={{ label: 'name', value: 'id', children: 'children' }}
                  />
                </Form.Item>
              )
            }}
          </Form.Item>
          <Form.Item name="icon" label="图标">
            <Input placeholder="请输入图标(如💰)" />
          </Form.Item>
        </Form>
      </Modal>

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
          <Form.Item
            name="type"
            label="分类类型"
            rules={[{ required: true, message: '请选择分类类型' }]}
          >
            <Select placeholder="请选择分类类型">
              <Select.Option value="asset">资产</Select.Option>
              <Select.Option value="liability">负债</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.type !== cur.type}
          >
            {({ getFieldValue }) => {
              const type = getFieldValue('type')
              return (
                <Form.Item name="parentId" label="父分类">
                  <TreeSelect
                    placeholder="请选择父分类(可选)"
                    allowClear
                    treeData={getAccountTypeCategories(type)}
                    fieldNames={{ label: 'name', value: 'id', children: 'children' }}
                  />
                </Form.Item>
              )
            }}
          </Form.Item>
          <Form.Item name="icon" label="图标">
            <Input placeholder="请输入图标(如💰)" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Accounts
