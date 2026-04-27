import React from 'react'
import { Card, Statistic } from 'antd'
import {
  colorSuccess,
  colorDanger,
  colorWarning,
  colorPositive,
  colorNegative,
  spaceMd,
} from '../../styles/tokens'

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
}) => (
  <Card style={{ marginBottom: spaceMd }}>
    <div className="stats-grid">
      <Statistic
        title="总收入"
        value={totalIncome}
        precision={2}
        valueStyle={{ color: colorSuccess }}
        prefix="¥"
      />
      <Statistic
        title="总支出"
        value={totalExpense}
        precision={2}
        valueStyle={{ color: colorDanger }}
        prefix="¥"
      />
      <Statistic
        title="退款"
        value={totalRefund}
        precision={2}
        valueStyle={{ color: colorWarning }}
        prefix="¥"
      />
      <Statistic
        title="结余"
        value={balance}
        precision={2}
        valueStyle={{ color: balance >= 0 ? colorPositive : colorNegative }}
        prefix="¥"
      />
      <Statistic
        title="转账次数"
        value={transferCount}
        suffix="笔"
      />
    </div>
  </Card>
)

export default TransactionStats
