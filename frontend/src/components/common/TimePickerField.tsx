import React, { useMemo, useState } from 'react'
import { Button, DatePicker, Popover, Segmented, Space } from 'antd'
import { CalendarOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import {
  createPointValue,
  createRangeValue,
  formatPointValue,
  formatRangeValue,
  getGranularityText,
  movePointValue,
  moveRangeValue,
  normalizePointValue,
  normalizeRangeValue,
  type PointTimePickerConfig,
  type PointTimeValue,
  type RangeTimePickerConfig,
  type RangeTimeValue,
  type TimeGranularity,
  type TimePreset,
} from '../../utils/timePicker'

const { RangePicker } = DatePicker

interface PickerPanelProps {
  title?: string
  granularity: TimeGranularity
  allowedGranularities: TimeGranularity[]
  summary: string
  onGranularityChange: (granularity: TimeGranularity) => void
  onPrev: () => void
  onNext: () => void
  presets: Array<TimePreset<PointTimeValue> | TimePreset<RangeTimeValue>>
  onPresetClick: (presetKey: string) => void
  customInput: React.ReactNode
}

const panelButtonStyle: React.CSSProperties = {
  width: '100%',
  justifyContent: 'flex-start',
}

const PickerPanel: React.FC<PickerPanelProps> = ({
  title,
  granularity,
  allowedGranularities,
  summary,
  onGranularityChange,
  onPrev,
  onNext,
  presets,
  onPresetClick,
  customInput,
}) => {
  const presetButtons = presets.map((preset) => (
    <Button key={preset.key} size="small" style={panelButtonStyle} onClick={() => onPresetClick(preset.key)}>
      {preset.label}
    </Button>
  ))

  return (
    <div style={{ width: 520 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <Space>
          <Button size="small" icon={<LeftOutlined />} onClick={onPrev} />
          <span style={{ minWidth: 180, fontWeight: 500 }}>{summary}</span>
          <Button size="small" icon={<RightOutlined />} onClick={onNext} />
        </Space>
        {allowedGranularities.length > 1 ? (
          <Segmented
            value={granularity}
            onChange={(value) => onGranularityChange(value as TimeGranularity)}
            options={allowedGranularities.map((item) => ({ label: getGranularityText(item), value: item }))}
          />
        ) : (
          <span style={{ color: '#666', fontSize: 12 }}>{getGranularityText(granularity)}模式</span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '168px minmax(0, 1fr)', gap: 16, marginTop: 16 }}>
        <div>
          <div style={{ color: '#666', fontSize: 12, marginBottom: 8 }}>{title || '快捷选择'}</div>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {presetButtons}
          </Space>
        </div>
        <div>
          <div style={{ color: '#666', fontSize: 12, marginBottom: 8 }}>自定义</div>
          {customInput}
        </div>
      </div>
    </div>
  )
}

interface PointTimePickerFieldProps {
  value: PointTimeValue
  config: PointTimePickerConfig
  onChange: (value: PointTimeValue) => void
  disabled?: boolean
  style?: React.CSSProperties
}

export const PointTimePickerField: React.FC<PointTimePickerFieldProps> = ({
  value,
  config,
  onChange,
  disabled,
  style,
}) => {
  const [open, setOpen] = useState(false)

  const currentPresets = useMemo(() => config.presets[value.granularity] || [], [config.presets, value.granularity])

  const handleGranularityChange = (granularity: TimeGranularity) => {
    const nextValue = config.presets[granularity]?.[0]?.getValue(dayjs()) || createPointValue(granularity, value.value)
    onChange(normalizePointValue(nextValue))
  }

  const handlePresetClick = (presetKey: string) => {
    const preset = currentPresets.find((item) => item.key === presetKey)
    if (!preset) return
    onChange(normalizePointValue(preset.getValue(dayjs())))
    setOpen(false)
  }

  const pickerType = value.granularity === 'day' ? undefined : value.granularity

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomLeft"
      content={(
        <PickerPanel
          title={config.label}
          granularity={value.granularity}
          allowedGranularities={config.allowedGranularities}
          summary={formatPointValue(value)}
          onGranularityChange={handleGranularityChange}
          onPrev={() => onChange(movePointValue(value, -1))}
          onNext={() => onChange(movePointValue(value, 1))}
          presets={currentPresets}
          onPresetClick={handlePresetClick}
          customInput={(
            <DatePicker
              style={{ width: '100%' }}
              picker={pickerType}
              allowClear={false}
              value={value.value}
              onChange={(date) => date && onChange(normalizePointValue({ granularity: value.granularity, value: date }))}
            />
          )}
        />
      )}
    >
      <Button disabled={disabled} icon={<CalendarOutlined />} style={style}>
        {formatPointValue(value)}
      </Button>
    </Popover>
  )
}

interface RangeTimePickerFieldProps {
  value: RangeTimeValue | null
  config: RangeTimePickerConfig
  onChange: (value: RangeTimeValue) => void
  disabled?: boolean
  style?: React.CSSProperties
  placeholder?: string
}

export const RangeTimePickerField: React.FC<RangeTimePickerFieldProps> = ({
  value,
  config,
  onChange,
  disabled,
  style,
  placeholder,
}) => {
  const [open, setOpen] = useState(false)

  const resolvedValue = useMemo(() => {
    if (value) {
      return value
    }

    const firstGranularity = config.allowedGranularities[0] || 'day'
    const fallback = config.presets[firstGranularity]?.[0]?.getValue(dayjs())
    return fallback || createRangeValue('day', dayjs().startOf('day'), dayjs().endOf('day'))
  }, [config.allowedGranularities, config.presets, value])

  const currentPresets = useMemo(() => config.presets[resolvedValue.granularity] || [], [config.presets, resolvedValue.granularity])

  const handleGranularityChange = (granularity: TimeGranularity) => {
    const nextValue = config.presets[granularity]?.[0]?.getValue(dayjs()) || createRangeValue(granularity, resolvedValue.start, resolvedValue.end)
    onChange(normalizeRangeValue(nextValue))
  }

  const handlePresetClick = (presetKey: string) => {
    const preset = currentPresets.find((item) => item.key === presetKey)
    if (!preset) return
    onChange(normalizeRangeValue(preset.getValue(dayjs())))
    setOpen(false)
  }

  const pickerType = resolvedValue.granularity === 'day' ? undefined : resolvedValue.granularity

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomLeft"
      content={(
        <PickerPanel
          title={config.label}
          granularity={resolvedValue.granularity}
          allowedGranularities={config.allowedGranularities}
          summary={formatRangeValue(resolvedValue)}
          onGranularityChange={handleGranularityChange}
          onPrev={() => onChange(moveRangeValue(resolvedValue, -1))}
          onNext={() => onChange(moveRangeValue(resolvedValue, 1))}
          presets={currentPresets}
          onPresetClick={handlePresetClick}
          customInput={(
            <RangePicker
              style={{ width: '100%' }}
              picker={pickerType}
              allowClear={false}
              value={[resolvedValue.start, resolvedValue.end]}
              onChange={(dates) => {
                if (!dates || !dates[0] || !dates[1]) return
                onChange(normalizeRangeValue({ granularity: resolvedValue.granularity, start: dates[0] as Dayjs, end: dates[1] as Dayjs }))
              }}
            />
          )}
        />
      )}
    >
      <Button disabled={disabled} icon={<CalendarOutlined />} style={style}>
        {value ? formatRangeValue(value) : placeholder || '选择时间'}
      </Button>
    </Popover>
  )
}

export type { PointTimePickerConfig, PointTimeValue, RangeTimePickerConfig, RangeTimeValue, TimeGranularity }