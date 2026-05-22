import React from 'react'
import { Card, Statistic, theme } from 'antd'
import { createStatisticFormatter } from '../../utils/format'

const statisticFormatter = createStatisticFormatter()

interface TransactionStatsProps {
  totalIncome: number
  totalExpense: number
  totalRefund: number
  balance: number
  transferCount: number
}

const TransactionStats: React.FC<TransactionStatsProps> = ({
  totalIncome,
  totalExpense,
  totalRefund,
  balance,
  transferCount,
}) => {
  const { token } = theme.useToken()
  const colorSuccess = token.colorSuccess
  const colorDanger = token.colorError
  const colorWarning = token.colorWarning
  const colorPositive = 'var(--mb-color-positive)'
  const colorNegative = 'var(--mb-color-negative)'
  const spaceCardPadding = `${token.padding}px`

  return (
    <Card style={{ marginBottom: spaceCardPadding }}>
    <div className="stats-grid">
      <Statistic
        title="总收入"
        value={totalIncome}
        precision={2}
        valueStyle={{ color: colorSuccess }}
        formatter={statisticFormatter}
      />
      <Statistic
        title="总支出"
        value={totalExpense}
        precision={2}
        valueStyle={{ color: colorDanger }}
        formatter={statisticFormatter}
      />
      <Statistic
        title="退款"
        value={totalRefund}
        precision={2}
        valueStyle={{ color: colorWarning }}
        formatter={statisticFormatter}
      />
      <Statistic
        title="结余"
        value={balance}
        precision={2}
        valueStyle={{ color: balance >= 0 ? colorPositive : colorNegative }}
        formatter={statisticFormatter}
      />
      <Statistic
        title="转账次数"
        value={transferCount}
        suffix="笔"
      />
    </div>
  </Card>
  )
}

export default TransactionStats
