import React, { useMemo, useState } from 'react'
import { Button, DatePicker, Dropdown, Segmented } from 'antd'
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
} from '../../utils/timePicker'

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

  const isMinReached = useMemo(() => {
    if (!config.minDate) return false
    return value.value.isBefore(config.minDate, value.granularity) || value.value.isSame(config.minDate, value.granularity)
  }, [value.value, value.granularity, config.minDate])

  const isMaxReached = useMemo(() => {
    if (!config.maxDate) return false
    return value.value.isAfter(config.maxDate, value.granularity) || value.value.isSame(config.maxDate, value.granularity)
  }, [value.value, value.granularity, config.maxDate])

  const disabledDate = (current: Dayjs) => {
    if (!current) return false
    if (config.minDate && current.isBefore(config.minDate, 'day')) return true
    if (config.maxDate && current.isAfter(config.maxDate, 'day')) return true
    return false
  }

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

  const handleDateChange = (date: Dayjs | null) => {
    if (date) {
      onChange(normalizePointValue({ granularity: value.granularity, value: date }))
      setOpen(false)
    }
  }

  const handlePrevClick = () => {
    if (!isMinReached) {
      onChange(movePointValue(value, -1))
    }
  }

  const handleNextClick = () => {
    if (!isMaxReached) {
      onChange(movePointValue(value, 1))
    }
  }

  const dropdownContent = (
    <div style={{ 
      padding: 16,
      backgroundColor: '#fff',
      borderRadius: 8,
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
      maxWidth: 'calc(100vw - 32px)'
    }}>
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: 16 
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          gap: 12 
        }}>
          <Button 
            size="small" 
            icon={<LeftOutlined />} 
            onClick={handlePrevClick}
            disabled={isMinReached}
          />
          <div style={{ 
            fontSize: 15,
            fontWeight: 500,
            color: '#262626',
            minWidth: 100,
            textAlign: 'center'
          }}>
            {formatPointValue(value)}
          </div>
          <Button 
            size="small" 
            icon={<RightOutlined />} 
            onClick={handleNextClick}
            disabled={isMaxReached}
          />
        </div>

        {config.allowedGranularities.length > 1 && (
          <Segmented
            block
            size="small"
            value={value.granularity}
            onChange={(val) => handleGranularityChange(val as TimeGranularity)}
            options={config.allowedGranularities.map((item) => ({ 
              label: getGranularityText(item), 
              value: item 
            }))}
          />
        )}

        {currentPresets.length > 0 && (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(2, 1fr)', 
            gap: 8 
          }}>
            {currentPresets.map((preset) => (
              <Button
                key={preset.key}
                size="small"
                onClick={() => handlePresetClick(preset.key)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        )}

        <DatePicker
          style={{ width: '100%' }}
          value={value.value}
          picker={value.granularity === 'day' ? undefined : value.granularity}
          onChange={handleDateChange}
          onOpenChange={(pickerOpen) => {
            if (pickerOpen) setOpen(true)
          }}
          placeholder="自定义日期"
          disabledDate={disabledDate}
        />
      </div>
    </div>
  )

  return (
    <Dropdown
      dropdownRender={() => dropdownContent}
      trigger={['click']}
      open={open}
      onOpenChange={setOpen}
    >
      <Button disabled={disabled} icon={<CalendarOutlined />} style={style}>
        {formatPointValue(value)}
      </Button>
    </Dropdown>
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
    if (value) return value
    const firstGranularity = config.allowedGranularities[0] || 'day'
    const fallback = config.presets[firstGranularity]?.[0]?.getValue(dayjs())
    return fallback || createRangeValue('day', dayjs().startOf('day'), dayjs().endOf('day'))
  }, [config.allowedGranularities, config.presets, value])

  const currentPresets = useMemo(
    () => config.presets[resolvedValue.granularity] || [],
    [config.presets, resolvedValue.granularity]
  )

  const isMinReached = useMemo(() => {
    if (!config.minDate) return false
    return resolvedValue.start.isBefore(config.minDate, resolvedValue.granularity) || resolvedValue.start.isSame(config.minDate, resolvedValue.granularity)
  }, [resolvedValue.start, resolvedValue.granularity, config.minDate])

  const isMaxReached = useMemo(() => {
    if (!config.maxDate) return false
    return resolvedValue.end.isAfter(config.maxDate, resolvedValue.granularity) || resolvedValue.end.isSame(config.maxDate, resolvedValue.granularity)
  }, [resolvedValue.end, resolvedValue.granularity, config.maxDate])

  const disabledDate = (current: Dayjs) => {
    if (!current) return false
    if (config.minDate && current.isBefore(config.minDate, 'day')) return true
    if (config.maxDate && current.isAfter(config.maxDate, 'day')) return true
    return false
  }

  const handleGranularityChange = (granularity: TimeGranularity) => {
    const nextValue =
      config.presets[granularity]?.[0]?.getValue(dayjs()) ||
      createRangeValue(granularity, resolvedValue.start, resolvedValue.end)
    onChange(normalizeRangeValue(nextValue))
  }

  const handlePresetClick = (presetKey: string) => {
    const preset = currentPresets.find((item) => item.key === presetKey)
    if (!preset) return
    onChange(normalizeRangeValue(preset.getValue(dayjs())))
    setOpen(false)
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
      setOpen(false)
    }
  }

  const handlePrevClick = () => {
    if (!isMinReached) {
      onChange(moveRangeValue(resolvedValue, -1))
    }
  }

  const handleNextClick = () => {
    if (!isMaxReached) {
      onChange(moveRangeValue(resolvedValue, 1))
    }
  }

  const dropdownContent = (
    <div style={{ 
      padding: 16,
      backgroundColor: '#fff',
      borderRadius: 8,
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
      maxWidth: 'calc(100vw - 32px)'
    }}>
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: 16 
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          gap: 12 
        }}>
          <Button 
            size="small" 
            icon={<LeftOutlined />} 
            onClick={handlePrevClick}
            disabled={isMinReached}
          />
          <div style={{ 
            fontSize: 14,
            fontWeight: 500,
            color: '#262626',
            minWidth: 160,
            textAlign: 'center',
            whiteSpace: 'nowrap'
          }}>
            {formatRangeValue(resolvedValue)}
          </div>
          <Button 
            size="small" 
            icon={<RightOutlined />} 
            onClick={handleNextClick}
            disabled={isMaxReached}
          />
        </div>

        {config.allowedGranularities.length > 1 && (
          <Segmented
            block
            size="small"
            value={resolvedValue.granularity}
            onChange={(val) => handleGranularityChange(val as TimeGranularity)}
            options={config.allowedGranularities.map((item) => ({ 
              label: getGranularityText(item), 
              value: item 
            }))}
          />
        )}

        {currentPresets.length > 0 && (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(2, 1fr)', 
            gap: 8 
          }}>
            {currentPresets.map((preset) => (
              <Button
                key={preset.key}
                size="small"
                onClick={() => handlePresetClick(preset.key)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        )}

        <DatePicker.RangePicker
          style={{ width: '100%' }}
          value={[resolvedValue.start, resolvedValue.end]}
          picker={resolvedValue.granularity === 'day' ? undefined : resolvedValue.granularity}
          onChange={handleDateChange}
          onOpenChange={(pickerOpen) => {
            if (pickerOpen) setOpen(true)
          }}
          placeholder={['开始日期', '结束日期']}
          disabledDate={disabledDate}
        />
      </div>
    </div>
  )

  return (
    <Dropdown
      dropdownRender={() => dropdownContent}
      trigger={['click']}
      open={open}
      onOpenChange={setOpen}
    >
      <Button disabled={disabled} icon={<CalendarOutlined />} style={style}>
        {value ? formatRangeValue(value) : placeholder || '选择时间'}
      </Button>
    </Dropdown>
  )
}

export type { PointTimePickerConfig, PointTimeValue, RangeTimePickerConfig, RangeTimeValue, TimeGranularity }
