import React from 'react'
import type { ReportValue } from '@shared/types'
import { formatCurrency } from '../../utils/format'
import PredictionPopover from './PredictionPopover'

interface ReportValueDisplayProps {
  value: ReportValue
  useClickTrigger?: boolean
}

const ReportValueDisplay: React.FC<ReportValueDisplayProps> = ({
  value,
  useClickTrigger = false,
}) => {
  const total = value.actual + value.predicted
  const hasPrediction = value.predicted !== 0

  if (!hasPrediction) {
    return <span>{formatCurrency(total)}</span>
  }

  return (
    <PredictionPopover actual={value.actual} predicted={value.predicted} useClickTrigger={useClickTrigger}>
      {formatCurrency(total)}
    </PredictionPopover>
  )
}

export default ReportValueDisplay
