import React from 'react'
import { Tag, Typography } from 'antd'
import type { ReportValue } from '@shared/types'
import { formatCurrency } from '../../utils/format'

const { Text } = Typography

interface ReportValueDisplayProps {
  value: ReportValue
  showBreakdown?: boolean
}

const ReportValueDisplay: React.FC<ReportValueDisplayProps> = ({
  value,
  showBreakdown = true,
}) => {
  const total = value.actual + value.predicted
  const hasPrediction = value.predicted !== 0

  if (!hasPrediction) {
    return <span>{formatCurrency(total)}</span>
  }

  if (showBreakdown) {
    return (
      <span>
        {formatCurrency(total)}
        <Text type="secondary" style={{ fontSize: '0.85em', marginLeft: 8 }}>
          （实际 {formatCurrency(value.actual)} + 预测 {formatCurrency(value.predicted)}）
        </Text>
      </span>
    )
  }

  return (
    <span>
      {formatCurrency(value.actual)}
      <Text style={{ opacity: 0.6 }}> + {formatCurrency(value.predicted)}</Text>
      <Tag color="processing" style={{ marginLeft: 4 }}>预测</Tag>
    </span>
  )
}

export default ReportValueDisplay