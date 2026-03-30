import React from 'react'
import { Card, Row, Col, Statistic } from 'antd'

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
  <Card style={{ marginBottom: 16 }}>
    <Row gutter={16}>
      <Col span={5}>
        <Statistic
          title="总收入"
          value={totalIncome}
          precision={2}
          valueStyle={{ color: '#3f8600' }}
          prefix="¥"
        />
      </Col>
      <Col span={5}>
        <Statistic
          title="总支出"
          value={totalExpense}
          precision={2}
          valueStyle={{ color: '#cf1322' }}
          prefix="¥"
        />
      </Col>
      <Col span={4}>
        <Statistic
          title="退款"
          value={totalRefund}
          precision={2}
          valueStyle={{ color: '#fa8c16' }}
          prefix="¥"
        />
      </Col>
      <Col span={5}>
        <Statistic
          title="结余"
          value={balance}
          precision={2}
          valueStyle={{ color: balance >= 0 ? '#3f8600' : '#cf1322' }}
          prefix="¥"
        />
      </Col>
      <Col span={5}>
        <Statistic
          title="转账次数"
          value={transferCount}
          suffix="笔"
        />
      </Col>
    </Row>
  </Card>
)

export default TransactionStats
