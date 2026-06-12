import React, { useState, useEffect } from 'react'
import { Modal, Select, Button, Space, theme, Grid, Spin, Tooltip } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useAccounts } from '../../queries'
import { investmentApi, InvestmentAllocationSnapshot } from '../../services/api'
import DynamicIcon from '../../components/common/DynamicIcon'
import InvestmentSnapshotTimeline from './InvestmentSnapshotTimeline'
import InvestmentSnapshotModal from './InvestmentSnapshotModal'
import { useNotify } from '../../hooks/useNotify'

interface Props {
  visible: boolean
  onClose: () => void
  onRefresh: () => void
  initialAccountId?: string
}

const InvestmentSnapshotHistoryModal: React.FC<Props> = ({
  visible,
  onClose,
  onRefresh,
  initialAccountId,
}) => {
  const { token } = theme.useToken()
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const { data: accounts = [] } = useAccounts()
  const notify = useNotify()

  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(initialAccountId)
  const [snapshots, setSnapshots] = useState<InvestmentAllocationSnapshot[]>([])
  const [loading, setLoading] = useState(false)
  const [snapshotModalVisible, setSnapshotModalVisible] = useState(false)
  const [editingSnapshot, setEditingSnapshot] = useState<InvestmentAllocationSnapshot | null>(null)

  useEffect(() => {
    if (initialAccountId) {
      setSelectedAccountId(initialAccountId)
    }
  }, [initialAccountId])

  useEffect(() => {
    if (visible && selectedAccountId) {
      loadSnapshots()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, selectedAccountId])

  const investmentAccounts = accounts.filter(a => a.category?.isInvestment === true)

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

  const handleOpenAdd = () => {
    setEditingSnapshot(null)
    setSnapshotModalVisible(true)
  }

  const handleOpenEdit = (snapshot: InvestmentAllocationSnapshot) => {
    setEditingSnapshot(snapshot)
    setSnapshotModalVisible(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await investmentApi.deleteSnapshot(id)
      notify.success('删除成功')
      loadSnapshots()
      onRefresh()
    } catch {
      notify.error('删除失败')
    }
  }

  const handleSnapshotSuccess = () => {
    setSnapshotModalVisible(false)
    setEditingSnapshot(null)
    loadSnapshots()
    onRefresh()
  }

  return (
    <>
      <Modal
        title="快照记录"
        open={visible}
        onCancel={onClose}
        footer={null}
        width={isMobile ? 'calc(100vw - 24px)' : 720}
        styles={{
          body: {
            maxHeight: '70vh',
            overflowY: 'auto',
          },
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: token.marginSM,
              flexWrap: 'wrap',
            }}
          >
            <Select
              style={{ width: isMobile ? '100%' : 240 }}
              placeholder="选择投资账户"
              value={selectedAccountId}
              onChange={setSelectedAccountId}
              options={investmentAccounts.map(a => ({
                value: a.id,
                label: (
                  <span>
                    <DynamicIcon name={a.icon} size={16} fallback="wallet" />
                    {' '}{a.name}
                  </span>
                ),
              }))}
            />
            <Tooltip title="添加快照">
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={handleOpenAdd}
                disabled={!selectedAccountId}
              />
            </Tooltip>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: token.paddingXL }}>
              <Spin />
            </div>
          ) : (
            <InvestmentSnapshotTimeline
              snapshots={snapshots}
              onEdit={handleOpenEdit}
              onDelete={handleDelete}
            />
          )}
        </Space>
      </Modal>

      <InvestmentSnapshotModal
        visible={snapshotModalVisible}
        onClose={() => {
          setSnapshotModalVisible(false)
          setEditingSnapshot(null)
        }}
        onSuccess={handleSnapshotSuccess}
        initialAccountId={selectedAccountId}
        editingSnapshot={editingSnapshot}
      />
    </>
  )
}

export default InvestmentSnapshotHistoryModal
