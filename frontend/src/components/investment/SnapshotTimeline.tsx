import React from 'react'
import { Empty, Grid, Spin, theme, Typography, Space, Button, Dropdown, Modal } from 'antd'
import { SettingOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import CategoryIcon from '../common/CategoryIcon'
import type { InvestmentAllocationSnapshot } from '../../services/api'
import { formatCurrency, formatPercent } from '../../utils/format'
import dayjs from 'dayjs'

const { Text } = Typography

interface SnapshotTimelineProps {
  snapshots: InvestmentAllocationSnapshot[]
  loading: boolean
  onEdit: (snapshot: InvestmentAllocationSnapshot) => void
  onDelete: (id: string) => void
}

const SnapshotTimeline: React.FC<SnapshotTimelineProps> = ({
  snapshots,
  loading,
  onEdit,
  onDelete,
}) => {
  const { token } = theme.useToken()
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 32 }}>
        <Spin />
      </div>
    )
  }

  if (snapshots.length === 0) {
    return (
      <Empty
        description="暂无快照记录"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        style={{ padding: `${token.paddingXL}px 0` }}
      />
    )
  }

  const formatDate = (date: string) => {
    return dayjs(date).format('YYYY-MM-DD')
  }

  const handleDeleteWithConfirm = (snapshot: InvestmentAllocationSnapshot) => {
    Modal.confirm({
      title: '确定删除该快照？',
      content: '删除后无法恢复',
      okText: '确定',
      cancelText: '取消',
      onOk: () => onDelete(snapshot.id),
    })
  }

  const getSettingMenuItems = (snapshot: InvestmentAllocationSnapshot): MenuProps['items'] => [
    { key: 'edit', label: '编辑', icon: <EditOutlined />, onClick: () => onEdit(snapshot) },
    { type: 'divider' },
    {
      key: 'delete',
      label: '删除',
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => handleDeleteWithConfirm(snapshot),
    },
  ]

  const renderSnapshotCard = (snapshot: InvestmentAllocationSnapshot, index: number) => {
    const prevSnapshot = index < snapshots.length - 1 ? snapshots[index + 1] : null
    const balanceChange = prevSnapshot
      ? snapshot.accountBalance - prevSnapshot.accountBalance
      : null

    const totalNetFlow = snapshot.items.reduce((sum, item) => sum + item.periodNetFlow, 0)

    return (
      <div
        key={snapshot.id}
        className="snapshot-timeline__item"
        style={{
          position: 'relative',
          paddingLeft: isMobile ? 0 : 24,
          paddingBottom: index < snapshots.length - 1 ? token.marginMD : 0,
        }}
      >
        {!isMobile && (
          <div
            className="snapshot-timeline__line"
            style={{
              position: 'absolute',
              left: 6,
              top: 24,
              bottom: index < snapshots.length - 1 ? -token.marginMD : 24,
              width: 2,
              background: token.colorBorderSecondary,
            }}
          />
        )}

        {!isMobile && (
          <div
            className="snapshot-timeline__dot"
            style={{
              position: 'absolute',
              left: 0,
              top: 6,
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: token.colorPrimary,
              border: `2px solid ${token.colorBgContainer}`,
            }}
          />
        )}

        <div
          className="snapshot-timeline__card"
          style={{
            background: token.colorBgContainer,
            borderRadius: token.borderRadiusLG,
            padding: token.paddingSM,
            border: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <div
            className="snapshot-timeline__header"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: token.marginXS,
            }}
          >
            <div>
              <Text strong style={{ fontSize: token.fontSize }}>
                {formatDate(snapshot.date)}
              </Text>
              {balanceChange !== null && (
                <Text
                  type="secondary"
                  style={{ marginLeft: token.marginSM, fontSize: token.fontSizeSM }}
                >
                  {balanceChange >= 0 ? '+' : ''}{formatCurrency(balanceChange)}
                </Text>
              )}
            </div>
            <Space align="center" size="small">
              <Text strong style={{ color: 'var(--mb-color-investing)', fontSize: token.fontSize }}>
                {formatCurrency(snapshot.accountBalance)}
              </Text>
              <Dropdown
                menu={{ items: getSettingMenuItems(snapshot) }}
                trigger={['click']}
              >
                <Button type="text" size="small" icon={<SettingOutlined />} />
              </Dropdown>
            </Space>
          </div>

          {totalNetFlow !== 0 && (
            <div
              className="snapshot-timeline__period-info"
              style={{
                marginBottom: token.marginXS,
                fontSize: token.fontSizeSM,
                color: token.colorTextSecondary,
              }}
            >
              期间净流入 {formatCurrency(totalNetFlow)}
              {totalNetFlow > 0 && <span style={{ marginLeft: 4 }}>(投入)</span>}
              {totalNetFlow < 0 && <span style={{ marginLeft: 4 }}>(转出)</span>}
            </div>
          )}

          <div
            className="snapshot-timeline__assets"
            style={{
              marginBottom: 0,
            }}
          >
            {snapshot.items.map((item) => {
              const ratio = snapshot.accountBalance > 0
                ? (item.marketValue / snapshot.accountBalance) * 100
                : 0
              return (
                <div
                  key={item.id}
                  className="snapshot-timeline__asset-row"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: `${token.paddingXXS}px 0`,
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: token.marginXS }}>
                    {item.assetClass?.icon && (
                      <CategoryIcon name={item.assetClass?.icon} color={item.assetClass?.color ?? null} size={18} iconSize={10} fallback="investment" />
                    )}
                    <Text style={{ fontSize: token.fontSizeSM }}>{item.assetClass?.name || '未知'}</Text>
                    <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                      {formatPercent(ratio, 1, false)}
                    </Text>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: token.marginSM }}>
                    {item.periodNetFlow !== 0 && (
                      <Text
                        type="secondary"
                        style={{ fontSize: token.fontSizeSM }}
                      >
                        {item.periodNetFlow > 0 ? '+' : ''}{formatCurrency(item.periodNetFlow)}
                      </Text>
                    )}
                    <Text style={{ fontSize: token.fontSizeSM }}>{formatCurrency(item.marketValue)}</Text>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="snapshot-timeline"
      style={{ opacity: loading ? 0.5 : 1 }}
    >
      {snapshots.slice(0, 3).map((snapshot, index) => renderSnapshotCard(snapshot, index))}
    </div>
  )
}

export default SnapshotTimeline