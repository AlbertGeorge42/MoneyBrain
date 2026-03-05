import React, { useState, useEffect, useMemo } from 'react'
import { Modal, Table, Button, Form, Input, Space, Popconfirm, message, Switch, TreeSelect, InputNumber, Select, Row, Col, Statistic, Divider, Tag, DatePicker, Card } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, FolderOutlined, ExclamationCircleOutlined, HolderOutlined } from '@ant-design/icons'
import { useStore } from '../stores'
import { AccountCategory, Account, accountCategoryApi, accountApi } from '../services/api'
import dayjs from 'dayjs'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import DynamicIcon from './DynamicIcon'
import IconPicker from './IconPicker'

interface Props {
  visible: boolean
  onClose: () => void
}

// 可排序行组件 - 只在第一列响应拖拽
const SortableRow = (props: any) => {
  const id = props['data-row-key']
  const isCategoryRow = id?.startsWith('category-')
  
  // 只有分类行才启用拖拽
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: id,
    disabled: !isCategoryRow,
  })

  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 9999, background: '#fafafa' } : {}),
  }

  // 将 listeners 只应用到第一列的拖拽手柄
  // 通过 data-drag-handle 属性标记
  return (
    <tr 
      {...props} 
      ref={setNodeRef} 
      style={style} 
      {...attributes}
    />
  )
}

// 拖拽手柄组件
const DragHandle = ({ id }: { id: string }) => {
  const { listeners, setNodeRef } = useSortable({ id })
  
  return (
    <div ref={setNodeRef} {...listeners} style={{ cursor: 'grab', display: 'inline-flex' }}>
      <HolderOutlined style={{ color: '#999' }} />
    </div>
  )
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
    updateAccountCategoryCashEquivalent,
  } = useStore()

  const [editingCategory, setEditingCategory] = useState<AccountCategory | null>(null)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [categoryFormVisible, setCategoryFormVisible] = useState(false)
  const [accountFormVisible, setAccountFormVisible] = useState(false)
  const [categoryForm] = Form.useForm()
  const [accountForm] = Form.useForm()

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  useEffect(() => {
    if (visible) {
      fetchAccountCategories()
      fetchAccounts()
    }
  }, [visible])

  // 构建树形数据
  const buildTreeData = useMemo(() => {
    const buildCategoryNode = (category: AccountCategory, allCategories: AccountCategory[], allAccounts: Account[]) => {
      const childCategories = allCategories.filter(c => c.parentId === category.id).sort((a, b) => a.sort - b.sort)
      const categoryAccounts = allAccounts.filter(a => a.categoryId === category.id)
      
      const children = [
        ...childCategories.map(c => buildCategoryNode(c, allCategories, allAccounts)),
        ...categoryAccounts.map(a => ({
          id: a.id,
          key: `account-${a.id}`,
          name: a.name,
          icon: a.icon || 'wallet',
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
        icon: category.icon || 'folder',
        type: 'category' as const,
        nodeType: category.type as 'asset' | 'liability',
        isCashEquivalent: category.isCashEquivalent,
        parentId: category.parentId,
        sort: category.sort,
        children: children.length > 0 ? children : undefined,
      }
    }

    const assetCategories = accountCategories.filter(c => c.type === 'asset' && !c.parentId).sort((a, b) => a.sort - b.sort)
    const liabilityCategories = accountCategories.filter(c => c.type === 'liability' && !c.parentId).sort((a, b) => a.sort - b.sort)

    const assetNodes = assetCategories.map(c => buildCategoryNode(c, accountCategories, accounts))
    const liabilityNodes = liabilityCategories.map(c => buildCategoryNode(c, accountCategories, accounts))

    return { assetNodes, liabilityNodes }
  }, [accountCategories, accounts])

  // 计算汇总数据
  const assetAccounts = accounts.filter(a => a.type === 'asset')
  const liabilityAccounts = accounts.filter(a => a.type === 'liability')
  const totalAssets = assetAccounts.reduce((sum, a) => sum + a.balance, 0)
  const totalLiabilities = Math.abs(liabilityAccounts.reduce((sum, a) => sum + a.balance, 0))
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
      await updateAccountCategoryCashEquivalent(id, checked)
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
      icon: record.icon,
    })
    setAccountFormVisible(true)
  }

  const handleDeleteAccount = async (id: string) => {
    try {
      const statsRes = await accountApi.getStats(id)
      const { transactionCount } = statsRes.data.data || {}
      
      if (transactionCount > 0) {
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

  // 拖拽排序
  const handleDragEnd = async (event: DragEndEvent, type: 'asset' | 'liability') => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    // 从 key 中提取真正的 id
    const activeId = String(active.id).replace('category-', '')
    const overId = String(over.id).replace('category-', '')

    const categories = accountCategories.filter(c => c.type === type && !c.parentId).sort((a, b) => a.sort - b.sort)
    const oldIndex = categories.findIndex(c => c.id === activeId)
    const newIndex = categories.findIndex(c => c.id === overId)

    if (oldIndex === -1 || newIndex === -1) return

    const newCategories = [...categories]
    const [removed] = newCategories.splice(oldIndex, 1)
    newCategories.splice(newIndex, 0, removed)

    const items = newCategories.map((c, index) => ({
      id: c.id,
      sort: index,
      parentId: null,
    }))

    try {
      await accountCategoryApi.updateSort(items)
      fetchAccountCategories()
      message.success('排序更新成功')
    } catch (error) {
      message.error('排序更新失败')
    }
  }

  // 表格列定义
  const getCategoryColumns = (type: 'asset' | 'liability') => [
    {
      title: '',
      width: 40,
      render: (_: unknown, record: any) => {
        // 只有分类行才显示拖拽手柄
        if (record.type === 'category') {
          return <DragHandle id={record.key} />
        }
        return null
      },
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: any) => (
        <span>
          <DynamicIcon name={record.icon} size={16} fallback={record.type === 'category' ? 'folder' : 'wallet'} /> {text}
        </span>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: (type: string) => type === 'category' ? <Tag color="blue">分类</Tag> : <Tag color="green">账户</Tag>,
    },
    {
      title: '余额',
      dataIndex: 'balance',
      key: 'balance',
      width: 120,
      render: (balance: number, record: any) => {
        if (record.type === 'category') return '-'
        return <span style={{ color: balance >= 0 ? '#3f8600' : '#cf1322' }}>¥{balance.toFixed(2)}</span>
      },
    },
    {
      title: '现金等价物',
      dataIndex: 'isCashEquivalent',
      key: 'isCashEquivalent',
      width: 100,
      render: (value: boolean, record: any) => {
        if (record.type !== 'category') return '-'
        return (
          <Switch
            checked={value}
            onChange={(checked) => handleCashEquivalentChange(record.id, checked)}
            size="small"
          />
        )
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: unknown, record: any) => (
        <Space size="small">
          {record.type === 'category' ? (
            <>
              <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => handleAddCategory(record.id)}>
                子分类
              </Button>
              <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => handleAddAccount(record.id)}>
                账户
              </Button>
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditCategory(record)}>
                编辑
              </Button>
              <Popconfirm
                title="确定要删除此分类吗？"
                onConfirm={() => handleDeleteCategory(record.id)}
                okText="确定"
                cancelText="取消"
              >
                <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            </>
          ) : (
            <>
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditAccount(record)}>
                编辑
              </Button>
              <Popconfirm
                title="确定要删除此账户吗？"
                onConfirm={() => handleDeleteAccount(record.id)}
                okText="确定"
                cancelText="取消"
              >
                <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ]

  const getCategoryTree = (type: 'asset' | 'liability') => {
    return accountCategories
      .filter(c => c.type === type)
      .map(c => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        parentId: c.parentId,
        children: accountCategories.filter(cc => cc.parentId === c.id),
      }))
  }

  // 获取所有可排序的 key（只包含一级分类）
  const getSortableKeys = (nodes: any[]) => {
    return nodes.filter(n => n.type === 'category').map(n => n.key)
  }

  return (
    <>
      <Modal
        title="账户分类管理"
        open={visible}
        onCancel={onClose}
        footer={null}
        width={1000}
      >
        <Card style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={8}>
              <Statistic title="总资产" value={totalAssets} precision={2} prefix="¥" valueStyle={{ color: '#3f8600' }} />
            </Col>
            <Col span={8}>
              <Statistic title="总负债" value={totalLiabilities} precision={2} prefix="¥" valueStyle={{ color: '#cf1322' }} />
            </Col>
            <Col span={8}>
              <Statistic title="净资产" value={netWorth} precision={2} prefix="¥" valueStyle={{ color: netWorth >= 0 ? '#3f8600' : '#cf1322' }} />
            </Col>
          </Row>
        </Card>

        <Divider orientation="left">
          <Space>
            <FolderOutlined />
            资产分类
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => handleAddCategory(undefined, 'asset')}>
              添加分类
            </Button>
          </Space>
        </Divider>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, 'asset')}>
          <SortableContext items={getSortableKeys(buildTreeData.assetNodes)} strategy={verticalListSortingStrategy}>
            <Table
              dataSource={buildTreeData.assetNodes}
              columns={getCategoryColumns('asset')}
              rowKey="key"
              pagination={false}
              size="small"
              indentSize={20}
              defaultExpandAllRows
              components={{
                body: {
                  row: SortableRow,
                },
              }}
            />
          </SortableContext>
        </DndContext>

        <Divider orientation="left">
          <Space>
            <FolderOutlined />
            负债分类
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => handleAddCategory(undefined, 'liability')}>
              添加分类
            </Button>
          </Space>
        </Divider>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, 'liability')}>
          <SortableContext items={getSortableKeys(buildTreeData.liabilityNodes)} strategy={verticalListSortingStrategy}>
            <Table
              dataSource={buildTreeData.liabilityNodes}
              columns={getCategoryColumns('liability')}
              rowKey="key"
              pagination={false}
              size="small"
              indentSize={20}
              defaultExpandAllRows
              components={{
                body: {
                  row: SortableRow,
                },
              }}
            />
          </SortableContext>
        </DndContext>
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
          <Form.Item name="name" label="分类名称" rules={[{ required: true, message: '请输入分类名称' }]}>
            <Input placeholder="请输入分类名称" />
          </Form.Item>
          <Form.Item name="type" label="分类类型" rules={[{ required: true, message: '请选择分类类型' }]}>
            <Select placeholder="请选择分类类型" disabled>
              <Select.Option value="asset">资产</Select.Option>
              <Select.Option value="liability">负债</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="parentId" label="父分类">
            <TreeSelect
              placeholder="请选择父分类"
              allowClear
              treeData={getCategoryTree(categoryForm.getFieldValue('type'))}
              fieldNames={{ label: 'name', value: 'id', children: 'children' }}
            />
          </Form.Item>
          <Form.Item name="icon" label="图标">
            <IconPicker placeholder="请选择图标" />
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
          <Form.Item name="name" label="账户名称" rules={[{ required: true, message: '请输入账户名称' }]}>
            <Input placeholder="请输入账户名称" />
          </Form.Item>
          <Form.Item name="type" label="账户类型" rules={[{ required: true, message: '请选择账户类型' }]}>
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
            <InputNumber style={{ width: '100%' }} precision={2} placeholder="请输入初始余额" />
          </Form.Item>
          <Form.Item name="initialBalanceDate" label="初始余额日期" rules={[{ required: true, message: '请选择初始余额日期' }]}>
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
          <Form.Item name="icon" label="图标">
            <IconPicker placeholder="请选择图标" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

export default AccountCategoryModal
