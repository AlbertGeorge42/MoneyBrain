import React, { useMemo, useState } from 'react'
import { Button, Drawer, Segmented } from 'antd'
import { CalendarOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import {
  colorBorderSubtle,
  colorActionPrimary,
  colorOnActionPrimary,
  colorBgHover,
  colorBgApp,
  colorBgSelected,
  colorTextPrimary,
  spaceCardPadding,
  spaceInlineDefault,
} from '../../styles/tokens'
import {
  createPointValue,
  createRangeValue,
  formatPointValue,
  formatRangeValue,
  getGranularityText,
  normalizePointValue,
  normalizeRangeValue,
  type PointTimePickerConfig,
  type PointTimeValue,
  type RangeTimePickerConfig,
  type RangeTimeValue,
  type TimeGranularity,
} from '../../utils/timePicker'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const CELL_HEIGHT = 36
const CELL_RADIUS = 8

interface GridCell {
  label: string
  value: Dayjs
  isSelected: boolean
  isStart: boolean
  isEnd: boolean
  isInRange: boolean
  isDisabled: boolean
}

interface CalendarHeaderProps {
  title: string
  onPrev?: () => void
  onNext?: () => void
}

const CalendarHeader: React.FC<CalendarHeaderProps> = ({ title, onPrev, onNext }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${spaceInlineDefault} ${spaceCardPadding}`,
    borderBottom: `1px solid ${colorBorderSubtle}`,
  }}>
    <button
      type="button"
      onClick={onPrev}
      style={navBtnStyle}
    >
      <LeftOutlined style={{ fontSize: 12 }} />
    </button>
    <span style={{ fontSize: 16, fontWeight: 500, color: colorTextPrimary }}>{title}</span>
    <button
      type="button"
      onClick={onNext}
      style={navBtnStyle}
    >
      <RightOutlined style={{ fontSize: 12 }} />
    </button>
  </div>
)

const navBtnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 16,
  border: 'none',
  background: 'transparent',
  color: colorTextPrimary,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 0.2s',
}

const getCellStyle = (cell: GridCell): React.CSSProperties => {
  const isEdge = cell.isStart || cell.isEnd

  let background = 'transparent'
  if (isEdge) {
    background = colorActionPrimary
  } else if (cell.isInRange) {
    background = colorBgSelected
  }

  let color: string | undefined
  if (isEdge) {
    color = colorOnActionPrimary
  } else if (cell.isDisabled) {
    color = colorTextPrimary
  }

  let borderRadius: string | undefined
  if (isEdge) {
    borderRadius = `${CELL_RADIUS}px`
  }

  return {
    height: CELL_HEIGHT,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background,
    color,
    borderRadius,
    cursor: cell.isDisabled ? 'not-allowed' : 'pointer',
    fontSize: 14,
    transition: 'background 0.2s, color 0.2s',
    opacity: cell.isDisabled ? 0.25 : 1,
    fontWeight: isEdge ? 600 : 400,
  }
}

const renderGrid = (cells: GridCell[], onSelect: (value: Dayjs) => void, columns = 3) => {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gap: 2,
      padding: 4,
    }}>
      {cells.map((cell, index) => (
        <div
          key={cell.label + index}
          style={getCellStyle(cell)}
          onMouseEnter={(e) => {
            if (!cell.isDisabled && !cell.isSelected) {
              (e.target as HTMLElement).style.background = colorBgHover
            }
          }}
          onMouseLeave={(e) => {
            if (!cell.isDisabled && !cell.isSelected) {
              (e.target as HTMLElement).style.background = 'transparent'
            }
          }}
          onClick={() => {
            if (!cell.isDisabled) onSelect(cell.value)
          }}
        >
          {cell.label}
        </div>
      ))}
    </div>
  )
}

const renderDayGrid = (
  currentMonth: Dayjs,
  tempStart: Dayjs,
  tempEnd: Dayjs | null,
  minDate: Dayjs | undefined,
  maxDate: Dayjs | undefined,
  isRange: boolean,
  onSelect: (value: Dayjs) => void,
) => {
  const monthStart = currentMonth.startOf('month')
  const daysInMonth = currentMonth.daysInMonth()
  const startDay = monthStart.day()

  const cells: (GridCell | null)[] = []

  for (let i = 0; i < startDay; i++) {
    cells.push(null)
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = currentMonth.date(d)
    const isStart = !!(tempStart && date.isSame(tempStart, 'day'))
    const isEnd = !!(tempEnd && date.isSame(tempEnd, 'day'))
    const isSelected = isRange ? (isStart || isEnd) : isStart
    const isInRange = !!(isRange && tempStart && tempEnd
      && date.isAfter(tempStart, 'day')
      && date.isBefore(tempEnd, 'day'))
    const isDisabled = !!(minDate && date.isBefore(minDate, 'day')) || !!(maxDate && date.isAfter(maxDate, 'day'))

    cells.push({
      label: String(d),
      value: date,
      isSelected,
      isStart,
      isEnd,
      isInRange,
      isDisabled,
    })
  }

  const remaining = (7 - (cells.length % 7)) % 7
  for (let i = 0; i < remaining; i++) cells.push(null)

  return (
    <div style={{ padding: '0 4px' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              borderBottom: `1px solid ${colorBorderSubtle}`,
            }}>
              {WEEKDAYS.map((day) => (
                <div key={day} style={{
                  textAlign: 'center',
                  fontSize: 12,
                  color: colorTextPrimary,
                  opacity: 0.45,
                  padding: '4px 0',
                  background: colorBgApp,
                }}>
            {day}
          </div>
        ))}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 2,
        padding: '4px 0',
      }}>
        {cells.map((cell, i) => {
          if (!cell) return <div key={`e-${i}`} style={{ height: CELL_HEIGHT }} />
          return (
            <div
              key={cell.value.format('YYYY-MM-DD')}
              style={getCellStyle(cell)}
              onMouseEnter={(e) => {
                if (!cell.isDisabled && !cell.isSelected && !cell.isStart && !cell.isEnd) {
                  (e.target as HTMLElement).style.background = colorBgHover
                }
              }}
              onMouseLeave={(e) => {
                if (!cell.isDisabled && !cell.isSelected && !cell.isStart && !cell.isEnd) {
                  (e.target as HTMLElement).style.background = cell.isInRange ? colorBgSelected : 'transparent'
                }
              }}
              onClick={() => {
                if (!cell.isDisabled) onSelect(cell.value)
              }}
            >
              {cell.label}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const getMonthGridCells = (
  currentMonth: Dayjs,
  tempStart: Dayjs,
  tempEnd: Dayjs | null,
  minDate: Dayjs | undefined,
  maxDate: Dayjs | undefined,
  isRange: boolean,
): GridCell[] => {
  return Array.from({ length: 12 }, (_, i) => {
    const monthDate = currentMonth.month(i).startOf('month')
    const isStart = !!(tempStart && monthDate.isSame(tempStart, 'month'))
    const isEnd = !!(tempEnd && monthDate.isSame(tempEnd, 'month'))
    const isInRange = !!(isRange && tempStart && tempEnd
      && monthDate.isAfter(tempStart, 'month')
      && monthDate.isBefore(tempEnd, 'month'))
    const isDisabled = !!(minDate && monthDate.isBefore(minDate, 'month'))
      || !!(maxDate && monthDate.isAfter(maxDate, 'month'))

    return {
      label: `${i + 1}月`,
      value: monthDate,
      isSelected: isStart || isEnd,
      isStart,
      isEnd,
      isInRange,
      isDisabled,
    }
  })
}

const getYearGridCells = (
  tempDate: Dayjs,
  tempEnd: Dayjs | null,
  minDate: Dayjs | undefined,
  maxDate: Dayjs | undefined,
  isRange: boolean,
): GridCell[] => {
  const decadeStart = Math.floor(tempDate.year() / 10) * 10

  return Array.from({ length: 12 }, (_, i) => {
    const year = decadeStart + i - 1
    const yearDate = dayjs().year(year).startOf('year')
    const isStart = !!(tempDate && yearDate.isSame(tempDate, 'year'))
    const isEnd = !!(tempEnd && yearDate.isSame(tempEnd, 'year'))
    const isInRange = !!(isRange && tempDate && tempEnd
      && yearDate.isAfter(tempDate, 'year')
      && yearDate.isBefore(tempEnd, 'year'))
    const isDisabled = !!(minDate && yearDate.isBefore(minDate, 'year'))
      || !!(maxDate && yearDate.isAfter(maxDate, 'year'))

    return {
      label: String(year),
      value: yearDate,
      isSelected: isStart || isEnd,
      isStart,
      isEnd,
      isInRange,
      isDisabled,
    }
  })
}

const getHeaderTitle = (granularity: TimeGranularity, currentMonth: Dayjs): string => {
  if (granularity === 'day') return currentMonth.format('YYYY年MM月')
  if (granularity === 'month') return currentMonth.format('YYYY年')
  const decadeStart = Math.floor(currentMonth.year() / 10) * 10
  return `${decadeStart} - ${decadeStart + 9}`
}

interface PointMobileProps {
  value: PointTimeValue
  config: PointTimePickerConfig
  onChange: (value: PointTimeValue) => void
  disabled?: boolean
  style?: React.CSSProperties
}

export const PointTimePickerMobile: React.FC<PointMobileProps> = ({
  value,
  config,
  onChange,
  disabled,
  style,
}) => {
  const [open, setOpen] = useState(false)
  const [tempDate, setTempDate] = useState<Dayjs>(value.value)
  const [tempGranularity, setTempGranularity] = useState<TimeGranularity>(value.granularity)
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(value.value)

  const openDrawer = () => {
    setTempDate(value.value)
    setTempGranularity(value.granularity)
    setCurrentMonth(value.value)
    setOpen(true)
  }

  const handleConfirm = () => {
    onChange(normalizePointValue({ granularity: tempGranularity, value: tempDate }))
    setOpen(false)
  }

  const handleCellSelect = (cellValue: Dayjs) => {
    setTempDate(cellValue)
  }

  const handleGranularityChange = (granularity: TimeGranularity) => {
    const nextValue = config.presets[granularity]?.[0]?.getValue(dayjs()) || createPointValue(granularity, tempDate)
    setTempGranularity(granularity)
    setTempDate(nextValue.value)
    setCurrentMonth(nextValue.value)
  }

  const handlePresetClick = (presetKey: string) => {
    const presetsForGranularity = config.presets[tempGranularity] || []
    const preset = presetsForGranularity.find((item) => item.key === presetKey)
    if (!preset) return
    const nextValue = preset.getValue(dayjs())
    setTempDate(nextValue.value)
    setTempGranularity(nextValue.granularity)
    setCurrentMonth(nextValue.value)
  }

  const mobilePresets = useMemo(
    () => config.presets[tempGranularity] || [],
    [config.presets, tempGranularity]
  )

  const handlePrev = () => {
    if (tempGranularity === 'year') setCurrentMonth((prev) => prev.subtract(10, 'year'))
    else if (tempGranularity === 'month') setCurrentMonth((prev) => prev.subtract(1, 'year'))
    else setCurrentMonth((prev) => prev.subtract(1, 'month'))
  }

  const handleNext = () => {
    if (tempGranularity === 'year') setCurrentMonth((prev) => prev.add(10, 'year'))
    else if (tempGranularity === 'month') setCurrentMonth((prev) => prev.add(1, 'year'))
    else setCurrentMonth((prev) => prev.add(1, 'month'))
  }

  const title = getHeaderTitle(tempGranularity, currentMonth)

  return (
    <>
      <Button
        disabled={disabled}
        icon={<CalendarOutlined />}
        style={{ width: '100%', ...style }}
        onClick={openDrawer}
      >
        {formatPointValue(value)}
      </Button>
      <Drawer
        title="选择时间"
        placement="bottom"
        open={open}
        onClose={() => setOpen(false)}
        height="auto"
        styles={{
          body: { padding: 0 },
          header: { borderBottom: `1px solid ${colorBorderSubtle}` },
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: spaceCardPadding }}>
          <CalendarHeader title={title} onPrev={handlePrev} onNext={handleNext} />

          {tempGranularity === 'day' && renderDayGrid(
            currentMonth, tempDate, null,
            config.minDate, config.maxDate, false, handleCellSelect,
          )}

          {tempGranularity === 'month' && renderGrid(
            getMonthGridCells(currentMonth, tempDate, null, config.minDate, config.maxDate, false),
            handleCellSelect,
          )}

          {tempGranularity === 'year' && renderGrid(
            getYearGridCells(tempDate, null, config.minDate, config.maxDate, false),
            handleCellSelect,
          )}

          {config.allowedGranularities.length > 1 && (
            <div style={{ padding: `0 ${spaceCardPadding}` }}>
              <Segmented
                block
                size="small"
                value={tempGranularity}
                onChange={(val) => handleGranularityChange(val as TimeGranularity)}
                options={config.allowedGranularities.map((item) => ({
                  label: getGranularityText(item),
                  value: item,
                }))}
              />
            </div>
          )}

          {mobilePresets.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: spaceInlineDefault,
              padding: `0 ${spaceCardPadding}`,
            }}>
              {mobilePresets.map((preset) => (
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

          <div style={{
            display: 'flex',
            gap: spaceInlineDefault,
            padding: spaceCardPadding,
            borderTop: `1px solid ${colorBorderSubtle}`,
          }}>
            <Button block onClick={() => setOpen(false)}>取消</Button>
            <Button block type="primary" onClick={handleConfirm}>确定</Button>
          </div>
        </div>
      </Drawer>
    </>
  )
}

interface RangeMobileProps {
  value: RangeTimeValue | null
  config: RangeTimePickerConfig
  onChange: (value: RangeTimeValue) => void
  disabled?: boolean
  style?: React.CSSProperties
  placeholder?: string
}

export const RangeTimePickerMobile: React.FC<RangeMobileProps> = ({
  value,
  config,
  onChange,
  disabled,
  style,
  placeholder,
}) => {
  const resolvedValue = useMemo(() => {
    if (value) return value
    const firstGranularity = config.allowedGranularities[0] || 'day'
    const fallback = config.presets[firstGranularity]?.[0]?.getValue(dayjs())
    return fallback || createRangeValue('day', dayjs().startOf('day'), dayjs().endOf('day'))
  }, [config.allowedGranularities, config.presets, value])

  const [open, setOpen] = useState(false)
  const [tempStart, setTempStart] = useState<Dayjs>(resolvedValue.start)
  const [tempEnd, setTempEnd] = useState<Dayjs>(resolvedValue.end)
  const [tempGranularity, setTempGranularity] = useState<TimeGranularity>(resolvedValue.granularity)
  const [selecting, setSelecting] = useState(false)
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(resolvedValue.start)

  const openDrawer = () => {
    setTempStart(resolvedValue.start)
    setTempEnd(resolvedValue.end)
    setTempGranularity(resolvedValue.granularity)
    setCurrentMonth(resolvedValue.start)
    setSelecting(false)
    setOpen(true)
  }

  const handleConfirm = () => {
    if (tempStart && tempEnd) {
      onChange(normalizeRangeValue({ granularity: tempGranularity, start: tempStart, end: tempEnd }))
    }
    setOpen(false)
  }

  const handleCellSelect = (cellValue: Dayjs, unit: 'day' | 'month' | 'year') => {
    if (!selecting) {
      setTempStart(cellValue.startOf(unit))
      setTempEnd(cellValue.endOf(unit))
      setSelecting(true)
    } else {
      if (cellValue.isBefore(tempStart, unit)) {
        setTempStart(cellValue.startOf(unit))
        setTempEnd(cellValue.endOf(unit))
        setSelecting(true)
      } else {
        setTempEnd(cellValue.endOf(unit))
        setSelecting(false)
      }
    }
  }

  const handleGranularityChange = (granularity: TimeGranularity) => {
    const nextValue = config.presets[granularity]?.[0]?.getValue(dayjs())
      || createRangeValue(granularity, tempStart, tempEnd)
    setTempGranularity(granularity)
    setTempStart(nextValue.start)
    setTempEnd(nextValue.end)
    setSelecting(false)
    setCurrentMonth(nextValue.start)
  }

  const handlePresetClick = (presetKey: string) => {
    const presetsForGranularity = config.presets[tempGranularity] || []
    const preset = presetsForGranularity.find((item) => item.key === presetKey)
    if (!preset) return
    const nextValue = preset.getValue(dayjs())
    setTempStart(nextValue.start)
    setTempEnd(nextValue.end)
    setTempGranularity(nextValue.granularity)
    setSelecting(false)
  }

  const mobilePresets = useMemo(
    () => config.presets[tempGranularity] || [],
    [config.presets, tempGranularity]
  )

  const handlePrev = () => {
    if (tempGranularity === 'year') setCurrentMonth((prev) => prev.subtract(10, 'year'))
    else if (tempGranularity === 'month') setCurrentMonth((prev) => prev.subtract(1, 'year'))
    else setCurrentMonth((prev) => prev.subtract(1, 'month'))
  }

  const handleNext = () => {
    if (tempGranularity === 'year') setCurrentMonth((prev) => prev.add(10, 'year'))
    else if (tempGranularity === 'month') setCurrentMonth((prev) => prev.add(1, 'year'))
    else setCurrentMonth((prev) => prev.add(1, 'month'))
  }

  const title = getHeaderTitle(tempGranularity, currentMonth)

  return (
    <>
      <Button
        disabled={disabled}
        icon={<CalendarOutlined />}
        style={{ width: '100%', ...style }}
        onClick={openDrawer}
      >
        {value ? formatRangeValue(value) : placeholder || '选择时间'}
      </Button>
      <Drawer
        title="选择时间范围"
        placement="bottom"
        open={open}
        onClose={() => setOpen(false)}
        height="auto"
        styles={{
          body: { padding: 0 },
          header: { borderBottom: `1px solid ${colorBorderSubtle}` },
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: spaceCardPadding }}>
          <CalendarHeader title={title} onPrev={handlePrev} onNext={handleNext} />

          {tempGranularity === 'day' && renderDayGrid(
            currentMonth, tempStart, tempEnd,
            config.minDate, config.maxDate, true,
            (cellValue) => handleCellSelect(cellValue, 'day'),
          )}

          {tempGranularity === 'month' && renderGrid(
            getMonthGridCells(currentMonth, tempStart, tempEnd, config.minDate, config.maxDate, true),
            (cellValue) => handleCellSelect(cellValue, 'month'),
          )}

          {tempGranularity === 'year' && renderGrid(
            getYearGridCells(tempStart, tempEnd, config.minDate, config.maxDate, true),
            (cellValue) => handleCellSelect(cellValue, 'year'),
          )}

          {config.allowedGranularities.length > 1 && (
            <div style={{ padding: `0 ${spaceCardPadding}` }}>
              <Segmented
                block
                size="small"
                value={tempGranularity}
                onChange={(val) => handleGranularityChange(val as TimeGranularity)}
                options={config.allowedGranularities.map((item) => ({
                  label: getGranularityText(item),
                  value: item,
                }))}
              />
            </div>
          )}

          {mobilePresets.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: spaceInlineDefault,
              padding: `0 ${spaceCardPadding}`,
            }}>
              {mobilePresets.map((preset) => (
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

          <div style={{
            display: 'flex',
            gap: spaceInlineDefault,
            padding: spaceCardPadding,
            borderTop: `1px solid ${colorBorderSubtle}`,
          }}>
            <Button block onClick={() => setOpen(false)}>取消</Button>
            <Button block type="primary" onClick={handleConfirm}>确定</Button>
          </div>
        </div>
      </Drawer>
    </>
  )
}

export type { GridCell }
