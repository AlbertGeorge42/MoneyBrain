import React, { useState, useEffect, useMemo } from 'react'
import { Modal, Tabs, Table, Button, Form, Input, Space, message, Tooltip, Popconfirm } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, HolderOutlined, FolderAddOutlined, RightOutlined, DownOutlined } from '@ant-design/icons'
import { useStore } from '../stores'
import { Category, categoryApi } from '../services/api'
import DynamicIcon from './DynamicIcon'
import IconPicker from './IconPicker'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'

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

const TransactionCategoryModal: React.FC<Props> = ({ visible, onClose }) => {
  const { categories, fetchCategories } = useStore()

  const [activeTab, setActiveTab] = useState('income')
  const [editingItem, setEditingItem] = useState<Category | null>(null)
  const [formVisible, setFormVisible] = useState(false)
  const [form] = Form.useForm()
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([])
  
  // 本地排序状态，用于动画
  const [localCategories, setLocalCategories] = useState<Category[]>([])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  useEffect(() => {
    if (visible) {
      fetchCategories()
    }
  }, [visible])

  // 同步本地状态
  useEffect(() => {
    setLocalCategories(categories)
  }, [categories])

  const handleAdd = (parentId?: string) => {
    setEditingItem(null)
    form.resetFields()
    if (parentId) {
      const parent = categories.find(c => c.id === parentId)
      form.setFieldsValue({ type: parent?.type, parentId })
    } else {
      form.setFieldsValue({ type: activeTab })
    }
    setFormVisible(true)
  }

  const handleEdit = (record: Category) => {
    setEditingItem(record)
    form.setFieldsValue({
      name: record.name,
      icon: record.icon,
      parentId: record.parentId,
    })
    setFormVisible(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await categoryApi.delete(id)
      message.success('删除成功')
      fetchCategories()
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || '删除失败')
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (editingItem) {
        await categoryApi.update(editingItem.id, values)
        message.success('更新成功')
      } else {
        await categoryApi.create(values)
        message.success('创建成功')
      }
      setFormVisible(false)
      fetchCategories()
    } catch (error) {
      message.error('操作失败')
    }
  }

  // 拖拽排序
  const handleDragEnd = async (event: DragEndEvent, type: 'income' | 'expense' | 'transfer') => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = String(active.id).replace('category-', '')
    const overId = String(over.id).replace('category-', '')

    // 获取当前类型的一级分类（已排序）
    const typeCategories = localCategories
      .filter(c => c.type === type && !c.parentId)
      .sort((a, b) => a.sort - b.sort)
    
    const oldIndex = typeCategories.findIndex(c => c.id === activeId)
    const newIndex = typeCategories.findIndex(c => c.id === overId)

    if (oldIndex === -1 || newIndex === -1) return

    // 先更新本地状态以显示动画
    const reorderedCategories = arrayMove(typeCategories, oldIndex, newIndex)
    const updatedLocalCategories = localCategories.map(cat => {
      if (cat.type === type && !cat.parentId) {
        const newIndexInReordered = reorderedCategories.findIndex(c => c.id === cat.id)
        return { ...cat, sort: newIndexInReordered }
      }
      return cat
    })
    setLocalCategories(updatedLocalCategories)

    // 然后调用 API 保存
    const items = reorderedCategories.map((c, index) => ({
      id: c.id,
      sort: index,
      parentId: null,
    }))

    try {
      await categoryApi.updateSort(items)
      fetchCategories()
      message.success('排序更新成功')
    } catch (error) {
      message.error('排序更新失败')
      // 失败时恢复原状态
      setLocalCategories(categories)
    }
  }

  // 构建树形数据（与 AccountCategoryModal 保持一致）
  const buildTreeData = useMemo(() => {
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
    }

    const buildCategoryNode = (category: Category, allCategories: Category[]): TreeNode => {
      const childCategories = allCategories.filter(c => c.parentId === category.id).sort((a, b) => a.sort - b.sort)
      
      const children: TreeNode[] = childCategories.map(c => buildCategoryNode(c, allCategories))

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
      }
    }

    const incomeCategories = localCategories.filter(c => c.type === 'income' && !c.parentId).sort((a, b) => a.sort - b.sort)
    const expenseCategories = localCategories.filter(c => c.type === 'expense' && !c.parentId).sort((a, b) => a.sort - b.sort)
    const transferCategories = localCategories.filter(c => c.type === 'transfer' && !c.parentId).sort((a, b) => a.sort - b.sort)

    const incomeNodes = incomeCategories.map(c => buildCategoryNode(c, localCategories))
    const expenseNodes = expenseCategories.map(c => buildCategoryNode(c, localCategories))
    const transferNodes = transferCategories.map(c => buildCategoryNode(c, localCategories))

    return { incomeNodes, expenseNodes, transferNodes }
  }, [localCategories])

  // 切换展开状态
  const toggleExpand = (recordKey: string) => {
    setExpandedRowKeys(prev => 
      prev.includes(recordKey) 
        ? prev.filter(k => k !== recordKey)
        : [...prev, recordKey]
    )
  }

  // 表格列定义
  const getColumns = () => [
    {
      title: '',
      width: 30,
      render: (_: unknown, record: any) => {
        // 展开图标列：只有有子分类的行才显示
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
        if (record.type === 'category' && !record.parentId) {
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
          <DynamicIcon name={record.icon} size={16} fallback="file-text" /> {text}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: unknown, record: any) => (
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
          <Popconfirm
            title="确定要删除此分类吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // 获取所有可排序的 key（只包含一级分类）
  const getSortableKeys = (nodes: any[]) => {
    return nodes.filter(n => n.type === 'category' && !n.parentId).map(n => n.key)
  }

  const renderTable = (type: 'income' | 'expense' | 'transfer') => {
    const data = type === 'income' ? buildTreeData.incomeNodes 
               : type === 'expense' ? buildTreeData.expenseNodes 
               : buildTreeData.transferNodes
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
        <div style={{ marginBottom: 12 }}>
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => handleAdd()}>
            新增一级分类
          </Button>
        </div>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
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
    </>
  )
}

export default TransactionCategoryModal
