import React from 'react'
import { Statistic, Tag } from 'antd'
import type { ReportValue } from '@shared/types'
import { formatCurrency } from '../../utils/format'
import { PredictionPopover } from '../common'

interface PredictionStatisticProps {
  title: string
  value: ReportValue
  valueStyle?: React.CSSProperties
  useClickTrigger?: boolean
}

const PredictionStatistic: React.FC<PredictionStatisticProps> = ({
  title,
  value,
  valueStyle,
  useClickTrigger = false,
}) => {
  const total = value.actual + value.predicted
  const hasPrediction = value.predicted !== 0

  const valueNode = hasPrediction ? (
    <PredictionPopover actual={value.actual} predicted={value.predicted} useClickTrigger={useClickTrigger}>
      {formatCurrency(total)}
    </PredictionPopover>
  ) : (
    formatCurrency(total)
  )

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
      formatter={() => valueNode}
    />
  )
}

export default PredictionStatistic
