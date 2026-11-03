import React from 'react'
import { Button, Empty, List, Space, Tag, Typography, theme } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { ErrorState } from '../common'
import { useBudgetUsageDetails } from '../../queries/budget'
import { formatCurrency } from '../../utils/format'
import { TRANSACTION_TYPE_CONFIG } from '../../utils/transactionType'
import type { BudgetUsageDetail } from '@contracts/types'

const { Text } = Typography

interface BudgetUsageListProps {
  budgetId: string
  /** 返回预算详情视图 */
  onBack: () => void
}

/**
 * 预算下钻明细（C2）：与预算用量同一口径，列表条数与合计 == 预算用量。
 * signedAmount 为主类型 +、冲减退款 −，正负即计入方向。
 */
const BudgetUsageList: React.FC<BudgetUsageListProps> = ({ budgetId, onBack }) => {
  const { token } = theme.useToken()
  const detailsQuery = useBudgetUsageDetails(budgetId)

  if (detailsQuery.isError) {
    return (
      <ErrorState
        title="预算明细加载失败"
        error={detailsQuery.error}
        onRetry={() => void detailsQuery.refetch()}
      />
    )
  }

  if (detailsQuery.isLoading) {
    return (
      <div style={{ color: token.colorTextTertiary, fontSize: 12, padding: `${token.padding}px 0` }}>
        明细加载中…
      </div>
    )
  }

  const details = detailsQuery.data
  if (!details) return null

  const renderItem = ({ transaction, signedAmount }: BudgetUsageDetail) => {
    const typeConfig = TRANSACTION_TYPE_CONFIG[transaction.type as keyof typeof TRANSACTION_TYPE_CONFIG]
    return (
      <List.Item>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: token.paddingSM }}>
          <Space size={token.paddingXS} wrap>
            <Text type="secondary" style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
              {transaction.date}
            </Text>
            <Tag variant="outlined" color={typeConfig?.tagColor}>
              {typeConfig?.text ?? transaction.type}
            </Tag>
            <Text>{transaction.category?.name ?? '未分类'}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{transaction.account?.name}</Text>
            {signedAmount < 0 && <Tag variant="outlined">冲减</Tag>}
          </Space>
          <Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(signedAmount)}
          </Text>
        </div>
      </List.Item>
    )
  }

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} onClick={onBack} block style={{ marginBottom: token.paddingLG }}>
        返回详情
      </Button>

      <div style={{ marginBottom: token.padding, color: token.colorTextSecondary, fontVariantNumeric: 'tabular-nums' }}>
        共 {details.count} 笔 · 已用 {formatCurrency(details.used)}
        {details.total < 0 && (
          <Text type="secondary" style={{ fontSize: 12, marginLeft: token.paddingXS }}>
            （本期冲减超过支出，明细合计 {formatCurrency(details.total)}，已用按口径下限取 0）
          </Text>
        )}
      </div>

      {details.list.length === 0 ? (
        <Empty description="本期还没有计入的交易" />
      ) : (
        <List dataSource={details.list} renderItem={renderItem} split />
      )}
    </div>
  )
}

export default BudgetUsageList
