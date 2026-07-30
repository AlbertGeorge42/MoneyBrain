import React from 'react'
import { Popover } from 'antd'
import { formatCurrency } from '../../utils/format'

interface PredictionPopoverProps {
  children: React.ReactNode
  actual: number
  predicted: number
  useClickTrigger: boolean
}

const PredictionPopover: React.FC<PredictionPopoverProps> = ({ children, actual, predicted, useClickTrigger }) => {
  const total = actual + predicted

  const content = (
    <div style={{ minWidth: 160 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 4 }}>
        <span style={{ color: 'var(--mb-color-text-secondary)' }}>实际</span>
        <span>{formatCurrency(actual)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 4 }}>
        <span style={{ color: 'var(--mb-color-text-secondary)' }}>预测</span>
        <span>{predicted >= 0 ? '+' : ''}{formatCurrency(predicted)}</span>
      </div>
      <div style={{ borderTop: '1px solid var(--mb-color-border)', margin: '4px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontWeight: 600 }}>
        <span>合计</span>
        <span>{formatCurrency(total)}</span>
      </div>
    </div>
  )

  return (
    <Popover content={content} trigger={useClickTrigger ? 'click' : 'hover'}>
      <span style={{ cursor: 'pointer', borderBottom: '1px dashed var(--mb-color-text-tertiary)' }}>
        {children}
      </span>
    </Popover>
  )
}

export default PredictionPopover
