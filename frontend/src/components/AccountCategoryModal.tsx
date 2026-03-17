import React, { useState, useEffect, useMemo } from 'react'
import { Modal, Table, Button, Form, Input, Space, Popconfirm, message, TreeSelect, InputNumber, Select, Tabs, Tooltip, DatePicker } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, FolderOutlined, ExclamationCircleOutlined, HolderOutlined, FolderAddOutlined, WalletOutlined, RightOutlined, DownOutlined } from '@ant-design/icons'
import { useStore } from '../stores'
import { AccountCategory, Account, accountCategoryApi, accountApi } from '../services/api'
import dayjs from 'dayjs'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import DynamicIcon from './DynamicIcon'
import IconPicker from './IconPicker'
import { formatBalance } from '../utils/formatBalance'

interface Props {
  visible: boolean
  onClose: () => void
}

// 可排序行组件
const SortableRow = (props: any) => {
  const id = props['data-row-key']
  const isCategoryRow = id?.startsWith('category-')
  
  const { attributes, setNodeRef, transform, transition, isDragging } = useSortable({
    id: id,
    disabled: !isCategoryRow,
  })

  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 9999, background: '#fafafa' } : {}),
  }

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
  } = useStore()

  const [activeTab, setActiveTab] = useState('asset')
  const [editingCategory, setEditingCategory] = useState<AccountCategory | null>(null)
  const [editingAccount, setEditingAccount] = useState<any>(null)
  const [categoryFormVisible, setCategoryFormVisible] = useState(false)
  const [accountFormVisible, setAccountFormVisible] = useState(false)
  const [categoryForm] = Form.useForm()
  const [accountForm] = Form.useForm()
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([])
  
  // 本地排序状态，用于动画
  const [localAccountCategories, setLocalAccountCategories] = useState<AccountCategory[]>([])

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

  // 同步本地状态
  useEffect(() => {
    setLocalAccountCategories(accountCategories)
  }, [accountCategories])

  // 构建树形数据
  const buildTreeData = useMemo(() => {
    interface TreeNode {
      id?: string
      key: string
      name: string
      icon: string
      type: 'category' | 'account'
      nodeType?: 'asset' | 'liability'
      parentId?: string
      sort?: number
      balance: number
      initialBalance?: number
      initialBalanceDate?: string | null
      children?: TreeNode[]
    }

    const buildCategoryNode = (category: AccountCategory, allCategories: AccountCategory[], allAccounts: Account[]): TreeNode => {
      const childCategories = allCategories.filter(c => c.parentId === category.id).sort((a, b) => a.sort - b.sort)
      const categoryAccounts = allAccounts.filter(a => a.categoryId === category.id)
      
      const children: TreeNode[] = [
        ...childCategories.map(c => buildCategoryNode(c, allCategories, allAccounts)),
        ...categoryAccounts.map(a => ({
          id: a.id,
          key: `account-${a.id}`,
          name: a.name,
          icon: a.icon || 'wallet',
          type: 'account' as const,
          nodeType: a.type as 'asset' | 'liability',
          balance: a.balance,
          initialBalance: a.initialBalance,
          initialBalanceDate: a.initialBalanceDate,
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
        parentId: category.parentId || undefined,
        sort: category.sort,
        balance: children.reduce((sum: number, child) => sum + (child.balance || 0), 0),
        children: children.length > 0 ? children : undefined,
      }
    }

    const assetCategories = localAccountCategories.filter(c => c.type === 'asset' && !c.parentId).sort((a, b) => a.sort - b.sort)
    const liabilityCategories = localAccountCategories.filter(c => c.type === 'liability' && !c.parentId).sort((a, b) => a.sort - b.sort)

    const assetNodes = assetCategories.map(c => buildCategoryNode(c, localAccountCategories, accounts))
    const liabilityNodes = liabilityCategories.map(c => buildCategoryNode(c, localAccountCategories, accounts))

    return { assetNodes, liabilityNodes }
  }, [localAccountCategories, accounts])

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

  const handleEditCategory = (record: any) => {
    setEditingCategory(record)
    categoryForm.setFieldsValue({
      name: record.name,
      type: record.nodeType,
      icon: record.icon,
      parentId: record.parentId,
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
      categoryForm.resetFields()
      await fetchAccountCategories()
    } catch (error) {
      message.error('操作失败')
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

  const handleEditAccount = (record: any) => {
    setEditingAccount(record)
    accountForm.setFieldsValue({
      name: record.name,
      type: record.nodeType,
      initialBalance: record.initialBalance,
      initialBalanceDate: record.initialBalanceDate ? dayjs(record.initialBalanceDate) : dayjs(),
      categoryId: record.parentId,
      icon: record.icon,
    })
    setAccountFormVisible(true)
  }

  const handleDeleteAccount = async (id: string) => {
    try {
      const statsRes = await accountApi.getStats(id)
      const { transactionCount } = statsRes.data.data || {}
      
      if (transactionCount && transactionCount > 0) {
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
      
      const submitData: any = {
        name: values.name,
        type: values.type,
        icon: values.icon,
        initialBalanceDate: values.initialBalanceDate ? values.initialBalanceDate.format('YYYY-MM-DD') : undefined,
      }
      
      if (editingAccount && editingAccount.nodeType !== values.type) {
        if (values.categoryId) {
          submitData.categoryId = values.categoryId
        }
      } else {
        submitData.categoryId = values.categoryId
      }
      
      if (editingAccount) {
        const originalInitialBalance = editingAccount.initialBalance
        const newInitialBalance = values.initialBalance
        if (newInitialBalance !== originalInitialBalance) {
          submitData.initialBalance = newInitialBalance
        }
      } else {
        submitData.initialBalance = values.initialBalance
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

    const activeId = String(active.id).replace('category-', '')
    const overId = String(over.id).replace('category-', '')

    const categories = localAccountCategories.filter(c => c.type === type && !c.parentId).sort((a, b) => a.sort - b.sort)
    const oldIndex = categories.findIndex(c => c.id === activeId)
    const newIndex = categories.findIndex(c => c.id === overId)

    if (oldIndex === -1 || newIndex === -1) return

    // 先更新本地状态以显示动画
    const reorderedCategories = arrayMove(categories, oldIndex, newIndex)
    const updatedLocalCategories = localAccountCategories.map(cat => {
      if (cat.type === type && !cat.parentId) {
        const newIndexInReordered = reorderedCategories.findIndex(c => c.id === cat.id)
        return { ...cat, sort: newIndexInReordered }
      }
      return cat
    })
    setLocalAccountCategories(updatedLocalCategories)

    // 然后调用 API 保存
    const items = reorderedCategories.map((c, index) => ({
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
      // 失败时恢复原状态
      setLocalAccountCategories(accountCategories)
    }
  }

  // 获取所有可排序的 key（只包含一级分类）
  const getSortableKeys = (nodes: any[]) => {
    return nodes.filter(n => n.type === 'category').map(n => n.key)
  }

  // 切换展开状态
  const toggleExpand = (recordKey: string) => {
    setExpandedRowKeys(prev => 
      prev.includes(recordKey) 
        ? prev.filter(k => k !== recordKey)
        : [...prev, recordKey]
    )
  }

  // 表格列定义
  const getCategoryColumns = () => [
    {
      title: '',
      width: 30,
      render: (_: unknown, record: any) => {
        // 展开图标列：只有有子项的行才显示
        if (record.children && record.children.length > 0) {
          const isExpanded = expandedRowKeys.includes(record.key)
          return (
            <span
              onClick={() => toggleExpand(record.key)}
              style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
            >
              {isExpanded ? <DownOutlined style={{ fontSize: 10, color: '#666' }} /> : <RightOutlined style={{ fontSize: 10, color: '#666' }} />}
            </span>
          )
        }
        return <span style={{ display: 'inline-block', width: 14 }} />
      },
    },
    {
      title: '',
      width: 30,
      render: (_: unknown, record: any) => {
        // 拖拽手柄列：只有一级分类显示
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
      title: '余额',
      dataIndex: 'balance',
      key: 'balance',
      width: 120,
      render: (balance: number, record: any) => {
        if (record.type === 'category') return '-'
        const result = formatBalance(balance, record.nodeType || 'asset')
        return <span style={{ color: result.color }}>{result.text}</span>
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: unknown, record: any) => (
        <Space size={4}>
          {record.type === 'category' ? (
            <>
              <Tooltip title="添加子分类">
                <Button type="text" size="small" icon={<FolderAddOutlined />} onClick={() => handleAddCategory(record.id)} />
              </Tooltip>
              <Tooltip title="添加账户">
                <Button type="text" size="small" icon={<WalletOutlined />} onClick={() => handleAddAccount(record.id)} />
              </Tooltip>
              <Tooltip title="编辑">
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEditCategory(record)} />
              </Tooltip>
              <Popconfirm title="确定删除此分类？" onConfirm={() => handleDeleteCategory(record.id)} okText="确定" cancelText="取消">
                <Tooltip title="删除">
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            </>
          ) : (
            <>
              <Tooltip title="编辑">
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEditAccount(record)} />
              </Tooltip>
              <Popconfirm title="确定删除此账户？" onConfirm={() => handleDeleteAccount(record.id)} okText="确定" cancelText="取消">
                <Tooltip title="删除">
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Tooltip>
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

  const renderTable = (type: 'asset' | 'liability') => {
    const data = type === 'asset' ? buildTreeData.assetNodes : buildTreeData.liabilityNodes
    const sortableKeys = getSortableKeys(data)

    return (
      <DndContext 
        sensors={sensors} 
        collisionDetection={closestCenter} 
        onDragEnd={(e) => handleDragEnd(e, type)}
        modifiers={[restrictToVerticalAxis]}
      >
        <SortableContext items={sortableKeys} strategy={verticalListSortingStrategy}>
          <Table
            dataSource={data}
            columns={getCategoryColumns()}
            rowKey="key"
            pagination={false}
            size="small"
            indentSize={20}
            expandedRowKeys={expandedRowKeys}
            onExpandedRowsChange={(keys) => setExpandedRowKeys(keys as string[])}
            expandable={{
              rowExpandable: (record) => !!(record.children && record.children.length > 0),
              expandIcon: () => null, // 禁用默认展开图标
            }}
            components={{
              body: {
                row: SortableRow,
              },
            }}
          />
        </SortableContext>
      </DndContext>
    )
  }

  const tabItems = [
    {
      key: 'asset',
      label: (
        <span>
          <FolderOutlined /> 资产分类
        </span>
      ),
      children: (
        <div>
          <div style={{ marginBottom: 12 }}>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => handleAddCategory(undefined, 'asset')}>
              添加资产分类
            </Button>
          </div>
          {renderTable('asset')}
        </div>
      ),
    },
    {
      key: 'liability',
      label: (
        <span>
          <FolderOutlined /> 负债分类
        </span>
      ),
      children: (
        <div>
          <div style={{ marginBottom: 12 }}>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => handleAddCategory(undefined, 'liability')}>
              添加负债分类
            </Button>
          </div>
          {renderTable('liability')}
        </div>
      ),
    },
  ]

  return (
    <>
      <Modal
        title="账户分类管理"
        open={visible}
        onCancel={onClose}
        footer={null}
        width={700}
      >
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
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
            <Select 
              placeholder="请选择账户类型"
              onChange={() => {
                accountForm.setFieldsValue({ categoryId: undefined })
              }}
            >
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
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" placeholder="选择日期" />
          </Form.Item>
          <Form.Item shouldUpdate={(prevValues, currentValues) => prevValues.type !== currentValues.type}>
            {({ getFieldValue }) => (
              <Form.Item name="categoryId" label="所属分类">
                <TreeSelect
                  placeholder="请选择账户分类"
                  allowClear
                  treeData={getCategoryTree(getFieldValue('type'))}
                  fieldNames={{ label: 'name', value: 'id', children: 'children' }}
                />
              </Form.Item>
            )}
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
