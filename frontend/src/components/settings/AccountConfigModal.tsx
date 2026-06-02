import React, { useState, useEffect, useMemo } from 'react'
import { Modal, Table, Button, Form, message, Tabs, Tooltip, Dropdown, theme } from 'antd'
import { PlusOutlined, ExclamationCircleOutlined, SettingOutlined } from '@ant-design/icons'
import { useQueryClient } from '@tanstack/react-query'
import { useAccounts, useAccountCategories, useCreateAccount, useUpdateAccount, useDeleteAccount } from '../../queries'
import { queryKeys } from '../../queries/keys'
import { AccountCategory, Account, accountCategoryApi, accountApi } from '../../services/api'
import dayjs from 'dayjs'
import { DndContext, pointerWithin, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import DynamicIcon from '../common/DynamicIcon'
import CategoryForm from './CategoryForm'
import AccountForm from './AccountForm'
import MoveModal from './MoveModal'
import {
  useMoveModal,
  useSortableTable,
  SortableRow,
  createSettingMenuItems,
  renderExpandIcon,
  renderDragHandle,
} from './shared'
import type { AccountTreeNode, MoveTreeDataNode, MenuProps } from './shared'

interface Props {
  visible: boolean
  onClose: () => void
}

const isSortable = (id: string) => id?.startsWith('category-') || id?.startsWith('account-')
const AccountSortableRow = (props: any) => <SortableRow isSortable={isSortable} {...props} />

const AccountConfigModal: React.FC<Props> = ({ visible, onClose }) => {
  const { token } = theme.useToken()
  const queryClient = useQueryClient()
  const { data: accountCategories = [] } = useAccountCategories()
  const { data: accounts = [] } = useAccounts()
  const createAccountMutation = useCreateAccount()
  const updateAccountMutation = useUpdateAccount()
  const deleteAccountMutation = useDeleteAccount()

  const [activeTab, setActiveTab] = useState('asset')
  const [editingCategory, setEditingCategory] = useState<AccountCategory | null>(null)
  const [editingAccount, setEditingAccount] = useState<AccountTreeNode | null>(null)
  const [categoryFormVisible, setCategoryFormVisible] = useState(false)
  const [accountFormVisible, setAccountFormVisible] = useState(false)
  const [categoryForm] = Form.useForm()
  const [accountForm] = Form.useForm()
  const [localAccountCategories, setLocalAccountCategories] = useState<AccountCategory[]>([])
  const [localAccounts, setLocalAccounts] = useState<Account[]>([])

  const moveModal = useMoveModal<AccountTreeNode>()
  const { sensors, expandedRowKeys, setExpandedRowKeys, toggleExpand, getVisibleSortableKeys } = useSortableTable()

  useEffect(() => { setLocalAccountCategories(accountCategories) }, [accountCategories])
  useEffect(() => { setLocalAccounts(accounts) }, [accounts])

  const buildTreeData = useMemo(() => {
    const buildNode = (cat: AccountCategory, depth: number): AccountTreeNode => {
      const catAccounts = localAccounts.filter(a => a.categoryId === cat.id).sort((a, b) => a.sort - b.sort)
      const children: AccountTreeNode[] = catAccounts.map(a => ({
        id: a.id, key: `account-${a.id}`, name: a.name, icon: a.icon || 'wallet',
        type: 'account' as const, nodeType: a.type as 'asset' | 'liability',
        initialBalance: a.initialBalance, initialBalanceDate: a.initialBalanceDate,
        parentId: cat.id, sort: a.sort, depth: depth + 1,
      }))
      return {
        id: cat.id, key: `category-${cat.id}`, name: cat.name, icon: cat.icon || 'folder',
        type: 'category' as const, nodeType: cat.type as 'asset' | 'liability',
        parentId: undefined, sort: cat.sort,
        children: children.length > 0 ? children : undefined, depth,
      }
    }
    const assetNodes = localAccountCategories.filter(c => c.type === 'asset').sort((a, b) => a.sort - b.sort).map(c => buildNode(c, 0))
    const liabilityNodes = localAccountCategories.filter(c => c.type === 'liability').sort((a, b) => a.sort - b.sort).map(c => buildNode(c, 0))
    return { assetNodes, liabilityNodes }
  }, [localAccountCategories, localAccounts])

  const handleAddCategory = (type?: 'asset' | 'liability') => {
    setEditingCategory(null)
    categoryForm.resetFields()
    categoryForm.setFieldsValue({ type: type || 'asset' })
    setCategoryFormVisible(true)
  }

  const handleEditCategory = (record: AccountTreeNode) => {
    setEditingCategory({ id: record.id, name: record.name, type: record.nodeType!, icon: record.icon, parentId: null, sort: record.sort || 0 } as AccountCategory)
    categoryForm.setFieldsValue({ name: record.name, type: record.nodeType, icon: record.icon })
    setCategoryFormVisible(true)
  }

  const handleDeleteCategory = async (id: string) => {
    try {
      await accountCategoryApi.delete(id)
      message.success('删除成功')
      queryClient.invalidateQueries({ queryKey: queryKeys.accountCategories.all })
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
      queryClient.invalidateQueries({ queryKey: queryKeys.accountCategories.all })
    } catch { message.error('操作失败') }
  }

  const handleAddAccount = (categoryId: string) => {
    setEditingAccount(null)
    accountForm.resetFields()
    const category = accountCategories.find(c => c.id === categoryId)
    accountForm.setFieldsValue({ type: category?.type, categoryId, initialBalance: 0, initialBalanceDate: dayjs() })
    setAccountFormVisible(true)
  }

  const handleEditAccount = (record: AccountTreeNode) => {
    setEditingAccount(record)
    accountForm.setFieldsValue({
      name: record.name, type: record.nodeType, initialBalance: record.initialBalance,
      initialBalanceDate: record.initialBalanceDate ? dayjs(record.initialBalanceDate) : dayjs(), icon: record.icon,
    })
    setAccountFormVisible(true)
  }

  const handleDeleteAccount = async (id: string) => {
    try {
      const statsRes = await accountApi.getStats(id)
      const { transactionCount } = statsRes.data.data || {}
      if (transactionCount && transactionCount > 0) {
        Modal.confirm({
          title: '确认删除账户', icon: <ExclamationCircleOutlined />,
          content: <div><p>该账户下有 <strong style={{ color: token.colorError }}>{transactionCount}</strong> 条交易记录</p><p>删除账户将同时删除这些交易记录，此操作不可恢复！</p></div>,
          okText: '确认删除', okType: 'danger', cancelText: '取消',
          onOk: async () => {
            try {
              await deleteAccountMutation.mutateAsync({ id, force: true })
              message.success(`删除成功，已删除 ${transactionCount} 条交易记录`)
            } catch (error: any) { message.error(error.response?.data?.error?.message || '删除失败') }
          },
        })
      } else {
        await deleteAccountMutation.mutateAsync({ id })
        message.success('删除成功')
      }
    } catch (error: any) { message.error(error.response?.data?.error?.message || '删除失败') }
  }

  const handleAccountSubmit = async () => {
    try {
      const values = await accountForm.validateFields()
      const submitData: any = { name: values.name, type: values.type, icon: values.icon, initialBalanceDate: values.initialBalanceDate?.format('YYYY-MM-DD') }
      if (!editingAccount) submitData.categoryId = values.categoryId
      if (editingAccount) {
        if (values.initialBalance !== editingAccount.initialBalance) submitData.initialBalance = values.initialBalance
      } else {
        submitData.initialBalance = values.initialBalance
      }
      if (editingAccount) {
        await updateAccountMutation.mutateAsync({ id: editingAccount.id, data: submitData })
        message.success('更新成功')
      } else {
        await createAccountMutation.mutateAsync(submitData)
        message.success('创建成功')
      }
      setAccountFormVisible(false)
      accountForm.resetFields()
    } catch (error: any) { message.error(error.response?.data?.error?.message || '操作失败') }
  }

  const handleMoveConfirm = async () => {
    if (!moveModal.item) return
    if (moveModal.item.type !== 'account') {
      message.warning('分类无法移动')
      return
    }
    if (!moveModal.targetId) { message.warning('请选择目标分类'); return }
    moveModal.setLoading(true)
    try {
      await updateAccountMutation.mutateAsync({ id: moveModal.item.id, data: { categoryId: moveModal.targetId } })
      message.success('移动成功')
      moveModal.close()
    } catch (error: any) { message.error(error.response?.data?.error?.message || '移动失败') }
    finally { moveModal.setLoading(false) }
  }

  const getMoveTargetTreeData = (record: AccountTreeNode): MoveTreeDataNode[] => {
    const type = record.nodeType
    const categories = localAccountCategories.filter(c => c.type === type)
    return categories.map(cat => ({
      value: cat.id, title: cat.name, disabled: cat.id === record.parentId,
    }))
  }

  const getCurrentPositionLabelLocal = (record: AccountTreeNode): string => {
    if (record.type === 'account') {
      const category = localAccountCategories.find(c => c.id === record.parentId)
      return category ? category.name : '未分类'
    }
    return '一级分类'
  }

  const handleDragEnd = async (event: DragEndEvent, type: 'asset' | 'liability') => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeKey = String(active.id), overKey = String(over.id)
    const isCategoryDrag = activeKey.startsWith('category-'), isAccountDrag = activeKey.startsWith('account-')
    const isOverCategory = overKey.startsWith('category-'), isOverAccount = overKey.startsWith('account-')

    if (isCategoryDrag && isOverCategory) {
      const activeId = activeKey.replace('category-', ''), overId = overKey.replace('category-', '')
      const cats = localAccountCategories.filter(c => c.type === type).sort((a, b) => a.sort - b.sort)
      const oldIdx = cats.findIndex(c => c.id === activeId), newIdx = cats.findIndex(c => c.id === overId)
      if (oldIdx === -1 || newIdx === -1) return
      const reordered = arrayMove(cats, oldIdx, newIdx)
      setLocalAccountCategories(localAccountCategories.map(c => c.type === type ? { ...c, sort: reordered.findIndex(r => r.id === c.id) } : c))
      try {
        await accountCategoryApi.updateSort(reordered.map((c, i) => ({ id: c.id, sort: i, parentId: null })))
        message.success('排序更新成功')
      } catch { message.error('排序更新失败'); setLocalAccountCategories(accountCategories) }
    } else if (isAccountDrag && isOverAccount) {
      const activeId = activeKey.replace('account-', ''), overId = overKey.replace('account-', '')
      const activeAcc = localAccounts.find(a => a.id === activeId), overAcc = localAccounts.find(a => a.id === overId)
      if (!activeAcc || !overAcc || activeAcc.categoryId !== overAcc.categoryId) { message.warning('只能在同一分类下调整账户顺序'); return }
      const catAccs = localAccounts.filter(a => a.categoryId === activeAcc.categoryId).sort((a, b) => a.sort - b.sort)
      const oldIdx = catAccs.findIndex(a => a.id === activeId), newIdx = catAccs.findIndex(a => a.id === overId)
      if (oldIdx === -1 || newIdx === -1) return
      const reordered = arrayMove(catAccs, oldIdx, newIdx)
      setLocalAccounts(localAccounts.map(a => a.categoryId === activeAcc.categoryId ? { ...a, sort: reordered.findIndex(r => r.id === a.id) } : a))
      try {
        await accountApi.updateSort(reordered.map((a, i) => ({ id: a.id, sort: i, categoryId: activeAcc.categoryId })))
        message.success('账户排序更新成功')
      } catch { message.error('账户排序更新失败'); setLocalAccounts(accounts) }
    } else { message.warning('只能在同一类型内调整顺序') }
  }

  const getSettingMenuItems = (record: AccountTreeNode): MenuProps['items'] => createSettingMenuItems({
    onAddAccount: record.type === 'category' ? () => handleAddAccount(record.id!) : undefined,
    onEdit: () => record.type === 'category' ? handleEditCategory(record) : handleEditAccount(record),
    onMove: record.type === 'account' ? () => moveModal.open(record) : undefined,
    onDelete: () => record.type === 'category' ? handleDeleteCategory(record.id!) : handleDeleteAccount(record.id!),
    hasChildren: !!(record.children?.length),
    isAccount: record.type === 'account',
  })

  const getCategoryColumns = () => [
    { title: '', width: 30, render: (_: unknown, record: AccountTreeNode) => renderExpandIcon(record, expandedRowKeys, toggleExpand, token.colorTextSecondary, `${token.fontSizeSM}px`) },
    { title: '', width: 30, render: (_: unknown, record: AccountTreeNode) => renderDragHandle(record, isSortable) },
    { title: '名称', dataIndex: 'name', key: 'name', render: (text: string, record: AccountTreeNode) => <span><DynamicIcon name={record.icon} size={16} fallback={record.type === 'category' ? 'folder' : 'wallet'} /> {text}</span> },
    { title: '操作', key: 'action', width: 80, render: (_: unknown, record: AccountTreeNode) => <Dropdown menu={{ items: getSettingMenuItems(record) }} trigger={['click']}><Button type="text" size="small" icon={<SettingOutlined />} /></Dropdown> },
  ]

  const renderTable = (type: 'asset' | 'liability') => {
    const data = type === 'asset' ? buildTreeData.assetNodes : buildTreeData.liabilityNodes
    return (
      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={(e) => handleDragEnd(e, type)} modifiers={[restrictToVerticalAxis]}>
        <SortableContext items={getVisibleSortableKeys(data)} strategy={verticalListSortingStrategy}>
          <Table dataSource={data} columns={getCategoryColumns()} rowKey="key" pagination={false} size="small" indentSize={20}
            expandedRowKeys={expandedRowKeys} onExpandedRowsChange={(keys) => setExpandedRowKeys(keys as string[])}
            expandable={{ rowExpandable: (r) => !!(r.children?.length), expandIcon: () => null }}
            components={{ body: { row: AccountSortableRow } }} />
        </SortableContext>
      </DndContext>
    )
  }

  const tabItems = [
    { key: 'asset', label: '资产分类', children: renderTable('asset') },
    { key: 'liability', label: '负债分类', children: renderTable('liability') },
  ]

  return (
    <>
      <Modal title="账户分类管理" open={visible} onCancel={onClose} footer={null} width={700}>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems}
          tabBarExtraContent={<Tooltip title={activeTab === 'asset' ? '添加资产分类' : '添加负债分类'}><Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => handleAddCategory(activeTab as 'asset' | 'liability')} /></Tooltip>} />
      </Modal>
      <CategoryForm visible={categoryFormVisible} editing={!!editingCategory} form={categoryForm} onSubmit={handleCategorySubmit} onCancel={() => setCategoryFormVisible(false)} />
      <AccountForm visible={accountFormVisible} editing={!!editingAccount} form={accountForm} onSubmit={handleAccountSubmit} onCancel={() => setAccountFormVisible(false)} />
      <MoveModal visible={moveModal.visible} category={moveModal.item ? { id: moveModal.item.id, name: moveModal.item.name, categoryType: moveModal.item.nodeType as any, parentId: moveModal.item.parentId } : null}
        targetId={moveModal.targetId} loading={moveModal.loading} targetTreeData={moveModal.item ? getMoveTargetTreeData(moveModal.item) : []}
        currentPositionLabel={moveModal.item ? getCurrentPositionLabelLocal(moveModal.item) : ''} onTargetChange={moveModal.setTargetId} onConfirm={handleMoveConfirm} onCancel={moveModal.close} />
    </>
  )
}

export default AccountConfigModal
