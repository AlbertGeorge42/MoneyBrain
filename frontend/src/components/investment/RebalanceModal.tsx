import React from 'react'
import { Modal, Table, Typography, theme, Empty, Space, Tag, Grid } from 'antd'
import type { AccountAllocationDetail } from '@shared/types'
import { formatCurrency, formatPercent } from '../../utils/format'

interface Props {
  visible: boolean
  onClose: () => void
  allocation: AccountAllocationDetail | null
}

const { Text } = Typography

const RebalanceModal: React.FC<Props> = ({ visible, onClose, allocation }) => {
  const { token } = theme.useToken()
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md

  if (!allocation) return null

  const hasTargetRatio = allocation.items.some(item => item.targetRatio !== null)

  if (!hasTargetRatio) {
    return (
      <Modal
        title={`${allocation.accountName} - 再平衡建议`}
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
        <Empty
          description="尚未配置目标比例，请先在资产类型设置中配置目标比例"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Modal>
    )
  }

  const columns = [
    {
      title: '资产类型',
      dataIndex: 'name',
      key: 'name',
      width: 100,
    },
    {
      title: '当前比例',
      dataIndex: 'ratio',
      key: 'ratio',
      width: 80,
      render: (v: number) => formatPercent(v, 1, false),
    },
    {
      title: '目标比例',
      dataIndex: 'targetRatio',
      key: 'targetRatio',
      width: 80,
      render: (v: number | null) => v !== null ? `${v.toFixed(1)}%` : '-',
    },
    {
      title: '偏差',
      dataIndex: 'deviation',
      key: 'deviation',
      width: 70,
      render: (v: number | null) => {
        if (v === null) return <Text type="secondary">-</Text>
        const color = Math.abs(v) > 5 ? token.colorError : Math.abs(v) > 2 ? token.colorWarning : token.colorSuccess
        return <Text style={{ color }}>{formatPercent(v, 1, true)}</Text>
      },
    },
    {
      title: '建议调整',
      dataIndex: 'rebalanceAmount',
      key: 'rebalanceAmount',
      width: 100,
      render: (v: number | null) => {
        if (v === null || Math.abs(v) < 0.01) return <Text type="secondary">-</Text>
        const color = v > 0 ? token.colorSuccess : token.colorError
        return (
          <Text style={{ color }}>
            {v > 0 ? '买入 ' : '卖出 '}{formatCurrency(Math.abs(v))}
          </Text>
        )
      },
    },
  ]

  const maxDeviation = Math.max(
    ...allocation.items
      .filter(item => item.deviation !== null)
      .map(item => Math.abs(item.deviation as number))
  )

  return (
    <Modal
      title={`${allocation.accountName} - 再平衡建议`}
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
        <div>
          <Text type="secondary">账户余额：</Text>
          <Text strong>{formatCurrency(allocation.balance)}</Text>
          {maxDeviation > 5 && (
            <Tag color="error" style={{ marginLeft: 8 }}>偏离较大</Tag>
          )}
          {maxDeviation > 2 && maxDeviation <= 5 && (
            <Tag color="warning" style={{ marginLeft: 8 }}>偏离适中</Tag>
          )}
          {maxDeviation <= 2 && (
            <Tag color="success" style={{ marginLeft: 8 }}>配置均衡</Tag>
          )}
        </div>
        <Table
          dataSource={allocation.items}
          columns={columns}
          rowKey="assetClassId"
          pagination={false}
          size="small"
        />
      </Space>
    </Modal>
  )
}

export default RebalanceModal
