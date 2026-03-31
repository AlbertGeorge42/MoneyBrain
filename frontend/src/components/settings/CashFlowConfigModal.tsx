import React, { useEffect, useState, useMemo } from 'react'
import { Modal, Table, message, Tabs, Spin, Dropdown, Button, Tag } from 'antd'
import { SettingOutlined, ExportOutlined } from '@ant-design/icons'
import { useStore } from '../../stores'
import { transactionCategoryApi } from '../../services/api'
import DynamicIcon from '../common/DynamicIcon'
import MoveModal from './MoveModal'
import { useMoveModal, renderExpandIcon } from './shared'
import type { CashTreeNode, ActivityTreeNode, MoveTreeDataNode, MenuProps } from './shared'

interface Props { visible: boolean; onClose: () => void }

const CASH_GROUPS = { cash: { key: 'cash', label: '现金及等价物' }, nonCash: { key: 'nonCash', label: '非现金资产' } }
const ACTIVITY_GROUPS: Record<string, { key: string; label: string; color: string }> = {
  operating: { key: 'operating', label: '经营活动', color: 'green' },
  investing: { key: 'investing', label: '投资活动', color: 'blue' },
  financing: { key: 'financing', label: '筹资活动', color: 'orange' },
  unassigned: { key: 'unassigned', label: '未分配', color: 'default' },
}

const CashFlowConfigModal: React.FC<Props> = ({ visible, onClose }) => {
  const { accountCategories, transactionCategories, fetchAccountCategories, fetchTransactionCategories, updateAccountCategoryCashEquivalent } = useStore()
  const [loading, setLoading] = useState(false)
  const [expandedCashKeys, setExpandedCashKeys] = useState<string[]>(['group-cash', 'group-nonCash'])
  const [expandedActivityKeys, setExpandedActivityKeys] = useState<string[]>(['group-operating', 'group-investing', 'group-financing', 'group-unassigned'])
  const cashMoveModal = useMoveModal<CashTreeNode>()
  const activityMoveModal = useMoveModal<ActivityTreeNode>()

  useEffect(() => { if (visible) { setLoading(true); Promise.all([fetchAccountCategories(), fetchTransactionCategories()]).finally(() => setLoading(false)) } }, [visible])

  const cashTreeData = useMemo((): CashTreeNode[] => {
    const assetCats = accountCategories.filter(c => c.type === 'asset' && !c.parentId)
    const buildNode = (cat: typeof accountCategories[0], depth: number): CashTreeNode => ({
      id: cat.id, key: `cash-cat-${cat.id}`, name: cat.name, icon: cat.icon, isGroup: false, depth,
      ...(accountCategories.filter(c => c.parentId === cat.id).length > 0 ? { children: accountCategories.filter(c => c.parentId === cat.id).map(c => buildNode(c, depth + 1)) } : {}),
    })
    return [
      { id: 'cash', key: 'group-cash', name: CASH_GROUPS.cash.label, icon: null, isGroup: true, groupKey: 'cash', depth: 0, children: assetCats.filter(c => c.isCashEquivalent).map(c => buildNode(c, 1)) || undefined },
      { id: 'nonCash', key: 'group-nonCash', name: CASH_GROUPS.nonCash.label, icon: null, isGroup: true, groupKey: 'nonCash', depth: 0, children: assetCats.filter(c => !c.isCashEquivalent).map(c => buildNode(c, 1)) || undefined },
    ]
  }, [accountCategories])

  const handleCashMoveConfirm = async () => {
    if (!cashMoveModal.item || cashMoveModal.targetId === undefined) { message.warning('请选择目标位置'); return }
    cashMoveModal.setLoading(true)
    try { await updateAccountCategoryCashEquivalent(cashMoveModal.item.id, cashMoveModal.targetId === 'cash'); message.success('移动成功'); cashMoveModal.close() }
    catch { message.error('移动失败') } finally { cashMoveModal.setLoading(false) }
  }

  const getCashMoveTargetTreeData = (record: CashTreeNode): MoveTreeDataNode[] => {
    const currentIsCash = accountCategories.find(c => c.id === record.id)?.isCashEquivalent
    return [{ value: 'cash', title: CASH_GROUPS.cash.label, disabled: !!currentIsCash }, { value: 'nonCash', title: CASH_GROUPS.nonCash.label, disabled: !currentIsCash }]
  }
  const getCashCurrentPosition = (record: CashTreeNode) => accountCategories.find(c => c.id === record.id)?.isCashEquivalent ? CASH_GROUPS.cash.label : CASH_GROUPS.nonCash.label
  const getCashSettingMenuItems = (record: CashTreeNode): MenuProps['items'] => record.isGroup ? [] : [{ key: 'move', label: '移动到...', icon: <ExportOutlined />, onClick: () => cashMoveModal.open(record) }]
  const toggleCashExpand = (key: string) => setExpandedCashKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  const cashColumns = [
    { title: '', width: 30, render: (_: unknown, record: CashTreeNode) => renderExpandIcon(record, expandedCashKeys, toggleCashExpand) },
    { title: '分类名称', dataIndex: 'name', key: 'name', render: (name: string, record: CashTreeNode) => record.isGroup ? <strong>{name}<span style={{ color: '#999', fontWeight: 'normal', fontSize: 12, marginLeft: 8 }}>({record.children?.length || 0} 个分类)</span></strong> : <span><DynamicIcon name={record.icon} size={16} fallback="folder" /> {name}</span> },
    { title: '操作', key: 'action', width: 80, render: (_: unknown, record: CashTreeNode) => record.isGroup ? null : <Dropdown menu={{ items: getCashSettingMenuItems(record) }} trigger={['click']}><Button type="text" size="small" icon={<SettingOutlined />} /></Dropdown> },
  ]

  const buildActivityTreeData = useMemo(() => {
    const buildForType = (type: 'income' | 'expense'): ActivityTreeNode[] => {
      const parentCats = transactionCategories.filter(c => c.type === type && !c.parentId)
      const buildNode = (cat: typeof transactionCategories[0], depth: number): ActivityTreeNode => ({
        id: cat.id, key: `activity-cat-${cat.id}`, name: cat.name, icon: cat.icon, isGroup: false, cashFlowType: cat.cashFlowType, depth, childCount: transactionCategories.filter(c => c.parentId === cat.id).length,
        ...(transactionCategories.filter(c => c.parentId === cat.id).length > 0 ? { children: transactionCategories.filter(c => c.parentId === cat.id).map(c => buildNode(c, depth + 1)) } : {}),
      })
      const groupMap: Record<string, ActivityTreeNode[]> = { operating: [], investing: [], financing: [], unassigned: [] }
      parentCats.forEach(cat => { const group = cat.cashFlowType || 'unassigned'; groupMap[group].push(buildNode(cat, 1)) })
      return Object.entries(ACTIVITY_GROUPS).map(([key, config]) => ({ id: key, key: `group-${key}`, name: config.label, icon: null, isGroup: true, groupKey: key, children: groupMap[key].length > 0 ? groupMap[key] : undefined, depth: 0 }))
    }
    return { income: buildForType('income'), expense: buildForType('expense') }
  }, [transactionCategories])

  const handleActivityMoveConfirm = async () => {
    if (!activityMoveModal.item || activityMoveModal.targetId === undefined) { message.warning('请选择目标活动类型'); return }
    activityMoveModal.setLoading(true)
    try {
      const newType = activityMoveModal.targetId === 'unassigned' ? null : activityMoveModal.targetId as 'operating' | 'investing' | 'financing'
      const children = transactionCategories.filter(c => c.parentId === activityMoveModal.item?.id)
      await Promise.all([transactionCategoryApi.update(activityMoveModal.item.id, { cashFlowType: newType }), ...children.map(c => transactionCategoryApi.update(c.id, { cashFlowType: newType }))])
      await fetchTransactionCategories()
      message.success(children.length > 0 ? `移动成功，已同时更新 ${children.length} 个子分类` : '移动成功')
      activityMoveModal.close()
    } catch { message.error('移动失败') } finally { activityMoveModal.setLoading(false) }
  }

  const getActivityMoveTargetTreeData = (record: ActivityTreeNode): MoveTreeDataNode[] => {
    const currentGroup = record.cashFlowType || 'unassigned'
    return Object.entries(ACTIVITY_GROUPS).map(([key, config]) => ({ value: key, title: config.label, disabled: key === currentGroup }))
  }
  const getActivityCurrentPosition = (record: ActivityTreeNode) => ACTIVITY_GROUPS[record.cashFlowType || 'unassigned']?.label || '未分配'
  const getActivitySettingMenuItems = (record: ActivityTreeNode): MenuProps['items'] => record.isGroup || record.depth > 1 ? [] : [{ key: 'move', label: '移动到...', icon: <ExportOutlined />, onClick: () => activityMoveModal.open(record) }]
  const toggleActivityExpand = (key: string) => setExpandedActivityKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  const activityColumns = [
    { title: '', width: 30, render: (_: unknown, record: ActivityTreeNode) => renderExpandIcon(record, expandedActivityKeys, toggleActivityExpand) },
    { title: '分类名称', dataIndex: 'name', key: 'name', render: (name: string, record: ActivityTreeNode) => record.isGroup ? <strong><Tag color={ACTIVITY_GROUPS[record.groupKey!]?.color}>{name}</Tag><span style={{ color: '#999', fontWeight: 'normal', fontSize: 12, marginLeft: 4 }}>({record.children?.length || 0} 个分类)</span></strong> : <span><DynamicIcon name={record.icon} size={16} fallback="file-text" /> {name}{record.childCount && record.childCount > 0 ? <span style={{ color: '#999', fontSize: 12, marginLeft: 8 }}>({record.childCount} 个子分类)</span> : null}</span> },
    { title: '操作', key: 'action', width: 80, render: (_: unknown, record: ActivityTreeNode) => record.isGroup || record.depth > 1 ? null : <Dropdown menu={{ items: getActivitySettingMenuItems(record) }} trigger={['click']}><Button type="text" size="small" icon={<SettingOutlined />} /></Dropdown> },
  ]

  const renderActivityTable = (type: 'income' | 'expense') => (
    <Table dataSource={type === 'income' ? buildActivityTreeData.income : buildActivityTreeData.expense} columns={activityColumns} rowKey="key" size="small" pagination={false} indentSize={20}
      expandedRowKeys={expandedActivityKeys} onExpandedRowsChange={(keys) => setExpandedActivityKeys(keys as string[])} expandable={{ rowExpandable: (r) => !!(r.children?.length), expandIcon: () => null }} />
  )

  const tabItems = [
    { key: 'cash-equivalent', label: '现金等价物配置', children: <div><p style={{ color: '#666', marginBottom: 12 }}>标记为现金等价物的账户分类将纳入现金流量表统计。通过设置菜单移动分类到不同分组。</p><Table dataSource={cashTreeData} columns={cashColumns} rowKey="key" size="small" pagination={false} indentSize={20} expandedRowKeys={expandedCashKeys} onExpandedRowsChange={(keys) => setExpandedCashKeys(keys as string[])} expandable={{ rowExpandable: (r) => !!(r.children?.length), expandIcon: () => null }} /></div> },
    { key: 'activity-type', label: '活动类型配置', children: <div><p style={{ color: '#666', marginBottom: 12 }}>为一级收支分类配置现金流活动类型，移动后自动应用到所有子分类</p><Tabs items={[{ key: 'income', label: '收入分类', children: renderActivityTable('income') }, { key: 'expense', label: '支出分类', children: renderActivityTable('expense') }]} /></div> },
  ]

  return (
    <>
      <Modal title="现金流量表设置" open={visible} onCancel={onClose} footer={null} width={700}><Spin spinning={loading}><Tabs items={tabItems} /></Spin></Modal>
      <MoveModal visible={cashMoveModal.visible} category={cashMoveModal.item ? { id: cashMoveModal.item.id, name: cashMoveModal.item.name, categoryType: 'income' as any, parentId: undefined } : null} targetId={cashMoveModal.targetId} loading={cashMoveModal.loading} targetTreeData={cashMoveModal.item ? getCashMoveTargetTreeData(cashMoveModal.item) : []} currentPositionLabel={cashMoveModal.item ? getCashCurrentPosition(cashMoveModal.item) : ''} onTargetChange={cashMoveModal.setTargetId} onConfirm={handleCashMoveConfirm} onCancel={cashMoveModal.close} />
      <MoveModal visible={activityMoveModal.visible} category={activityMoveModal.item ? { id: activityMoveModal.item.id, name: activityMoveModal.item.name, categoryType: 'income' as any, parentId: undefined } : null} targetId={activityMoveModal.targetId} loading={activityMoveModal.loading} targetTreeData={activityMoveModal.item ? getActivityMoveTargetTreeData(activityMoveModal.item) : []} currentPositionLabel={activityMoveModal.item ? getActivityCurrentPosition(activityMoveModal.item) : ''} onTargetChange={activityMoveModal.setTargetId} onConfirm={handleActivityMoveConfirm} onCancel={activityMoveModal.close} />
    </>
  )
}

export default CashFlowConfigModal
