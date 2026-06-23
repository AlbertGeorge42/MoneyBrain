import React from 'react'
import { Modal, Typography, theme } from 'antd'
import InvestmentSnapshotTimeline from './InvestmentSnapshotTimeline'
import type { InvestmentAllocationSnapshot } from '../../services/api'

const { Text } = Typography

interface InvestmentSnapshotHistoryModalProps {
  visible: boolean
  onClose: () => void
  snapshots: InvestmentAllocationSnapshot[]
  onEdit: (snapshot: InvestmentAllocationSnapshot) => void
  onDelete: (id: string) => void
  accountName: string
}

const InvestmentSnapshotHistoryModal: React.FC<InvestmentSnapshotHistoryModalProps> = ({
  visible,
  onClose,
  snapshots,
  onEdit,
  onDelete,
  accountName,
}) => {
  const { token } = theme.useToken()

  return (
    <Modal
      title={`${accountName} - 快照历史`}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={800}
      styles={{
        body: {
          maxHeight: '70vh',
          overflowY: 'auto',
        },
      }}
    >
      <div style={{ marginBottom: token.marginMD }}>
        <Text type="secondary">
          共 {snapshots.length} 条快照记录
        </Text>
      </div>

      <InvestmentSnapshotTimeline
        snapshots={snapshots}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </Modal>
  )
}

export default InvestmentSnapshotHistoryModal