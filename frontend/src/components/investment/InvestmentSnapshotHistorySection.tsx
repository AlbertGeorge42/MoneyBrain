import React, { useState, useEffect } from 'react'
import { Button, Card, Typography, theme, Space } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import InvestmentSnapshotModal from './InvestmentSnapshotModal'
import InvestmentSnapshotHistoryModal from './InvestmentSnapshotHistoryModal'
import AccountSelector from './AccountSelector'
import SnapshotTimeline from './SnapshotTimeline'
import { investmentApi, type InvestmentAllocationSnapshot } from '../../services/api'
import { useNotify } from '../../hooks/useNotify'
import type { InvestmentAnalysisReportData } from '@shared/types'

const { Text } = Typography

interface InvestmentSnapshotHistorySectionProps {
  investmentData: InvestmentAnalysisReportData | null
  onRefresh: () => void
}

const InvestmentSnapshotHistorySection: React.FC<InvestmentSnapshotHistorySectionProps> = ({
  investmentData,
  onRefresh,
}) => {
  const { token } = theme.useToken()
  const notify = useNotify()

  // 状态管理
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<InvestmentAllocationSnapshot[]>([])
  const [loading, setLoading] = useState(false)

  // 弹窗状态
  const [snapshotModalVisible, setSnapshotModalVisible] = useState(false)
  const [editingSnapshot, setEditingSnapshot] = useState<InvestmentAllocationSnapshot | null>(null)
  const [historyModalVisible, setHistoryModalVisible] = useState(false)

  // 获取账户列表
  const accounts = investmentData?.byAccountAllocation || []

  // 获取当前选中账户的名称
  const selectedAccount = accounts.find(a => a.accountId === selectedAccountId)
  const accountName = selectedAccount?.accountName || ''

  // 当有账户时，默认选择第一个账户
  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].accountId)
    }
  }, [accounts, selectedAccountId])

  // 加载快照数据
  useEffect(() => {
    if (selectedAccountId) {
      loadSnapshots()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId])

  const loadSnapshots = async () => {
    if (!selectedAccountId) return
    setLoading(true)
    try {
      const res = await investmentApi.getSnapshots(selectedAccountId)
      setSnapshots(res.data.data || [])
    } catch {
      notify.error('加载快照失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingSnapshot(null)
    setSnapshotModalVisible(true)
  }

  const handleEdit = (snapshot: InvestmentAllocationSnapshot) => {
    setEditingSnapshot(snapshot)
    setSnapshotModalVisible(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await investmentApi.deleteSnapshot(id)
      notify.success('删除成功')
      loadSnapshots()
      onRefresh()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '删除失败'
      notify.error(message)
    }
  }

  const handleSnapshotSuccess = () => {
    setSnapshotModalVisible(false)
    loadSnapshots()
    onRefresh()
  }

  const handleViewMore = () => {
    setHistoryModalVisible(true)
  }

  return (
    <Card
      className="snapshot-history-section"
      style={{
        marginTop: token.marginLG,
        borderRadius: token.borderRadiusLG,
        background: token.colorBgContainer,
      }}
    >
      {/* 标题栏 */}
      <div
        className="snapshot-history-section__header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: token.marginMD,
        }}
      >
        <Text strong style={{ fontSize: token.fontSizeLG }}>
          快照历史
        </Text>
        <Space size="small">
          <Text type="secondary">
            {snapshots.length} 条记录
          </Text>
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={handleAdd}
          >
            添加快照
          </Button>
        </Space>
      </div>

      {/* 内容 */}
      <div
        className="snapshot-history-section__content"
        style={{
          padding: 0,
        }}
      >
        {/* 账户选择器 */}
        {accounts.length > 0 && (
          <AccountSelector
            accounts={accounts}
            selectedAccountId={selectedAccountId}
            onChange={setSelectedAccountId}
          />
        )}

        {/* 快照时间线 */}
        <SnapshotTimeline
          snapshots={snapshots}
          loading={loading}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />

        {/* 查看更多按钮 */}
        {snapshots.length > 3 && (
          <div
            className="snapshot-history-section__view-more"
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginTop: token.marginMD,
            }}
          >
            <Button
              type="link"
              onClick={handleViewMore}
            >
              查看更多
            </Button>
          </div>
        )}
      </div>

      {/* 弹窗 */}
      <InvestmentSnapshotModal
        visible={snapshotModalVisible}
        onClose={() => setSnapshotModalVisible(false)}
        onSuccess={handleSnapshotSuccess}
        initialAccountId={selectedAccountId || undefined}
        editingSnapshot={editingSnapshot}
      />

      <InvestmentSnapshotHistoryModal
        visible={historyModalVisible}
        onClose={() => setHistoryModalVisible(false)}
        snapshots={snapshots}
        onEdit={handleEdit}
        onDelete={handleDelete}
        accountName={accountName}
      />
    </Card>
  )
}

export default InvestmentSnapshotHistorySection