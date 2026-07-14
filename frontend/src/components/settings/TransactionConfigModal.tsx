import React, { useState, useEffect, useMemo } from 'react'
import { Modal, Table, Button, Form, Input, Tooltip } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useQueryClient } from '@tanstack/react-query'
import { useTransactionCategories } from '../../queries'
import { queryKeys } from '../../queries/keys'
import { TransactionCategory, transactionCategoryApi } from '../../services/api'
import CategoryIcon from '../common/CategoryIcon'
import IconPicker from '../common/IconPicker'
import ColorSwatchPicker from '../common/ColorSwatchPicker'
import DeleteConfirmModal from './DeleteConfirmModal'
import MoveModal from './MoveModal'
import ConfigModalLayout from './ConfigModalLayout'
import { DndContext, pointerWithin, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { useNotify } from '../../hooks/useNotify'
import { useMoveModal, useSortableTable, SortableRow, SettingDropdown, createSettingMenuItems, renderExpandIcon, renderDragHandle, buildMoveTargetTreeForCategory, getCurrentPositionLabel } from './shared'
import type { TransactionTreeNode, MoveTreeDataNode, MenuProps } from './shared'

interface Props { visible: boolean; onClose: () => void }

const TransactionConfigModal: React.FC<Props> = ({ visible, onClose }) => {
  const notify = useNotify()
  const queryClient = useQueryClient()
  const { data: transactionCategories = [] } = useTransactionCategories()
  const [activeTab, setActiveTab] = useState('income')
  const [editingItem, setEditingItem] = useState<TransactionCategory | null>(null)
  const [formVisible, setFormVisible] = useState(false)
  const [form] = Form.useForm()
  const [localCategories, setLocalCategories] = useState<TransactionCategory[]>([])
  const [deleteModalVisible, setDeleteModalVisible] = useState(false)
  const [deletingCategory, setDeletingCategory] = useState<TransactionTreeNode | null>(null)
  const [deleteTransactionCount, setDeleteTransactionCount] = useState(0)
  const [deleteAction, setDeleteAction] = useState<'transfer' | 'delete'>('transfer')
  const [transferTargetId, setTransferTargetId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const moveModal = useMoveModal<TransactionTreeNode>()
  const { sensors, expandedRowKeys, setExpandedRowKeys, toggleExpand, getVisibleSortableKeys } = useSortableTable()

  useEffect(() => { setLocalCategories(transactionCategories) }, [transactionCategories])

  const handleAdd = (parentId?: string) => {
    setEditingItem(null); form.resetFields()
    if (parentId) { const parent = transactionCategories.find(c => c.id === parentId); form.setFieldsValue({ type: parent?.type, parentId }) }
    else form.setFieldsValue({ type: activeTab })
    setFormVisible(true)
  }

  const handleEdit = (record: TransactionTreeNode) => {
    const category = transactionCategories.find(c => c.id === record.id)
    if (category) { setEditingItem(category); form.setFieldsValue({ name: category.name, icon: category.icon, parentId: category.parentId }); setFormVisible(true) }
  }

  const handleDeleteClick = async (record: TransactionTreeNode) => {
    try {
      const res = await transactionCategoryApi.getStats(record.id)
      if (res.data.success && res.data.data) {
        const { transactionCount, childrenCount } = res.data.data
        if (childrenCount > 0) {
          notify.warning('该分类下存在子分类，无法删除')
          return
        }
        setDeletingCategory(record)
        setDeleteTransactionCount(transactionCount)
        setDeleteAction('transfer')
        setTransferTargetId(null)
        setDeleteModalVisible(true)
      }
    } catch { notify.error('获取分类信息失败') }
  }

  const handleDeleteConfirm = async () => {
    if (!deletingCategory) return
    if (deleteTransactionCount > 0 && deleteAction === 'transfer' && !transferTargetId) { notify.warning('请选择转移目标分类'); return }
    setDeleteLoading(true)
    try {
      const params: { transferToCategoryId?: string; deleteTransactions?: boolean } = {}
      if (deleteTransactionCount > 0) {
        if (deleteAction === 'transfer') params.transferToCategoryId = transferTargetId!
        else params.deleteTransactions = true
      }
      const res = await transactionCategoryApi.delete(deletingCategory.id, params)
      if (res.data.success && res.data.data) {
        if (deleteTransactionCount === 0) {
          notify.success('删除成功')
        } else {
          notify.success(deleteAction === 'transfer' ? `删除成功，已转移 ${res.data.data.transferredTransactions || 0} 笔交易` : `删除成功，已删除 ${res.data.data.deletedTransactions || 0} 笔交易`)
        }
        setDeleteModalVisible(false); queryClient.invalidateQueries({ queryKey: queryKeys.transactionCategories.all })
      }
    } catch { notify.error('删除失败') }
    finally { setDeleteLoading(false) }
  }

  const handleMoveConfirm = async () => {
    if (!moveModal.item) return
    if (moveModal.targetId === undefined) { notify.warning('请选择目标位置'); return }
    moveModal.setLoading(true)
    try {
      const res = await transactionCategoryApi.move(moveModal.item.id, { newParentId: moveModal.targetId })
      if (res.data.success) { notify.success('移动成功'); moveModal.close(); queryClient.invalidateQueries({ queryKey: queryKeys.transactionCategories.all }) }
    } catch { notify.error('移动失败') }
    finally { moveModal.setLoading(false) }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (editingItem) { await transactionCategoryApi.update(editingItem.id, values); notify.success('更新成功') }
      else { await transactionCategoryApi.create(values); notify.success('创建成功') }
      setFormVisible(false); queryClient.invalidateQueries({ queryKey: queryKeys.transactionCategories.all })
    } catch { notify.error('操作失败') }
  }

  const handleDragEnd = async (event: DragEndEvent, type: 'income' | 'expense' | 'transfer') => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeId = String(active.id).replace('category-', ''), overId = String(over.id).replace('category-', '')
    const activeCat = localCategories.find(c => c.id === activeId), overCat = localCategories.find(c => c.id === overId)
    if (!activeCat || !overCat) return
    const isTopLevel = !activeCat.parentId && !overCat.parentId, isSecondLevel = activeCat.parentId && overCat.parentId
    if (!isTopLevel && !isSecondLevel) { notify.warning('只能在同一层级内调整顺序'); return }
    if (isSecondLevel && activeCat.parentId !== overCat.parentId) { notify.warning('只能在同一父分类下调整子分类顺序'); return }
    if (isTopLevel) {
      const cats = localCategories.filter(c => c.type === type && !c.parentId).sort((a, b) => a.sort - b.sort)
      const oldIdx = cats.findIndex(c => c.id === activeId), newIdx = cats.findIndex(c => c.id === overId)
      if (oldIdx === -1 || newIdx === -1) return
      const reordered = arrayMove(cats, oldIdx, newIdx)
      setLocalCategories(localCategories.map(c => c.type === type && !c.parentId ? { ...c, sort: reordered.findIndex(r => r.id === c.id) } : c))
      try { await transactionCategoryApi.updateSort(reordered.map((c, i) => ({ id: c.id, sort: i, parentId: null }))); notify.success('排序更新成功') }
      catch { notify.error('排序更新失败'); setLocalCategories(transactionCategories) }
    } else {
      const sibs = localCategories.filter(c => c.parentId === activeCat.parentId).sort((a, b) => a.sort - b.sort)
      const oldIdx = sibs.findIndex(c => c.id === activeId), newIdx = sibs.findIndex(c => c.id === overId)
      if (oldIdx === -1 || newIdx === -1) return
      const reordered = arrayMove(sibs, oldIdx, newIdx)
      setLocalCategories(localCategories.map(c => c.parentId === activeCat.parentId ? { ...c, sort: reordered.findIndex(r => r.id === c.id) } : c))
      try { await transactionCategoryApi.updateSort(reordered.map((c, i) => ({ id: c.id, sort: i, parentId: activeCat.parentId }))); notify.success('子分类排序更新成功') }
      catch { notify.error('子分类排序更新失败'); setLocalCategories(transactionCategories) }
    }
  }

  const buildTreeData = useMemo(() => {
    const buildNode = (cat: TransactionCategory, depth: number): TransactionTreeNode => {
      const children = localCategories.filter(c => c.parentId === cat.id).sort((a, b) => a.sort - b.sort).map(c => buildNode(c, depth + 1))
      return { id: cat.id, key: `category-${cat.id}`, name: cat.name, icon: cat.icon, color: cat.color ?? null, type: 'category' as const, categoryType: cat.type as 'income' | 'expense' | 'transfer', parentId: cat.parentId || undefined, sort: cat.sort, children: children.length > 0 ? children : undefined, depth }
    }
    return {
      incomeNodes: localCategories.filter(c => c.type === 'income' && !c.parentId).sort((a, b) => a.sort - b.sort).map(c => buildNode(c, 0)),
      expenseNodes: localCategories.filter(c => c.type === 'expense' && !c.parentId).sort((a, b) => a.sort - b.sort).map(c => buildNode(c, 0)),
      transferNodes: localCategories.filter(c => c.type === 'transfer' && !c.parentId).sort((a, b) => a.sort - b.sort).map(c => buildNode(c, 0)),
    }
  }, [localCategories])

  const getSettingMenuItems = (record: TransactionTreeNode): MenuProps['items'] => createSettingMenuItems({
    onAddSub: !record.parentId ? () => handleAdd(record.id) : undefined,
    onEdit: () => handleEdit(record),
    onMove: () => moveModal.open(record),
    onDelete: () => handleDeleteClick(record),
    hasChildren: !!(record.children?.length),
    canMove: !record.parentId || !record.children?.length,
  })

  const getColumns = () => [
    { title: '', width: 30, render: (_: unknown, record: TransactionTreeNode) => renderExpandIcon(record, expandedRowKeys, toggleExpand) },
    { title: '', width: 30, render: (_: unknown, record: TransactionTreeNode) => renderDragHandle(record, (id: string) => id?.startsWith('category-')) },
    { title: '名称', dataIndex: 'name', key: 'name', render: (text: string, record: TransactionTreeNode) => {
      const isTopLevel = record.depth === 0
      // 设置页面始终使用统一小图标，层级感通过字重/颜色表达
      return (
        <div style={{ display: 'flex', alignItems: 'center', minHeight: 36, height: '100%' }}>
          <CategoryIcon name={record.icon} fallback="file-text" color={record.color} size={22} iconSize={13} />
          <span style={{ marginLeft: 10, fontWeight: isTopLevel ? 600 : 500, color: isTopLevel ? 'var(--mb-color-text-primary)' : 'var(--mb-color-text-secondary)' }}>{text}</span>
        </div>
      )
    } },
    { title: '操作', key: 'action', width: 80, render: (_: unknown, record: TransactionTreeNode) => <SettingDropdown items={getSettingMenuItems(record)} /> },
  ]

  const getTransferTargetTreeData = (type: string, excludeId: string) => {
    const cats = localCategories.filter(c => c.type === type && c.id !== excludeId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 递归树形结构类型定义复杂，使用 any 简化
    const buildNode = (cat: TransactionCategory): any => ({
      value: cat.id, title: cat.name, children: cats.filter(c => c.parentId === cat.id).length > 0 ? cats.filter(c => c.parentId === cat.id).map(buildNode) : undefined,
    })
    return cats.filter(c => !c.parentId).map(buildNode)
  }

  const getMoveTargetTreeData = (type: string, currentId: string, currentParentId?: string): MoveTreeDataNode[] => buildMoveTargetTreeForCategory(localCategories.filter(c => c.type === type), currentId, currentParentId)
  const getCurrentPositionLabelLocal = (cat: TransactionTreeNode) => getCurrentPositionLabel(cat.parentId, new Map(localCategories.map(c => [c.id, { name: c.name }])))

  const renderTable = (type: 'income' | 'expense' | 'transfer') => {
    const data = type === 'income' ? buildTreeData.incomeNodes : type === 'expense' ? buildTreeData.expenseNodes : buildTreeData.transferNodes
    return (
      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={(e) => handleDragEnd(e, type)} modifiers={[restrictToVerticalAxis]}>
        <SortableContext items={getVisibleSortableKeys(data)} strategy={verticalListSortingStrategy}>
          <Table dataSource={data} columns={getColumns()} rowKey="key" size="small" pagination={false} indentSize={20}
            expandedRowKeys={expandedRowKeys} onExpandedRowsChange={(keys) => setExpandedRowKeys(keys as string[])}
            expandable={{ rowExpandable: (r) => !!(r.children?.length), expandIcon: () => null }}
            components={{ body: { row: SortableRow } }} />
        </SortableContext>
      </DndContext>
    )
  }

  const tabItems = [
    { key: 'income', label: '收入分类', children: renderTable('income') },
    { key: 'expense', label: '支出分类', children: renderTable('expense') },
    { key: 'transfer', label: '转账分类', children: renderTable('transfer') },
  ]

  return (
    <>
      <ConfigModalLayout title="收支分类设置" visible={visible} onClose={onClose}
        tabs={{ items: tabItems, activeKey: activeTab, onChange: setActiveTab,
          tabBarExtraContent: <Tooltip title="新增一级分类"><Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => handleAdd()} /></Tooltip> }} />
      <Modal title={editingItem ? '编辑分类' : '新增分类'} open={formVisible} onOk={handleSubmit} onCancel={() => setFormVisible(false)} okText="确定" cancelText="取消">
        <Form form={form} layout="vertical">
          <Form.Item name="type" hidden><Input /></Form.Item>
          <Form.Item name="parentId" hidden><Input /></Form.Item>
          <Form.Item name="name" label="分类名称" rules={[{ required: true, message: '请输入分类名称' }]}><Input placeholder="请输入分类名称" /></Form.Item>
          <Form.Item name="icon" label="图标"><IconPicker placeholder="请选择图标" /></Form.Item>
          <Form.Item name="color" label="颜色" extra="用于报表中分类图标的背景色（不选则使用中性色）"><ColorSwatchPicker allowClear /></Form.Item>
        </Form>
      </Modal>
      <DeleteConfirmModal visible={deleteModalVisible} category={deletingCategory} transactionCount={deleteTransactionCount} deleteAction={deleteAction}
        transferTargetId={transferTargetId} loading={deleteLoading} transferTargetTreeData={deletingCategory ? getTransferTargetTreeData(deletingCategory.categoryType, deletingCategory.id) : []}
        onDeleteActionChange={setDeleteAction} onTransferTargetChange={setTransferTargetId} onConfirm={handleDeleteConfirm} onCancel={() => setDeleteModalVisible(false)} />
      <MoveModal visible={moveModal.visible} category={moveModal.item} targetId={moveModal.targetId} loading={moveModal.loading}
        targetTreeData={moveModal.item ? getMoveTargetTreeData(moveModal.item.categoryType, moveModal.item.id, moveModal.item.parentId) : []}
        currentPositionLabel={moveModal.item ? getCurrentPositionLabelLocal(moveModal.item) : ''} onTargetChange={moveModal.setTargetId} onConfirm={handleMoveConfirm} onCancel={moveModal.close} />
    </>
  )
}

export default TransactionConfigModal
