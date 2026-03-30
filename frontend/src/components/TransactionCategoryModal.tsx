import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Modal, Tabs, Table, Button, Form, Input, Space, message, Tooltip, Dropdown, Radio, TreeSelect, Alert } from 'antd'
import { PlusOutlined, EditOutlined, SettingOutlined, FolderAddOutlined, RightOutlined, DownOutlined, ExportOutlined, DeleteOutlined } from '@ant-design/icons'
import { useStore } from '../stores'
import { TransactionCategory, transactionCategoryApi } from '../services/api'
import DynamicIcon from './DynamicIcon'
import IconPicker from './IconPicker'
import { DndContext, pointerWithin, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import type { MenuProps } from 'antd'

interface Props {
  visible: boolean
  onClose: () => void
}

interface TreeNode {
  id: string
  key: string
  name: string
  icon: string | null
  type: 'category'
  categoryType: 'income' | 'expense' | 'transfer'
  parentId?: string
  sort: number
  children?: TreeNode[]
  depth: number
}

interface MoveTreeDataNode {
  value: string
  title: string
  disabled?: boolean
  children?: MoveTreeDataNode[]
}

const SortableRow = (props: any) => {
  const id = props['data-row-key']
  const isCategoryRow = id?.startsWith('category-')
  
  const { attributes, setNodeRef, transform, transition, isDragging } = useSortable({
    id: id,
    disabled: !isCategoryRow,
  })

  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Translate.toString(transform),
    transition,
    ...(isDragging ? { 
      opacity: 0.5,
      background: '#fafafa',
    } : {}),
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

const DragHandle = ({ id }: { id: string }) => {
  const { listeners, setNodeRef } = useSortable({ id })
  
  return (
    <div ref={setNodeRef} {...listeners} style={{ cursor: 'grab', display: 'inline-flex' }}>
      <span style={{ color: '#999' }}>⋮⋮</span>
    </div>
  )
}

const TransactionCategoryModal: React.FC<Props> = ({ visible, onClose }) => {
  const { transactionCategories, fetchTransactionCategories } = useStore()

  const [activeTab, setActiveTab] = useState('income')
  const [editingItem, setEditingItem] = useState<TransactionCategory | null>(null)
  const [formVisible, setFormVisible] = useState(false)
  const [form] = Form.useForm()
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([])
  
  const [localCategories, setLocalCategories] = useState<TransactionCategory[]>([])

  const [deleteModalVisible, setDeleteModalVisible] = useState(false)
  const [deletingCategory, setDeletingCategory] = useState<TreeNode | null>(null)
  const [deleteTransactionCount, setDeleteTransactionCount] = useState(0)
  const [deleteAction, setDeleteAction] = useState<'transfer' | 'delete'>('transfer')
  const [transferTargetId, setTransferTargetId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [moveModalVisible, setMoveModalVisible] = useState(false)
  const [movingCategory, setMovingCategory] = useState<TreeNode | null>(null)
  const [moveTargetId, setMoveTargetId] = useState<string | null | undefined>(undefined)
  const [moveLoading, setMoveLoading] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  useEffect(() => {
    if (visible) {
      fetchTransactionCategories()
    }
  }, [visible])

  useEffect(() => {
    setLocalCategories(transactionCategories)
  }, [transactionCategories])

  const handleAdd = (parentId?: string) => {
    setEditingItem(null)
    form.resetFields()
    if (parentId) {
      const parent = transactionCategories.find(c => c.id === parentId)
      form.setFieldsValue({ type: parent?.type, parentId })
    } else {
      form.setFieldsValue({ type: activeTab })
    }
    setFormVisible(true)
  }

  const handleEdit = (record: TreeNode) => {
    const category = transactionCategories.find(c => c.id === record.id)
    if (category) {
      setEditingItem(category)
      form.setFieldsValue({
        name: category.name,
        icon: category.icon,
        parentId: category.parentId,
      })
      setFormVisible(true)
    }
  }

  const handleDeleteClick = async (record: TreeNode) => {
    try {
      const res = await transactionCategoryApi.getStats(record.id)
      if (res.data.success && res.data.data) {
        setDeletingCategory(record)
        setDeleteTransactionCount(res.data.data.transactionCount)
        setDeleteAction('transfer')
        setTransferTargetId(null)
        setDeleteModalVisible(true)
      }
    } catch (error) {
      message.error('获取分类信息失败')
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deletingCategory) return

    if (deleteAction === 'transfer' && !transferTargetId) {
      message.warning('请选择转移目标分类')
      return
    }

    setDeleteLoading(true)
    try {
      const params: { transferToCategoryId?: string; deleteTransactions?: boolean } = {}
      if (deleteAction === 'transfer') {
        params.transferToCategoryId = transferTargetId!
      } else {
        params.deleteTransactions = true
      }

      const res = await transactionCategoryApi.delete(deletingCategory.id, params)
      if (res.data.success && res.data.data) {
        if (deleteAction === 'transfer') {
          message.success(`删除成功，已转移 ${res.data.data.transferredTransactions || 0} 笔交易`)
        } else {
          message.success(`删除成功，已删除 ${res.data.data.deletedTransactions || 0} 笔交易`)
        }
        setDeleteModalVisible(false)
        fetchTransactionCategories()
      }
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || '删除失败')
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleMoveClick = (record: TreeNode) => {
    setMovingCategory(record)
    setMoveTargetId(undefined)
    setMoveModalVisible(true)
  }

  const handleMoveConfirm = async () => {
    if (!movingCategory) return

    if (moveTargetId === undefined) {
      message.warning('请选择目标位置')
      return
    }

    setMoveLoading(true)
    try {
      const res = await transactionCategoryApi.move(movingCategory.id, { 
        newParentId: moveTargetId 
      })
      if (res.data.success) {
        message.success('移动成功')
        setMoveModalVisible(false)
        fetchTransactionCategories()
      }
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || '移动失败')
    } finally {
      setMoveLoading(false)
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (editingItem) {
        await transactionCategoryApi.update(editingItem.id, values)
        message.success('更新成功')
      } else {
        await transactionCategoryApi.create(values)
        message.success('创建成功')
      }
      setFormVisible(false)
      fetchTransactionCategories()
    } catch (error) {
      message.error('操作失败')
    }
  }

  const handleDragEnd = async (event: DragEndEvent, type: 'income' | 'expense' | 'transfer') => {
    const { active, over } = event
    
    if (!over || active.id === over.id) return

    const activeKey = String(active.id)
    const overKey = String(over.id)

    const activeId = activeKey.replace('category-', '')
    const overId = overKey.replace('category-', '')

    const activeCategory = localCategories.find(c => c.id === activeId)
    const overCategory = localCategories.find(c => c.id === overId)
    
    if (!activeCategory || !overCategory) return
    
    const isTopLevelDrag = !activeCategory.parentId && !overCategory.parentId
    const isSecondLevelDrag = activeCategory.parentId && overCategory.parentId
    
    if (!isTopLevelDrag && !isSecondLevelDrag) {
      message.warning('只能在同一层级内调整顺序')
      return
    }

    if (isSecondLevelDrag && activeCategory.parentId !== overCategory.parentId) {
      message.warning('只能在同一父分类下调整子分类顺序')
      return
    }

    if (isTopLevelDrag) {
      const typeCategories = localCategories
        .filter(c => c.type === type && !c.parentId)
        .sort((a, b) => a.sort - b.sort)
      
      const oldIndex = typeCategories.findIndex(c => c.id === activeId)
      const newIndex = typeCategories.findIndex(c => c.id === overId)

      if (oldIndex === -1 || newIndex === -1) return

      const reorderedCategories = arrayMove(typeCategories, oldIndex, newIndex)
      const updatedLocalCategories = localCategories.map(cat => {
        if (cat.type === type && !cat.parentId) {
          const newIndexInReordered = reorderedCategories.findIndex(c => c.id === cat.id)
          return { ...cat, sort: newIndexInReordered }
        }
        return cat
      })
      setLocalCategories(updatedLocalCategories)

      const items = reorderedCategories.map((c, index) => ({
        id: c.id,
        sort: index,
        parentId: null,
      }))

      try {
        await transactionCategoryApi.updateSort(items)
        message.success('排序更新成功')
      } catch (error) {
        message.error('排序更新失败')
        setLocalCategories(transactionCategories)
      }
    } else if (isSecondLevelDrag) {
      const parentId = activeCategory.parentId
      const siblingCategories = localCategories
        .filter(c => c.parentId === parentId)
        .sort((a, b) => a.sort - b.sort)
      
      const oldIndex = siblingCategories.findIndex(c => c.id === activeId)
      const newIndex = siblingCategories.findIndex(c => c.id === overId)
      
      if (oldIndex === -1 || newIndex === -1) return
      
      const reorderedCategories = arrayMove(siblingCategories, oldIndex, newIndex)
      const updatedLocalCategories = localCategories.map(cat => {
        if (cat.parentId === parentId) {
          const newIndexInReordered = reorderedCategories.findIndex(c => c.id === cat.id)
          return { ...cat, sort: newIndexInReordered }
        }
        return cat
      })
      setLocalCategories(updatedLocalCategories)
      
      const items = reorderedCategories.map((c, index) => ({
        id: c.id,
        sort: index,
        parentId: parentId,
      }))
      
      try {
        await transactionCategoryApi.updateSort(items)
        message.success('子分类排序更新成功')
      } catch (error) {
        message.error('子分类排序更新失败')
        setLocalCategories(transactionCategories)
      }
    }
  }

  const buildTreeData = useMemo(() => {
    const buildCategoryNode = (category: TransactionCategory, allCategories: TransactionCategory[], depth: number): TreeNode => {
      const childCategories = allCategories.filter(c => c.parentId === category.id).sort((a, b) => a.sort - b.sort)
      
      const children: TreeNode[] = childCategories.map(c => buildCategoryNode(c, allCategories, depth + 1))

      return {
        id: category.id,
        key: `category-${category.id}`,
        name: category.name,
        icon: category.icon,
        type: 'category' as const,
        categoryType: category.type as 'income' | 'expense' | 'transfer',
        parentId: category.parentId || undefined,
        sort: category.sort,
        children: children.length > 0 ? children : undefined,
        depth,
      }
    }

    const incomeCategories = localCategories.filter(c => c.type === 'income' && !c.parentId).sort((a, b) => a.sort - b.sort)
    const expenseCategories = localCategories.filter(c => c.type === 'expense' && !c.parentId).sort((a, b) => a.sort - b.sort)
    const transferCategories = localCategories.filter(c => c.type === 'transfer' && !c.parentId).sort((a, b) => a.sort - b.sort)

    const incomeNodes = incomeCategories.map(c => buildCategoryNode(c, localCategories, 0))
    const expenseNodes = expenseCategories.map(c => buildCategoryNode(c, localCategories, 0))
    const transferNodes = transferCategories.map(c => buildCategoryNode(c, localCategories, 0))

    return { incomeNodes, expenseNodes, transferNodes }
  }, [localCategories])

  const toggleExpand = (recordKey: string) => {
    setExpandedRowKeys(prev => 
      prev.includes(recordKey) 
        ? prev.filter(k => k !== recordKey)
        : [...prev, recordKey]
    )
  }

  const getSettingMenuItems = (record: TreeNode): MenuProps['items'] => {
    const hasChildren = record.children && record.children.length > 0
    const isTopLevel = !record.parentId
    return [
      isTopLevel && hasChildren
        ? {
            key: 'move',
            label: '移动到...',
            icon: <ExportOutlined />,
            disabled: true,
            title: '该分类下存在子分类，无法移动',
          }
        : {
            key: 'move',
            label: '移动到...',
            icon: <ExportOutlined />,
            onClick: () => handleMoveClick(record),
          },
      { type: 'divider' as const },
      hasChildren
        ? {
            key: 'delete',
            label: '删除',
            icon: <DeleteOutlined />,
            danger: true,
            disabled: true,
            title: '该分类下存在子分类，无法删除',
          }
        : {
            key: 'delete',
            label: '删除',
            icon: <DeleteOutlined />,
            danger: true,
            onClick: () => handleDeleteClick(record),
          },
    ]
  }

  const getColumns = () => [
    {
      title: '',
      width: 30,
      render: (_: unknown, record: TreeNode) => {
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
      render: (_: unknown, record: TreeNode) => {
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
      render: (text: string, record: TreeNode) => (
        <span>
          <DynamicIcon name={record.icon} size={16} fallback="file-text" /> {text}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: unknown, record: TreeNode) => (
        <Space size={4}>
          {!record.parentId && (
            <Tooltip title="添加子分类">
              <Button 
                type="text" 
                size="small" 
                icon={<FolderAddOutlined />} 
                onClick={() => handleAdd(record.id)}
              />
            </Tooltip>
          )}
          <Tooltip title="编辑">
            <Button 
              type="text" 
              size="small" 
              icon={<EditOutlined />} 
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Dropdown menu={{ items: getSettingMenuItems(record) }} trigger={['click']}>
            <Button type="text" size="small" icon={<SettingOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ]

  const getVisibleSortableKeys = useCallback((nodes: TreeNode[]): string[] => {
    const keys: string[] = []
    const traverse = (items: TreeNode[]) => {
      items.forEach(item => {
        keys.push(item.key)
        if (item.children && expandedRowKeys.includes(item.key)) {
          traverse(item.children)
        }
      })
    }
    traverse(nodes)
    return keys
  }, [expandedRowKeys])

  const getTransferTargetTreeData = (type: string, excludeId: string) => {
    const categories = localCategories.filter(c => 
      c.type === type && c.id !== excludeId
    )
    const buildNode = (cat: TransactionCategory): { value: string; title: string; children?: any[] } => {
      const children = categories.filter(c => c.parentId === cat.id)
      return {
        value: cat.id,
        title: cat.name,
        children: children.length > 0 ? children.map(buildNode) : undefined,
      }
    }
    return categories.filter(c => !c.parentId).map(buildNode)
  }

  const getMoveTargetTreeData = (type: string, currentId: string, currentParentId?: string): MoveTreeDataNode[] => {
    const categories = localCategories.filter(c => 
      c.type === type && c.id !== currentId && !c.parentId
    )
    
    const topLevelOption: MoveTreeDataNode = {
      value: 'null',
      title: '作为一级分类',
      disabled: !currentParentId,
    }

    const categoryOptions: MoveTreeDataNode[] = categories.map(cat => ({
      value: cat.id,
      title: cat.name,
      disabled: cat.id === currentParentId,
    }))

    return [topLevelOption, ...categoryOptions]
  }

  const getCurrentPositionLabel = (category: TreeNode) => {
    if (!category.parentId) {
      return '一级分类'
    }
    const parent = localCategories.find(c => c.id === category.parentId)
    return parent ? `${parent.name}（二级分类）` : '二级分类'
  }

  const renderTable = (type: 'income' | 'expense' | 'transfer') => {
    const data = type === 'income' ? buildTreeData.incomeNodes 
               : type === 'expense' ? buildTreeData.expenseNodes 
               : buildTreeData.transferNodes
    const sortableKeys = getVisibleSortableKeys(data)

    return (
      <DndContext 
        sensors={sensors} 
        collisionDetection={pointerWithin}
        onDragEnd={(e) => handleDragEnd(e, type)}
        modifiers={[restrictToVerticalAxis]}
      >
        <SortableContext items={sortableKeys} strategy={verticalListSortingStrategy}>
          <Table
            dataSource={data}
            columns={getColumns()}
            rowKey="key"
            size="small"
            pagination={false}
            indentSize={20}
            expandedRowKeys={expandedRowKeys}
            onExpandedRowsChange={(keys) => setExpandedRowKeys(keys as string[])}
            expandable={{
              rowExpandable: (record) => !!(record.children && record.children.length > 0),
              expandIcon: () => null,
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
      key: 'income',
      label: '收入分类',
      children: renderTable('income'),
    },
    {
      key: 'expense',
      label: '支出分类',
      children: renderTable('expense'),
    },
    {
      key: 'transfer',
      label: '转账分类',
      children: renderTable('transfer'),
    },
  ]

  return (
    <>
      <Modal
        title="收支分类设置"
        open={visible}
        onCancel={onClose}
        footer={null}
        width={700}
      >
        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab} 
          items={tabItems}
          tabBarExtraContent={
            <Tooltip title="新增一级分类">
              <Button 
                type="primary" 
                size="small" 
                icon={<PlusOutlined />} 
                onClick={() => handleAdd()}
              />
            </Tooltip>
          }
        />
      </Modal>

      <Modal
        title={editingItem ? '编辑分类' : '新增分类'}
        open={formVisible}
        onOk={handleSubmit}
        onCancel={() => setFormVisible(false)}
        okText="确定"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
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
            <IconPicker placeholder="请选择图标" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="删除分类确认"
        open={deleteModalVisible}
        onCancel={() => setDeleteModalVisible(false)}
        onOk={handleDeleteConfirm}
        okText="确认删除"
        okButtonProps={{ danger: true, loading: deleteLoading }}
        cancelText="取消"
      >
        {deletingCategory && (
          <>
            <p><strong>分类名称：</strong>{deletingCategory.name}</p>
            <p><strong>分类类型：</strong>{deletingCategory.categoryType === 'income' ? '收入' : deletingCategory.categoryType === 'expense' ? '支出' : '转账'}</p>
            <p><strong>关联交易：</strong>{deleteTransactionCount} 笔</p>
            
            {deleteTransactionCount > 0 && (
              <>
                <Alert 
                  message="请选择交易处理方式" 
                  type="warning" 
                  style={{ marginBottom: 16 }} 
                />
                <Radio.Group 
                  value={deleteAction} 
                  onChange={(e) => setDeleteAction(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <div style={{ marginBottom: 12 }}>
                    <Radio value="transfer">转移到其他分类</Radio>
                    {deleteAction === 'transfer' && (
                      <TreeSelect
                        style={{ width: '100%', marginTop: 8, marginLeft: 24 }}
                        placeholder="请选择目标分类"
                        treeData={getTransferTargetTreeData(deletingCategory.categoryType, deletingCategory.id)}
                        value={transferTargetId}
                        onChange={setTransferTargetId}
                        treeNodeFilterProp="title"
                      />
                    )}
                  </div>
                  <div>
                    <Radio value="delete">同时删除关联交易</Radio>
                    {deleteAction === 'delete' && (
                      <Alert 
                        message="此操作不可恢复" 
                        type="error" 
                        style={{ marginTop: 8, marginLeft: 24 }} 
                        showIcon
                      />
                    )}
                  </div>
                </Radio.Group>
              </>
            )}
          </>
        )}
      </Modal>

      <Modal
        title="移动分类"
        open={moveModalVisible}
        onCancel={() => setMoveModalVisible(false)}
        onOk={handleMoveConfirm}
        okText="确认移动"
        okButtonProps={{ loading: moveLoading }}
        cancelText="取消"
      >
        {movingCategory && (
          <>
            <p><strong>当前分类：</strong>{movingCategory.name}</p>
            <p><strong>当前位置：</strong>{getCurrentPositionLabel(movingCategory)}</p>
            <Form layout="vertical">
              <Form.Item label="移动到">
                <TreeSelect
                  style={{ width: '100%' }}
                  placeholder="请选择目标位置"
                  treeData={getMoveTargetTreeData(movingCategory.categoryType, movingCategory.id, movingCategory.parentId)}
                  value={moveTargetId === null ? 'null' : moveTargetId}
                  onChange={(val) => setMoveTargetId(val === 'null' ? null : val)}
                  treeNodeFilterProp="title"
                  allowClear
                />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>
    </>
  )
}

export default TransactionCategoryModal
