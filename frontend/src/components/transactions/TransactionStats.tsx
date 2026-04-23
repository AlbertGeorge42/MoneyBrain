import React from 'react'
import { Card, Row, Col, Statistic } from 'antd'
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
    <Row gutter={16}>
      <Col span={5}>
        <Statistic
          title="总收入"
          value={totalIncome}
          precision={2}
          valueStyle={{ color: colorSuccess }}
          prefix="¥"
        />
      </Col>
      <Col span={5}>
        <Statistic
          title="总支出"
          value={totalExpense}
          precision={2}
          valueStyle={{ color: colorDanger }}
          prefix="¥"
        />
      </Col>
      <Col span={4}>
        <Statistic
          title="退款"
          value={totalRefund}
          precision={2}
          valueStyle={{ color: colorWarning }}
          prefix="¥"
        />
      </Col>
      <Col span={5}>
        <Statistic
          title="结余"
          value={balance}
          precision={2}
          valueStyle={{ color: balance >= 0 ? colorPositive : colorNegative }}
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
