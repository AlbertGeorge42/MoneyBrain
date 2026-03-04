import React, { useState, useEffect, useMemo } from 'react'
import { Modal, Table, Button, Form, Input, Space, Popconfirm, message, Switch, TreeSelect, InputNumber, Select, Row, Col, Statistic, Divider, Tag, DatePicker } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, FolderOutlined, WalletOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { useStore } from '../stores'
import { AccountCategory, Account, accountCategoryApi, accountApi } from '../services/api'
import dayjs from 'dayjs'

interface Props {
  visible: boolean
  onClose: () => void
}

interface TreeNode {
  id: string
  key: string
  name: string
  icon: string
  type: 'category' | 'account'
  nodeType: 'asset' | 'liability'
  balance?: number
  isCashEquivalent?: boolean
  parentId: string | null
  children?: TreeNode[]
}

const AccountCategoryModal: React.FC<Props> = ({ visible, onClose }) => {
  const { 
    accountCategories, 
    accounts,
    fetchAccountCategories,
    fetchAccounts,
    addAccount,
    updateAccount,
    deleteAccount,
  } = useStore()

  const [editingCategory, setEditingCategory] = useState<AccountCategory | null>(null)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [categoryFormVisible, setCategoryFormVisible] = useState(false)
  const [accountFormVisible, setAccountFormVisible] = useState(false)
  const [categoryForm] = Form.useForm()
  const [accountForm] = Form.useForm()

  useEffect(() => {
    if (visible) {
      fetchAccountCategories()
      fetchAccounts()
    }
  }, [visible])

  // 构建树形数据
  const buildTreeData = useMemo(() => {
    const buildCategoryNode = (category: AccountCategory, allCategories: AccountCategory[], allAccounts: Account[]): TreeNode => {
      const childCategories = allCategories.filter(c => c.parentId === category.id)
      const categoryAccounts = allAccounts.filter(a => a.categoryId === category.id)
      
      const children: TreeNode[] = [
        ...childCategories.map(c => buildCategoryNode(c, allCategories, allAccounts)),
        ...categoryAccounts.map(a => ({
          id: a.id,
          key: `account-${a.id}`,
          name: a.name,
          icon: a.icon || '💰',
          type: 'account' as const,
          nodeType: a.type as 'asset' | 'liability',
          balance: a.balance,
          parentId: category.id,
        })),
      ]

      return {
        id: category.id,
        key: `category-${category.id}`,
        name: category.name,
        icon: category.icon || '📁',
        type: 'category' as const,
        nodeType: category.type as 'asset' | 'liability',
        isCashEquivalent: category.isCashEquivalent,
        parentId: category.parentId,
        children: children.length > 0 ? children : undefined,
      }
    }

    const assetCategories = accountCategories.filter(c => c.type === 'asset' && !c.parentId)
    const liabilityCategories = accountCategories.filter(c => c.type === 'liability' && !c.parentId)

    const assetNodes: TreeNode[] = assetCategories.map(c => buildCategoryNode(c, accountCategories, accounts))
    const liabilityNodes: TreeNode[] = liabilityCategories.map(c => buildCategoryNode(c, accountCategories, accounts))

    return { assetNodes, liabilityNodes }
  }, [accountCategories, accounts])

  // 计算汇总数据
  const assetAccounts = accounts.filter(a => a.type === 'asset')
  const liabilityAccounts = accounts.filter(a => a.type === 'liability')
  const totalAssets = assetAccounts.reduce((sum, a) => sum + a.balance, 0)
  const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + a.balance, 0)
  const netWorth = totalAssets - totalLiabilities

  // ========== 分类操作 ==========
  const handleAddCategory = (parentId?: string, type?: 'asset' | 'liability') => {
    setEditingCategory(null)
    categoryForm.resetFields()
    if (parentId) {
      const parent = accountCategories.find(c => c.id === parentId)
      categoryForm.setFieldsValue({ type: parent?.type, parentId })
    } else if (type) {
      categoryForm.setFieldsValue({ type })
    }
    setCategoryFormVisible(true)
  }

  const handleEditCategory = (record: AccountCategory) => {
    setEditingCategory(record)
    categoryForm.setFieldsValue({
      name: record.name,
      type: record.type,
      icon: record.icon,
      parentId: record.parentId,
      isCashEquivalent: record.isCashEquivalent,
    })
    setCategoryFormVisible(true)
  }

  const handleDeleteCategory = async (id: string) => {
    try {
      await accountCategoryApi.delete(id)
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
        await accountCategoryApi.update(editingCategory.id, values)
        message.success('更新成功')
      } else {
        await accountCategoryApi.create(values)
        message.success('创建成功')
      }
      setCategoryFormVisible(false)
      fetchAccountCategories()
    } catch (error) {
      message.error('操作失败')
    }
  }

  const handleCashEquivalentChange = async (id: string, checked: boolean) => {
    try {
      await accountCategoryApi.update(id, { isCashEquivalent: checked })
      fetchAccountCategories()
      message.success('更新成功')
    } catch (error) {
      message.error('更新失败')
    }
  }

  // ========== 账户操作 ==========
  const handleAddAccount = (categoryId: string) => {
    setEditingAccount(null)
    accountForm.resetFields()
    const category = accountCategories.find(c => c.id === categoryId)
    accountForm.setFieldsValue({ 
      type: category?.type, 
      categoryId, 
      initialBalance: 0,
      initialBalanceDate: dayjs(),
    })
    setAccountFormVisible(true)
  }

  const handleEditAccount = (record: Account) => {
    setEditingAccount(record)
    accountForm.setFieldsValue({
      name: record.name,
      type: record.type,
      initialBalance: record.initialBalance,
      initialBalanceDate: record.initialBalanceDate ? dayjs(record.initialBalanceDate) : dayjs(),
      categoryId: record.categoryId,
      cashFlowType: record.cashFlowType,
      icon: record.icon,
    })
    setAccountFormVisible(true)
  }

  const handleDeleteAccount = async (id: string) => {
    try {
      // 先查询账户统计信息
      const statsRes = await accountApi.getStats(id)
      const { transactionCount } = statsRes.data.data || {}
      
      if (transactionCount > 0) {
        // 有交易记录，显示二次确认弹窗
        Modal.confirm({
          title: '确认删除账户',
          icon: <ExclamationCircleOutlined />,
          content: (
            <div>
              <p>该账户下有 <strong style={{ color: '#cf1322' }}>{transactionCount}</strong> 条交易记录</p>
              <p>删除账户将同时删除这些交易记录，此操作不可恢复！</p>
            </div>
          ),
          okText: '确认删除',
          okType: 'danger',
          cancelText: '取消',
          onOk: async () => {
            try {
              await deleteAccount(id, true)
              message.success(`删除成功，已删除 ${transactionCount} 条交易记录`)
            } catch (error: any) {
              message.error(error.response?.data?.error?.message || '删除失败')
            }
          },
        })
      } else {
        // 没有交易记录，直接删除
        await deleteAccount(id)
        message.success('删除成功')
      }
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || '删除失败')
    }
  }

  const handleAccountSubmit = async () => {
    try {
      const values = await accountForm.validateFields()
      const submitData = {
        ...values,
        initialBalanceDate: values.initialBalanceDate ? values.initialBalanceDate.format('YYYY-MM-DD') : undefined,
      }
      if (editingAccount) {
        await updateAccount(editingAccount.id, submitData)
        message.success('更新成功')
      } else {
        await addAccount(submitData)
        message.success('创建成功')
      }
      setAccountFormVisible(false)
      accountForm.resetFields()
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || '操作失败')
    }
  }

  // ========== 工具函数 ==========
  const buildTreeSelectData = (items: AccountCategory[], parentId: string | null = null): any[] => {
    return items
      .filter(c => c.parentId === parentId)
      .map(c => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        parentId: c.parentId,
        children: buildTreeSelectData(items, c.id),
      }))
  }

  const getCategoryTree = (type: string) => {
    const filtered = accountCategories.filter(c => c.type === type)
    return buildTreeSelectData(filtered)
  }

  // ========== 表格列定义 ==========
  const getColumns = (nodeType: 'asset' | 'liability') => [
    {
      title: '图标',
      dataIndex: 'icon',
      width: 50,
      render: (icon: string, record: TreeNode) => (
        <span style={{ fontSize: 16 }}>
          {record.type === 'category' ? <FolderOutlined /> : <WalletOutlined />}
        </span>
      ),
    },
    { 
      title: '名称', 
      dataIndex: 'name', 
      key: 'name',
      render: (name: string, record: TreeNode) => (
        <span>
          {record.type === 'category' ? (
            <Tag color="blue">{name}</Tag>
          ) : (
            name
          )}
        </span>
      ),
    },
    { 
      title: '余额', 
      dataIndex: 'balance',
      width: 150,
      render: (balance: number, record: TreeNode) => 
        record.type === 'account' ? (
          <span style={{ color: nodeType === 'asset' ? '#3f8600' : '#cf1322' }}>
            ¥{balance.toFixed(2)}
          </span>
        ) : null,
    },
    {
      title: '现金等价物',
      dataIndex: 'isCashEquivalent',
      width: 100,
      render: (value: boolean, record: TreeNode) => 
        record.type === 'category' && !record.parentId && nodeType === 'asset' ? (
          <Switch 
            checked={value} 
            onChange={(checked) => handleCashEquivalentChange(record.id, checked)}
            size="small"
          />
        ) : null,
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: unknown, record: TreeNode) => {
        if (record.type === 'category') {
          const hasChildren = record.children && record.children.length > 0
          return (
            <Space size="small">
              {!record.parentId && (
                <Button type="link" size="small" onClick={() => handleAddCategory(record.id)}>
                  添加子分类
                </Button>
              )}
              <Button type="link" size="small" onClick={() => handleAddAccount(record.id)}>
                添加账户
              </Button>
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditCategory(record as any)} />
              <Popconfirm
                title={hasChildren ? "该分类下有子项，无法删除" : "确定要删除此分类吗？"}
                onConfirm={() => handleDeleteCategory(record.id)}
                okText="确定"
                cancelText="取消"
                disabled={hasChildren}
              >
                <Button type="link" size="small" danger icon={<DeleteOutlined />} disabled={hasChildren} />
              </Popconfirm>
            </Space>
          )
        } else {
          return (
            <Space size="small">
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditAccount(record as any)} />
              <Popconfirm
                title="确定要删除此账户吗？"
                onConfirm={() => handleDeleteAccount(record.id)}
                okText="确定"
                cancelText="取消"
              >
                <Button type="link" size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Space>
          )
        }
      },
    },
  ]

  return (
    <>
      <Modal
        title="资产负债管理"
        open={visible}
        onCancel={onClose}
        footer={null}
        width={900}
      >
        {/* 汇总统计 */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}>
            <Statistic
              title="总资产"
              value={totalAssets}
              precision={2}
              valueStyle={{ color: '#3f8600', fontSize: 18 }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="总负债"
              value={totalLiabilities}
              precision={2}
              valueStyle={{ color: '#cf1322', fontSize: 18 }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="净资产"
              value={netWorth}
              precision={2}
              valueStyle={{ color: '#1890ff', fontSize: 18 }}
              prefix="¥"
            />
          </Col>
        </Row>

        <Divider style={{ margin: '12px 0' }} />

        {/* 资产分类和账户 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h4 style={{ margin: 0, color: '#3f8600' }}>资产分类</h4>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => handleAddCategory(undefined, 'asset')}>
              新增资产分类
            </Button>
          </div>
          <Table
            dataSource={buildTreeData.assetNodes}
            columns={getColumns('asset')}
            rowKey="key"
            size="small"
            pagination={false}
            expandable={{ childrenColumnName: 'children', defaultExpandAllRows: true }}
            locale={{ emptyText: '暂无资产分类，点击上方按钮新增' }}
          />
        </div>

        <Divider style={{ margin: '16px 0' }} />

        {/* 负债分类和账户 */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h4 style={{ margin: 0, color: '#cf1322' }}>负债分类</h4>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => handleAddCategory(undefined, 'liability')}>
              新增负债分类
            </Button>
          </div>
          <Table
            dataSource={buildTreeData.liabilityNodes}
            columns={getColumns('liability')}
            rowKey="key"
            size="small"
            pagination={false}
            expandable={{ childrenColumnName: 'children', defaultExpandAllRows: true }}
            locale={{ emptyText: '暂无负债分类，点击上方按钮新增' }}
          />
        </div>
      </Modal>

      {/* 分类表单弹窗 */}
      <Modal
        title={editingCategory ? '编辑分类' : '新增分类'}
        open={categoryFormVisible}
        onOk={handleCategorySubmit}
        onCancel={() => setCategoryFormVisible(false)}
        okText="确定"
        cancelText="取消"
      >
        <Form form={categoryForm} layout="vertical">
          <Form.Item name="type" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="parentId" hidden>
            <Input />
          </Form.Item>
          <Form.Item
            name="name"
            label="分类名称"
            rules={[{ required: true, message: '请输入分类名称' }]}
          >
            <Input placeholder="请输入分类名称" />
          </Form.Item>
          <Form.Item name="icon" label="图标">
            <Input placeholder="请输入图标(如💰)" />
          </Form.Item>
          {categoryForm.getFieldValue('type') === 'asset' && !categoryForm.getFieldValue('parentId') && (
            <Form.Item name="isCashEquivalent" label="现金等价物" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* 账户表单弹窗 */}
      <Modal
        title={editingAccount ? '编辑账户' : '新增账户'}
        open={accountFormVisible}
        onOk={handleAccountSubmit}
        onCancel={() => setAccountFormVisible(false)}
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
            <Select placeholder="请选择账户类型" disabled>
              <Select.Option value="asset">资产</Select.Option>
              <Select.Option value="liability">负债</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="initialBalance"
            label="初始余额"
            initialValue={0}
            rules={[{ required: true, message: '请输入初始余额' }]}
            extra="负债账户请填写负值（如信用卡欠款5000元填写-5000）"
          >
            <InputNumber
              style={{ width: '100%' }}
              precision={2}
              placeholder="请输入初始余额"
            />
          </Form.Item>
          <Form.Item
            name="initialBalanceDate"
            label="初始余额日期"
            rules={[{ required: true, message: '请选择初始余额日期' }]}
          >
            <DatePicker style={{ width: '100%' }} placeholder="选择初始余额对应的日期" />
          </Form.Item>
          <Form.Item name="categoryId" label="所属分类">
            <TreeSelect
              placeholder="请选择账户分类"
              allowClear
              treeData={getCategoryTree(accountForm.getFieldValue('type'))}
              fieldNames={{ label: 'name', value: 'id', children: 'children' }}
            />
          </Form.Item>
          <Form.Item name="cashFlowType" label="现金流量活动类型">
            <Select placeholder="请选择活动类型" allowClear>
              <Select.Option value="operating">经营活动</Select.Option>
              <Select.Option value="investing">投资活动</Select.Option>
              <Select.Option value="financing">筹资活动</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="icon" label="图标">
            <Input placeholder="请输入图标(如💰)" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

export default AccountCategoryModal
