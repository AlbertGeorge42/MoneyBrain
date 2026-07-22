import React from 'react'
import { Card, Statistic } from 'antd'
import { createStatisticFormatter } from '../../utils/format'
import { useAmountColors } from '../../constants/transactionType'

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
  const amountColors = useAmountColors()

  return (
    <Card style={{ marginBottom: 'var(--mb-space-xl)' }}>
    <div className="stats-grid">
      <Statistic
        title="总收入"
        value={totalIncome}
        precision={2}
        valueStyle={{ color: amountColors.positive }}
        formatter={statisticFormatter}
      />
      <Statistic
        title="总支出"
        value={totalExpense}
        precision={2}
        valueStyle={{ color: amountColors.negative }}
        formatter={statisticFormatter}
      />
      <Statistic
        title="退款"
        value={totalRefund}
        precision={2}
        valueStyle={{ color: amountColors.positive }}
        formatter={statisticFormatter}
      />
      <Statistic
        title="结余"
        value={balance}
        precision={2}
        valueStyle={{ color: balance >= 0 ? amountColors.positive : amountColors.negative }}
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
