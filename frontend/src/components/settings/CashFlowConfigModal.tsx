import React, { useMemo, useState } from 'react'
import { Modal, Table, Tabs, Tag, Dropdown, Button, theme } from 'antd'
import { SettingOutlined, ExportOutlined } from '@ant-design/icons'
import { useQueryClient } from '@tanstack/react-query'
import { useAccountCategories, useTransactionCategories } from '../../queries'
import { queryKeys } from '../../queries/keys'
import { accountCategoryApi, transactionCategoryApi } from '../../services/api'
import DynamicIcon from '../common/DynamicIcon'
import MoveModal from './MoveModal'
import { renderExpandIcon, type CashTreeNode, type ActivityTreeNode, type MenuProps, type MoveTreeDataNode } from './shared'
import { useMoveModal } from './shared'
import { useNotify } from '../../hooks/useNotify'

interface CashFlowConfigModalProps {
  visible: boolean
  onClose: () => void
}

const ASSET_GROUPS: Record<string, { label: string; color: string }> = {
  cash: { label: '现金及等价物', color: 'green' },
  investment: { label: '投资资产', color: 'blue' },
  other: { label: '其他资产', color: 'default' },
}

const ACTIVITY_GROUPS: Record<string, { label: string; color: string }> = {
  operating: { label: '经营活动', color: 'green' },
  investing: { label: '投资活动', color: 'blue' },
  financing: { label: '筹资活动', color: 'orange' },
  unassigned: { label: '未分配', color: 'default' },
}

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
    accountCategories.forEach(cat => {
      const type = cat.isCashEquivalent ? 'cash' : cat.isInvestment ? 'investment' : 'other'
      groupMap[type].push({ id: cat.id, key: `cash-${cat.id}`, name: cat.name, icon: cat.icon, isGroup: false, depth: 1 })
    })
    return Object.entries(ASSET_GROUPS).map(([key, config]) => ({ id: key, key: `group-${key}`, name: config.label, icon: null, isGroup: true, groupKey: key, children: groupMap[key].length > 0 ? groupMap[key] : undefined, depth: 0 }))
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
    { title: '分类名称', dataIndex: 'name', key: 'name', render: (name: string, record: CashTreeNode) => record.isGroup ? <strong><Tag color={ASSET_GROUPS[record.groupKey!]?.color}>{name}</Tag><span style={{ color: token.colorTextTertiary, fontWeight: 'normal', fontSize: `${token.fontSizeSM}px`, marginLeft: '4px' }}>({record.children?.length || 0} 个分类)</span></strong> : <span><DynamicIcon name={record.icon} size={16} fallback="folder" /> {name}</span> },
    { title: '操作', key: 'action', width: 80, render: (_: unknown, record: CashTreeNode) => record.isGroup ? null : <Dropdown menu={{ items: getCashSettingMenuItems(record) }} trigger={['click']}><Button type="text" size="small" icon={<SettingOutlined />} /></Dropdown> },
  ]

  const buildActivityTreeData = useMemo(() => {
    const buildForType = (type: 'income' | 'expense' | 'transfer'): ActivityTreeNode[] => {
      const parentCats = transactionCategories.filter(c => c.type === type && !c.parentId)
      const buildNode = (cat: typeof transactionCategories[0], depth: number): ActivityTreeNode => ({
        id: cat.id, key: `activity-cat-${cat.id}`, name: cat.name, icon: cat.icon, isGroup: false, cashFlowType: cat.cashFlowType, depth, childCount: transactionCategories.filter(c => c.parentId === cat.id).length,
        ...(transactionCategories.filter(c => c.parentId === cat.id).length > 0 ? { children: transactionCategories.filter(c => c.parentId === cat.id).map(c => buildNode(c, depth + 1)) } : {}),
      })
      const groupMap: Record<string, ActivityTreeNode[]> = { operating: [], investing: [], financing: [], unassigned: [] }
      parentCats.forEach(cat => { const group = cat.cashFlowType || 'unassigned'; groupMap[group].push(buildNode(cat, 1)) })
      return Object.entries(ACTIVITY_GROUPS).map(([key, config]) => ({ id: key, key: `group-${key}-${type}`, name: config.label, icon: null, isGroup: true, groupKey: key, children: groupMap[key].length > 0 ? groupMap[key] : undefined, depth: 0 }))
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
    { title: '分类名称', dataIndex: 'name', key: 'name', render: (name: string, record: ActivityTreeNode) => record.isGroup ? <strong><Tag color={ACTIVITY_GROUPS[record.groupKey!]?.color}>{name}</Tag><span style={{ color: token.colorTextTertiary, fontWeight: 'normal', fontSize: `${token.fontSizeSM}px`, marginLeft: '4px' }}>({record.children?.length || 0} 个分类)</span></strong> : <span><DynamicIcon name={record.icon} size={16} fallback="file-text" /> {name}{record.childCount && record.childCount > 0 ? <span style={{ color: token.colorTextTertiary, fontSize: `${token.fontSizeSM}px`, marginLeft: `${token.paddingXS}px` }}>({record.childCount} 个子分类)</span> : null}</span> },
    { title: '操作', key: 'action', width: 80, render: (_: unknown, record: ActivityTreeNode) => record.isGroup || record.depth > 1 ? null : <Dropdown menu={{ items: getActivitySettingMenuItems(record) }} trigger={['click']}><Button type="text" size="small" icon={<SettingOutlined />} /></Dropdown> },
  ]

  const renderActivityTable = (type: 'income' | 'expense' | 'transfer') => (
    <Table dataSource={buildActivityTreeData[type]} columns={activityColumns} rowKey="key" size="small" pagination={false} indentSize={20}
      expandedRowKeys={expandedActivityKeys} onExpandedRowsChange={(keys) => setExpandedActivityKeys(keys as string[])} expandable={{ rowExpandable: (r) => !!(r.children?.length), expandIcon: () => null }} />
  )

  const tabItems = [
    { key: 'asset-category', label: '资产分类管理', children: <div><p style={{ color: token.colorTextTertiary, marginBottom: 12 }}>将资产分类划分为现金及等价物、投资资产、其他资产三类，用于现金流量表计算。</p><Table dataSource={cashTreeData} columns={cashColumns} rowKey="key" size="small" pagination={false} indentSize={20} expandedRowKeys={expandedCashKeys} onExpandedRowsChange={(keys) => setExpandedCashKeys(keys as string[])} expandable={{ rowExpandable: (r) => !!(r.children?.length), expandIcon: () => null }} /></div> },
    { key: 'activity-type', label: '交易活动管理', children: <div><p style={{ color: token.colorTextTertiary, marginBottom: 12 }}>为一级收支分类配置现金流活动类型，移动后自动应用到所有子分类</p><Tabs items={[{ key: 'income', label: '收入分类', children: renderActivityTable('income') }, { key: 'expense', label: '支出分类', children: renderActivityTable('expense') }, { key: 'transfer', label: '转账分类', children: renderActivityTable('transfer') }]} /></div> },
  ]

  return (
    <>
      <Modal title="现金流量表设置" open={visible} onCancel={onClose} footer={null} width={700}><Tabs items={tabItems} /></Modal>
      <MoveModal visible={cashMoveModal.visible} category={cashMoveModal.item ? { id: cashMoveModal.item.id, name: cashMoveModal.item.name, categoryType: 'income' as const, parentId: undefined } : null} targetId={cashMoveModal.targetId} loading={cashMoveModal.loading} targetTreeData={cashMoveModal.item ? getCashMoveTargetTreeData(cashMoveModal.item) : []} currentPositionLabel={cashMoveModal.item ? getCashCurrentPosition(cashMoveModal.item) : ''} onTargetChange={cashMoveModal.setTargetId} onConfirm={handleCashMoveConfirm} onCancel={cashMoveModal.close} />
      <MoveModal visible={activityMoveModal.visible} category={activityMoveModal.item ? { id: activityMoveModal.item.id, name: activityMoveModal.item.name, categoryType: 'income' as const, parentId: undefined } : null} targetId={activityMoveModal.targetId} loading={activityMoveModal.loading} targetTreeData={activityMoveModal.item ? getActivityMoveTargetTreeData(activityMoveModal.item) : []} currentPositionLabel={activityMoveModal.item ? getActivityCurrentPosition(activityMoveModal.item) : ''} onTargetChange={activityMoveModal.setTargetId} onConfirm={handleActivityMoveConfirm} onCancel={activityMoveModal.close} />
    </>
  )
}

export default CashFlowConfigModal
