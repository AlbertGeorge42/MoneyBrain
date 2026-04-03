import React, { useMemo, useState } from 'react' 
import { Button, DatePicker, Popover, Segmented, Tooltip } from 'antd' 
import { CalendarOutlined, LeftOutlined, RightOutlined, EditOutlined } from '@ant-design/icons'
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

const styles = {
  panelButton: { width: '100%', justifyContent: 'flex-start' } as React.CSSProperties,
  summary: {
    flex: 1,
    textAlign: 'center',
    cursor: 'pointer',
    padding: '6px 12px',
    borderRadius: 6,
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    border: '1px solid transparent',
  } as React.CSSProperties,
  panelContainer: {
    display: 'flex',
    flexDirection: 'column',
  } as React.CSSProperties,
  presetContainer: {
    transition: 'opacity 200ms cubic-bezier(0.4, 0, 0.2, 1), transform 200ms cubic-bezier(0.4, 0, 0.2, 1)',
  } as React.CSSProperties,
  presetGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 8,
  } as React.CSSProperties,
  divider: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    margin: '12px 0',
  } as React.CSSProperties,
  sectionTitle: {
    color: 'rgba(0, 0, 0, 0.45)',
    fontSize: 12,
    marginBottom: 8,
    fontWeight: 500,
  } as React.CSSProperties,
}

interface PickerPanelProps<T extends PointTimeValue | RangeTimeValue> {
  title?: string
  granularity: TimeGranularity
  allowedGranularities: TimeGranularity[]
  summary: string
  onGranularityChange: (granularity: TimeGranularity) => void
  onPrev: () => void
  onNext: () => void
  presets: TimePreset<T>[]
  onPresetClick: (presetKey: string) => void
  onSummaryClick?: (e: React.MouseEvent) => void
  showDatePicker?: boolean
  datePickerRender?: () => React.ReactNode
}

const PickerPanel = <T extends PointTimeValue | RangeTimeValue>({
  title,
  granularity,
  allowedGranularities,
  summary,
  onGranularityChange,
  onPrev,
  onNext,
  presets,
  onPresetClick,
  onSummaryClick,
  showDatePicker = false,
  datePickerRender,
}: PickerPanelProps<T>) => (
  <div style={{ width: 280 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <Button size="small" icon={<LeftOutlined />} onClick={onPrev} aria-label="上一个" />
      <Tooltip title="点击选择具体日期">
          <div
            style={{
              ...styles.summary,
              backgroundColor: showDatePicker ? 'rgba(24, 144, 255, 0.1)' : 'transparent',
              borderColor: showDatePicker ? '#1890ff' : 'transparent',
            }}
            onClick={onSummaryClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSummaryClick?.(e as unknown as React.MouseEvent)
              }
            }}
            onMouseEnter={(e) => {
              if (!showDatePicker) {
                e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.04)'
                e.currentTarget.style.transform = 'scale(1.02)'
              }
            }}
            onMouseLeave={(e) => {
              if (!showDatePicker) {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.transform = 'scale(1)'
              }
            }}
            tabIndex={0}
            role="button"
            aria-label="当前时间范围，点击选择具体日期"
            aria-expanded={showDatePicker}
          >
            <EditOutlined style={{ fontSize: 12, opacity: showDatePicker ? 1 : 0.6 }} />
            <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{summary}</span>
          </div>
        </Tooltip>
      <Button size="small" icon={<RightOutlined />} onClick={onNext} aria-label="下一个" />
    </div>

    <div style={styles.divider} />

    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
      {allowedGranularities.length > 1 ? (
        <Segmented
          size="small"
          value={granularity}
          onChange={(value) => onGranularityChange(value as TimeGranularity)}
          options={allowedGranularities.map((item) => ({ label: getGranularityText(item), value: item }))}
        />
      ) : (
        <span style={{ color: 'rgba(0, 0, 0, 0.45)', fontSize: 12 }}>{getGranularityText(granularity)}模式</span>
      )}
    </div>

    <div style={styles.divider} />

    {!showDatePicker && (
      <div style={styles.presetContainer}>
        <div style={styles.sectionTitle}>{title || '快捷选择'}</div>
        <div style={styles.presetGrid}>
          {presets.map((preset) => (
            <Button
              key={preset.key}
              size="small"
              style={{ ...styles.panelButton, width: '100%' }}
              onClick={() => onPresetClick(preset.key)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>
    )}

    {showDatePicker && datePickerRender && (
      <div style={{ marginTop: 12 }}>
        {datePickerRender()}
      </div>
    )}
  </div>
)

const usePickerState = () => {
  const [open, setOpen] = useState(false)
  const [datePickerOpen, setDatePickerOpen] = useState(false)

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) setDatePickerOpen(false)
  }

  return { open, datePickerOpen, setDatePickerOpen, handleOpenChange }
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
  const { open, datePickerOpen, setDatePickerOpen, handleOpenChange } = usePickerState()

  const currentPresets = useMemo(() => config.presets[value.granularity] || [], [config.presets, value.granularity])

  const handleGranularityChange = (granularity: TimeGranularity) => {
    const nextValue = config.presets[granularity]?.[0]?.getValue(dayjs()) || createPointValue(granularity, value.value)
    onChange(normalizePointValue(nextValue))
    setDatePickerOpen(false)
  }

  const handlePresetClick = (presetKey: string) => {
    const preset = currentPresets.find((item) => item.key === presetKey)
    if (!preset) return
    onChange(normalizePointValue(preset.getValue(dayjs())))
    handleOpenChange(false)
  }

  const handleDateChange = (date: Dayjs | null) => {
    if (date) {
      onChange(normalizePointValue({ granularity: value.granularity, value: date }))
    }
    handleOpenChange(false)
  }

  const handleSummaryClick = () => {
    setDatePickerOpen(!datePickerOpen)
  }

  return (
    <Popover
      arrow
      trigger="click"
      open={open}
      onOpenChange={handleOpenChange}
      placement="rightTop"
      overlayInnerStyle={{ maxHeight: 'none', overflow: 'visible' }}
      getPopupContainer={() => document.body}
      content={
        <div style={styles.panelContainer}>
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
            onSummaryClick={handleSummaryClick}
            showDatePicker={datePickerOpen}
            datePickerRender={() => (
              <DatePicker
                open
                value={value.value}
                picker={value.granularity === 'day' ? undefined : value.granularity}
                onChange={handleDateChange}
              />
            )}
          />
        </div>
      }
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
  const { open, datePickerOpen, setDatePickerOpen, handleOpenChange } = usePickerState()

  const resolvedValue = useMemo(() => {
    if (value) return value
    const firstGranularity = config.allowedGranularities[0] || 'day'
    const fallback = config.presets[firstGranularity]?.[0]?.getValue(dayjs())
    return fallback || createRangeValue('day', dayjs().startOf('day'), dayjs().endOf('day'))
  }, [config.allowedGranularities, config.presets, value])

  const currentPresets = useMemo(
    () => config.presets[resolvedValue.granularity] || [],
    [config.presets, resolvedValue.granularity]
  )

  const handleGranularityChange = (granularity: TimeGranularity) => {
    const nextValue =
      config.presets[granularity]?.[0]?.getValue(dayjs()) ||
      createRangeValue(granularity, resolvedValue.start, resolvedValue.end)
    onChange(normalizeRangeValue(nextValue))
    setDatePickerOpen(false)
  }

  const handlePresetClick = (presetKey: string) => {
    const preset = currentPresets.find((item) => item.key === presetKey)
    if (!preset) return
    onChange(normalizeRangeValue(preset.getValue(dayjs())))
    handleOpenChange(false)
  }

  const handleDateChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (dates?.[0] && dates?.[1]) {
      onChange(
        normalizeRangeValue({
          granularity: resolvedValue.granularity,
          start: dates[0],
          end: dates[1],
        })
      )
      handleOpenChange(false)
    }
  }

  const handleSummaryClick = () => {
    setDatePickerOpen(!datePickerOpen)
  }

  return (
    <Popover
      arrow
      trigger="click"
      open={open}
      onOpenChange={handleOpenChange}
      overlayInnerStyle={{ maxHeight: 'none', overflow: 'visible' }}
      getPopupContainer={() => document.body}
      content={
        <div style={styles.panelContainer}>
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
            onSummaryClick={handleSummaryClick}
            showDatePicker={datePickerOpen}
            datePickerRender={() => (
              <DatePicker.RangePicker
                open
                value={[resolvedValue.start, resolvedValue.end]}
                picker={resolvedValue.granularity === 'day' ? undefined : resolvedValue.granularity}
                onChange={handleDateChange}
              />
            )}
          />
        </div>
      }
    >
      <Button disabled={disabled} icon={<CalendarOutlined />} style={style}>
        {value ? formatRangeValue(value) : placeholder || '选择时间'}
      </Button>
    </Popover>
  )
}

export type { PointTimePickerConfig, PointTimeValue, RangeTimePickerConfig, RangeTimeValue, TimeGranularity }
