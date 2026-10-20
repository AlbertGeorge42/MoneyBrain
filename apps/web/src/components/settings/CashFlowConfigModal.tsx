import React, { useMemo, useState } from 'react'
import { Table, theme } from 'antd'
import { ExportOutlined } from '@ant-design/icons'
import { useQueryClient } from '@tanstack/react-query'
import { useAccountCategories, useTransactionCategories } from '../../queries'
import { queryKeys } from '../../queries/keys'
import { accountCategoryApi, transactionCategoryApi } from '../../services/api'
import CategoryIcon from '../common/CategoryIcon'
import MoveModal from './MoveModal'
import ConfigModalLayout from './ConfigModalLayout'
import { renderExpandIcon, SettingDropdown, type CashTreeNode, type ActivityTreeNode, type MenuProps, type MoveTreeDataNode } from './shared'
import { useMoveModal } from './shared'
import { useNotify } from '../../hooks/useNotify'

interface CashFlowConfigModalProps {
  visible: boolean
  onClose: () => void
}

/** 资产分类分组的固定图标和颜色 */
const ASSET_GROUPS: Record<string, { label: string; icon: string; color: string }> = {
  cash: { label: '现金及等价物', icon: 'banknote', color: 'green' },
  investment: { label: '投资资产', icon: 'trending-up', color: 'blue' },
  other: { label: '其他资产', icon: 'archive', color: 'default' },
}

/** 交易活动分组的固定图标和颜色（与报表 CashFlowReport 的 ACTIVITY_META 保持一致） */
const ACTIVITY_GROUPS: Record<string, { label: string; icon: string; color: string }> = {
  operating: { label: '经营活动', icon: 'briefcase', color: 'blue' },
  investing: { label: '投资活动', icon: 'trending-up', color: 'purple' },
  financing: { label: '筹资活动', icon: 'landmark', color: 'orange' },
  unassigned: { label: '未分配', icon: 'help-circle', color: 'default' },
}

/** 与 AccountConfigModal / TransactionConfigModal 统一的名称列样式 */
const renderNameCell = (name: string, icon: string | null, color: string | null | undefined, isTopLevel: boolean, extra?: React.ReactNode) => (
  <div style={{ display: 'flex', alignItems: 'center', minHeight: 36, height: '100%' }}>
    <CategoryIcon name={icon} fallback="file-text" color={color} size={22} iconSize={13} />
    <span style={{ marginLeft: 10, fontWeight: isTopLevel ? 600 : 500, color: isTopLevel ? 'var(--mb-color-text-primary)' : 'var(--mb-color-text-secondary)' }}>{name}</span>
    {extra}
  </div>
)

const CashFlowConfigModal: React.FC<CashFlowConfigModalProps> = ({ visible, onClose }) => {
  const { token } = theme.useToken()
  const notify = useNotify()
  const queryClient = useQueryClient()
  const { data: accountCategories = [] } = useAccountCategories()
  const { data: transactionCategories = [] } = useTransactionCategories()
  const [expandedCashKeys, setExpandedCashKeys] = useState<string[]>([])
  const [expandedActivityKeys, setExpandedActivityKeys] = useState<string[]>([])
  const cashMoveModal = useMoveModal<CashTreeNode>()
  const activityMoveModal = useMoveModal<ActivityTreeNode>()

  const cashTreeData = useMemo(() => {
    const groupMap: Record<string, CashTreeNode[]> = { cash: [], investment: [], other: [] }
    // 只包含资产类型的账户分类，过滤掉负债类型
    accountCategories.filter(cat => cat.type === 'asset').forEach(cat => {
      const type = cat.isCashEquivalent ? 'cash' : cat.isInvestment ? 'investment' : 'other'
      groupMap[type].push({ id: cat.id, key: `cash-${cat.id}`, name: cat.name, icon: cat.icon, color: cat.color ?? null, isGroup: false, depth: 1 })
    })
    return Object.entries(ASSET_GROUPS).map(([key, config]) => ({ id: key, key: `group-${key}`, name: config.label, icon: config.icon, color: config.color, isGroup: true, groupKey: key, children: groupMap[key].length > 0 ? groupMap[key] : undefined, depth: 0 }))
  }, [accountCategories])

  const handleCashMoveConfirm = async () => {
    if (!cashMoveModal.item || cashMoveModal.targetId === undefined) { notify.warning('请选择目标资产类型'); return }
    cashMoveModal.setLoading(true)
    try {
      const updates: Record<string, boolean> = { cash: false, investment: false }
      if (cashMoveModal.targetId === 'cash') updates.cash = true
      else if (cashMoveModal.targetId === 'investment') updates.investment = true
      await accountCategoryApi.update(cashMoveModal.item.id, { isCashEquivalent: updates.cash, isInvestment: updates.investment })
      queryClient.invalidateQueries({ queryKey: queryKeys.accountCategories.all })
      notify.success('移动成功')
      cashMoveModal.close()
    } catch { notify.error('移动失败') } finally { cashMoveModal.setLoading(false) }
  }

  const getCashMoveTargetTreeData = (record: CashTreeNode): MoveTreeDataNode[] => {
    const cat = accountCategories.find(c => c.id === record.id)
    const currentType = cat?.isCashEquivalent ? 'cash' : cat?.isInvestment ? 'investment' : 'other'
    return Object.entries(ASSET_GROUPS).map(([key, config]) => ({ value: key, title: config.label, disabled: key === currentType }))
  }
  const getCashCurrentPosition = (record: CashTreeNode) => {
    const cat = accountCategories.find(c => c.id === record.id)
    const type = cat?.isCashEquivalent ? 'cash' : cat?.isInvestment ? 'investment' : 'other'
    return ASSET_GROUPS[type]?.label || '其他资产'
  }
  const getCashSettingMenuItems = (record: CashTreeNode): MenuProps['items'] => record.isGroup ? [] : [{ key: 'move', label: '移动到...', icon: <ExportOutlined />, onClick: () => cashMoveModal.open(record) }]
  const toggleCashExpand = (key: string) => setExpandedCashKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  const cashColumns = [
    { title: '', width: 30, render: (_: unknown, record: CashTreeNode) => renderExpandIcon(record, expandedCashKeys, toggleCashExpand, token.colorTextSecondary, `${token.fontSizeSM}px`) },
    { title: '分类名称', dataIndex: 'name', key: 'name', render: (name: string, record: CashTreeNode) => record.isGroup ? renderNameCell(name, record.icon, record.color, true, <span style={{ color: 'var(--mb-color-text-tertiary)', fontWeight: 400, fontSize: 'var(--mb-font-size-sm)', marginLeft: 4 }}>({record.children?.length || 0} 个分类)</span>) : renderNameCell(name, record.icon, record.color, false) },
    { title: '操作', key: 'action', width: 80, render: (_: unknown, record: CashTreeNode) => record.isGroup ? null : <SettingDropdown items={getCashSettingMenuItems(record)} /> },
  ]

  const buildActivityTreeData = useMemo(() => {
    const buildForType = (type: 'income' | 'expense' | 'transfer'): ActivityTreeNode[] => {
      // 只获取一级分类（parentId 为 null）
      const parentCats = transactionCategories.filter(c => c.type === type && !c.parentId)
      const buildNode = (cat: typeof transactionCategories[0], depth: number): ActivityTreeNode => ({
        id: cat.id, key: `activity-cat-${cat.id}`, name: cat.name, icon: cat.icon, color: cat.color ?? null, isGroup: false, cashFlowType: cat.cashFlowType, depth,
      })
      const groupMap: Record<string, ActivityTreeNode[]> = { operating: [], investing: [], financing: [], unassigned: [] }
      parentCats.forEach(cat => { const group = cat.cashFlowType || 'unassigned'; groupMap[group].push(buildNode(cat, 1)) })
      return Object.entries(ACTIVITY_GROUPS).map(([key, config]) => ({ id: key, key: `group-${key}-${type}`, name: config.label, icon: config.icon, color: config.color, isGroup: true, groupKey: key, children: groupMap[key].length > 0 ? groupMap[key] : undefined, depth: 0 }))
    }
    return { income: buildForType('income'), expense: buildForType('expense'), transfer: buildForType('transfer') }
  }, [transactionCategories])

  const handleActivityMoveConfirm = async () => {
    if (!activityMoveModal.item || activityMoveModal.targetId === undefined) { notify.warning('请选择目标活动类型'); return }
    activityMoveModal.setLoading(true)
    try {
      const newType = activityMoveModal.targetId === 'unassigned' ? null : activityMoveModal.targetId as 'operating' | 'investing' | 'financing'
      const children = transactionCategories.filter(c => c.parentId === activityMoveModal.item?.id)
      await Promise.all([transactionCategoryApi.update(activityMoveModal.item.id, { cashFlowType: newType }), ...children.map(c => transactionCategoryApi.update(c.id, { cashFlowType: newType }))])
      await queryClient.invalidateQueries({ queryKey: queryKeys.transactionCategories.all })
      notify.success(children.length > 0 ? `移动成功，已同时更新 ${children.length} 个子分类` : '移动成功')
      activityMoveModal.close()
    } catch { notify.error('移动失败') } finally { activityMoveModal.setLoading(false) }
  }

  const getActivityMoveTargetTreeData = (record: ActivityTreeNode): MoveTreeDataNode[] => {
    const currentGroup = record.cashFlowType || 'unassigned'
    return Object.entries(ACTIVITY_GROUPS).map(([key, config]) => ({ value: key, title: config.label, disabled: key === currentGroup }))
  }
  const getActivityCurrentPosition = (record: ActivityTreeNode) => ACTIVITY_GROUPS[record.cashFlowType || 'unassigned']?.label || '未分配'
  const getActivitySettingMenuItems = (record: ActivityTreeNode): MenuProps['items'] => record.isGroup || record.depth > 1 ? [] : [{ key: 'move', label: '移动到...', icon: <ExportOutlined />, onClick: () => activityMoveModal.open(record) }]
  const toggleActivityExpand = (key: string) => setExpandedActivityKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  const activityColumns = [
    { title: '', width: 30, render: (_: unknown, record: ActivityTreeNode) => renderExpandIcon(record, expandedActivityKeys, toggleActivityExpand, token.colorTextSecondary, `${token.fontSizeSM}px`) },
    { title: '分类名称', dataIndex: 'name', key: 'name', render: (name: string, record: ActivityTreeNode) => record.isGroup ? renderNameCell(name, record.icon, record.color, true, <span style={{ color: 'var(--mb-color-text-tertiary)', fontWeight: 400, fontSize: 'var(--mb-font-size-sm)', marginLeft: 4 }}>({record.children?.length || 0} 个分类)</span>) : renderNameCell(name, record.icon, record.color, false) },
    { title: '操作', key: 'action', width: 80, render: (_: unknown, record: ActivityTreeNode) => record.isGroup || record.depth > 1 ? null : <SettingDropdown items={getActivitySettingMenuItems(record)} /> },
  ]

  const renderActivityTable = (type: 'income' | 'expense' | 'transfer') => (
    <Table dataSource={buildActivityTreeData[type]} columns={activityColumns} rowKey="key" size="small" pagination={false} indentSize={20}
      expandedRowKeys={expandedActivityKeys} onExpandedRowsChange={(keys) => setExpandedActivityKeys(keys as string[])} expandable={{ rowExpandable: (r) => !!(r.children?.length), expandIcon: () => null }} />
  )

  const tabItems = [
    { key: 'asset-category', label: '资产分类', children: <Table dataSource={cashTreeData} columns={cashColumns} rowKey="key" size="small" pagination={false} indentSize={20} expandedRowKeys={expandedCashKeys} onExpandedRowsChange={(keys) => setExpandedCashKeys(keys as string[])} expandable={{ rowExpandable: (r) => !!(r.children?.length), expandIcon: () => null }} /> },
    { key: 'income-category', label: '收入分类', children: renderActivityTable('income') },
    { key: 'expense-category', label: '支出分类', children: renderActivityTable('expense') },
    { key: 'transfer-category', label: '转账分类', children: renderActivityTable('transfer') },
  ]

  return (
    <>
      <ConfigModalLayout title="现金流量表设置" visible={visible} onClose={onClose}
        tabs={{ items: tabItems }} />
      <MoveModal visible={cashMoveModal.visible} category={cashMoveModal.item ? { id: cashMoveModal.item.id, name: cashMoveModal.item.name, categoryType: 'income' as const, parentId: undefined } : null} targetId={cashMoveModal.targetId} loading={cashMoveModal.loading} targetTreeData={cashMoveModal.item ? getCashMoveTargetTreeData(cashMoveModal.item) : []} currentPositionLabel={cashMoveModal.item ? getCashCurrentPosition(cashMoveModal.item) : ''} onTargetChange={cashMoveModal.setTargetId} onConfirm={handleCashMoveConfirm} onCancel={cashMoveModal.close} />
      <MoveModal visible={activityMoveModal.visible} category={activityMoveModal.item ? { id: activityMoveModal.item.id, name: activityMoveModal.item.name, categoryType: 'income' as const, parentId: undefined } : null} targetId={activityMoveModal.targetId} loading={activityMoveModal.loading} targetTreeData={activityMoveModal.item ? getActivityMoveTargetTreeData(activityMoveModal.item) : []} currentPositionLabel={activityMoveModal.item ? getActivityCurrentPosition(activityMoveModal.item) : ''} onTargetChange={activityMoveModal.setTargetId} onConfirm={handleActivityMoveConfirm} onCancel={activityMoveModal.close} />
    </>
  )
}

export default CashFlowConfigModal
