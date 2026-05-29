import React from 'react'
import { Statistic, Tag } from 'antd'
import type { ReportValue } from '@shared/types'
import ReportValueDisplay from './ReportValueDisplay'

interface PredictionStatisticProps {
  title: string
  value: ReportValue
  valueStyle?: React.CSSProperties
  showBreakdown?: boolean
}

const PredictionStatistic: React.FC<PredictionStatisticProps> = ({
  title,
  value,
  valueStyle,
  showBreakdown = true,
}) => {
  const total = value.actual + value.predicted
  const hasPrediction = value.predicted !== 0

  return (
    <Statistic
      title={
        <span>
          {title}
          {hasPrediction && (
            <Tag color="processing" style={{ marginLeft: 4 }}>含预测</Tag>
          )}
        </span>
      }
      value={total}
      precision={2}
      valueStyle={valueStyle}
      formatter={() => (
        <ReportValueDisplay
          value={value}
          showBreakdown={showBreakdown}
        />
      )}
    />
  )
}

export default PredictionStatistic