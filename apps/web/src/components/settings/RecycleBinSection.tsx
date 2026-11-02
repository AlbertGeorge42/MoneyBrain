import React from 'react'
import { Card, Button, Empty, Skeleton, Tag, Typography, theme } from 'antd'
import { RedoOutlined, RestOutlined } from '@ant-design/icons'
import { useRecycleBin, useUndoAuditEvent } from '../../queries'
import { ErrorState } from '../common'
import { useAmountColors } from '../../hooks/useAmountColors'
import { TRANSACTION_TYPE_CONFIG } from '../../utils/transactionType'
import { getCategoryName } from '../transactions/TransactionItemRow'
import { formatCurrency } from '../../utils/format'
import dayjs from 'dayjs'
import type { RecycleBinItem } from '../../services/api'

const { Text } = Typography

/** 回收站（B2-4）：已删除交易可查、可恢复；恢复 = 撤销删除事件，与删除提示条的「撤销」同一条路径。 */
const RecycleBinSection: React.FC = () => {
  const { token } = theme.useToken()
  const amountColors = useAmountColors()
  const recycleBinQuery = useRecycleBin()
  const restoreMutation = useUndoAuditEvent()

  const items = recycleBinQuery.data?.list ?? []

  const amountColor = (type: string) => {
    if (type === 'income' || type === 'refund') return amountColors.positive
    if (type === 'expense') return amountColors.negative
    return amountColors.neutral
  }

  const handleRestore = (item: RecycleBinItem) => {
    if (!item.deleteEventId) return
    restoreMutation.mutate(item.deleteEventId)
  }

  return (
    <Card
      className="surface-card"
      title={
        <span>
          <RestOutlined style={{ marginRight: 8 }} />
          回收站
        </span>
      }
    >
      {recycleBinQuery.isError ? (
        <ErrorState
          variant="inline"
          title="回收站加载失败"
          error={recycleBinQuery.error}
          onRetry={() => void recycleBinQuery.refetch()}
        />
      ) : recycleBinQuery.isLoading ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : items.length === 0 ? (
        <Empty description="回收站是空的" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: token.paddingXS }}>
          {items.map((item) => {
            const typeConfig = TRANSACTION_TYPE_CONFIG[item.transaction.type as keyof typeof TRANSACTION_TYPE_CONFIG]
            return (
              <div
                key={item.transaction.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: token.paddingSM,
                  padding: `${token.paddingXS}px ${token.paddingSM}px`,
                  backgroundColor: token.colorFillQuaternary,
                  borderRadius: token.borderRadius,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: token.paddingXS }}>
                    <Text ellipsis style={{ fontWeight: 500 }}>
                      {getCategoryName(item.transaction)}
                    </Text>
                    <Tag variant="outlined" color={typeConfig?.tagColor} style={{ marginRight: 0 }}>
                      {typeConfig?.text}
                    </Tag>
                  </div>
                  <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                    {dayjs(item.transaction.date).format('YYYY-MM-DD')} · 删除于{' '}
                    {dayjs(item.transaction.deletedAt).format('MM-DD HH:mm')}
                  </Text>
                </div>
                <Text
                  strong
                  style={{ color: amountColor(item.transaction.type), fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatCurrency(item.transaction.amount)}
                </Text>
                <Button
                  size="small"
                  icon={<RedoOutlined />}
                  disabled={!item.deleteEventId || restoreMutation.isPending}
                  onClick={() => handleRestore(item)}
                >
                  恢复
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

export default RecycleBinSection
