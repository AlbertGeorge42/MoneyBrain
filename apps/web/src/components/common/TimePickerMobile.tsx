import React, { useMemo, useState } from 'react'
import { Button, Drawer, Segmented, theme } from 'antd'
import { CalendarOutlined, DownOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import {
  createPointValue,
  createRangeValue,
  formatPointValue,
  formatRangeValue,
  getGranularityText,
  getMinViewLevel,
  isPointAtMax,
  isPointAtMin,
  isRangeAtMax,
  isRangeAtMin,
  movePointValue,
  moveRangeValue,
  normalizePointValue,
  normalizeRangeValue,
  type PointTimePickerConfig,
  type PointTimeValue,
  type RangeTimePickerConfig,
  type RangeTimeValue,
  type TimeGranularity,
  type ViewLevel,
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

interface CellStyleColors {
  colorActionPrimary: string
  colorBgSelected: string
  colorOnActionPrimary: string
  colorTextPrimary: string
}

interface CalendarHeaderProps {
  title: string
  onPrev?: () => void
  onNext?: () => void
  onTitleClick?: () => void
  titleClickable?: boolean
  prevDisabled?: boolean
  nextDisabled?: boolean
  colorTextPrimary: string
  colorBgHover: string
  colorBorderSubtle: string
  spaceCardPadding: string
  spaceInlineDefault: string
}

const CalendarHeader: React.FC<CalendarHeaderProps> = ({
  title,
  onPrev,
  onNext,
  onTitleClick,
  titleClickable,
  prevDisabled,
  nextDisabled,
  colorTextPrimary,
  colorBgHover,
  colorBorderSubtle,
  spaceCardPadding,
  spaceInlineDefault,
}) => {
  const [titlePressed, setTitlePressed] = useState(false)

  const navBtnStyle: React.CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: 16,
    border: 'none',
    background: 'transparent',
    color: colorTextPrimary,
    cursor: prevDisabled || nextDisabled ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.15s',
    opacity: prevDisabled || nextDisabled ? 0.3 : 1,
  }

  const titleBtnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    border: 'none',
    background: titlePressed ? colorBgHover : 'transparent',
    cursor: 'pointer',
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 16,
    fontWeight: 500,
    color: colorTextPrimary,
    transition: 'background 0.15s',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
  }

  return (
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
        disabled={prevDisabled}
        style={navBtnStyle}
      >
        <LeftOutlined style={{ fontSize: 12 }} />
      </button>
      {titleClickable ? (
        <button
          type="button"
          onClick={onTitleClick}
          onMouseDown={() => setTitlePressed(true)}
          onMouseUp={() => setTitlePressed(false)}
          onMouseLeave={() => setTitlePressed(false)}
          onTouchStart={() => setTitlePressed(true)}
          onTouchEnd={() => setTitlePressed(false)}
          style={titleBtnStyle}
        >
          {title}
          <DownOutlined style={{ fontSize: 10, opacity: 0.6 }} />
        </button>
      ) : (
        <span style={{ fontSize: 16, fontWeight: 500, color: colorTextPrimary, padding: '4px 10px' }}>{title}</span>
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        style={navBtnStyle}
      >
        <RightOutlined style={{ fontSize: 12 }} />
      </button>
    </div>
  )
}

const getCellStyle = (cell: GridCell, c: CellStyleColors): React.CSSProperties => {
  const isEdge = cell.isStart || cell.isEnd

  let background = 'transparent'
  if (isEdge) {
    background = c.colorActionPrimary
  } else if (cell.isInRange) {
    background = c.colorBgSelected
  }

  let color: string | undefined
  if (isEdge) {
    color = c.colorOnActionPrimary
  } else if (cell.isDisabled) {
    color = c.colorTextPrimary
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

interface GridColors extends CellStyleColors {
  colorBgHover: string
  colorBorderSubtle: string
  colorBgApp: string
}

const renderGrid = (cells: GridCell[], onSelect: (value: Dayjs) => void, c: GridColors, columns = 3) => {
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
          style={getCellStyle(cell, c)}
          onMouseEnter={(e) => {
            if (!cell.isDisabled && !cell.isSelected) {
              (e.target as HTMLElement).style.background = c.colorBgHover
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
  tempStart: Dayjs | null,
  tempEnd: Dayjs | null,
  minDate: Dayjs | undefined,
  maxDate: Dayjs | undefined,
  isRange: boolean,
  onSelect: (value: Dayjs) => void,
  c: GridColors,
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
              borderBottom: `1px solid ${c.colorBorderSubtle}`,
            }}>
              {WEEKDAYS.map((day) => (
                <div key={day} style={{
                  textAlign: 'center',
                  fontSize: 12,
                  color: c.colorTextPrimary,
                  opacity: 0.45,
                  padding: '4px 0',
                  background: c.colorBgApp,
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
              style={getCellStyle(cell, c)}
              onMouseEnter={(e) => {
                if (!cell.isDisabled && !cell.isSelected && !cell.isStart && !cell.isEnd) {
                  (e.target as HTMLElement).style.background = c.colorBgHover
                }
              }}
              onMouseLeave={(e) => {
                if (!cell.isDisabled && !cell.isSelected && !cell.isStart && !cell.isEnd) {
                  (e.target as HTMLElement).style.background = cell.isInRange ? c.colorBgSelected : 'transparent'
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
  anchor: Dayjs,
  selectedStart: Dayjs | null,
  selectedEnd: Dayjs | null,
  minDate: Dayjs | undefined,
  maxDate: Dayjs | undefined,
  isRange: boolean,
): GridCell[] => {
  return Array.from({ length: 12 }, (_, i) => {
    const monthDate = anchor.month(i).startOf('month')
    const isStart = !!(selectedStart && monthDate.isSame(selectedStart, 'month'))
    const isEnd = !!(selectedEnd && monthDate.isSame(selectedEnd, 'month'))
    const isInRange = !!(isRange && selectedStart && selectedEnd
      && monthDate.isAfter(selectedStart, 'month')
      && monthDate.isBefore(selectedEnd, 'month'))
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
  anchor: Dayjs,
  selectedStart: Dayjs | null,
  selectedEnd: Dayjs | null,
  minDate: Dayjs | undefined,
  maxDate: Dayjs | undefined,
  isRange: boolean,
): GridCell[] => {
  const decadeStart = Math.floor(anchor.year() / 10) * 10

  return Array.from({ length: 12 }, (_, i) => {
    const year = decadeStart + i - 1
    const yearDate = dayjs().year(year).startOf('year')
    const isStart = !!(selectedStart && yearDate.isSame(selectedStart, 'year'))
    const isEnd = !!(selectedEnd && yearDate.isSame(selectedEnd, 'year'))
    const isInRange = !!(isRange && selectedStart && selectedEnd
      && yearDate.isAfter(selectedStart, 'year')
      && yearDate.isBefore(selectedEnd, 'year'))
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

const getHeaderTitle = (viewLevel: ViewLevel, currentMonth: Dayjs): string => {
  if (viewLevel === 'month') return currentMonth.format('YYYY年MM月')
  if (viewLevel === 'year') return currentMonth.format('YYYY年')
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
  const { token } = theme.useToken()
  const colorBorderSubtle = token.colorBorderSecondary
  const colorActionPrimary = token.colorPrimary
  const colorOnActionPrimary = token.colorWhite
  const colorBgHover = token.controlItemBgHover || token.colorBgTextHover
  const colorBgApp = token.colorBgLayout
  const colorBgSelected = token.controlItemBgActive || token.colorPrimaryBg
  const colorTextPrimary = token.colorText
  const spaceCardPadding = `${token.padding}px`
  const spaceInlineDefault = `${token.paddingXS}px`

  const gridColors: GridColors = {
    colorActionPrimary,
    colorBgSelected,
    colorOnActionPrimary,
    colorTextPrimary,
    colorBgHover,
    colorBorderSubtle,
    colorBgApp,
  }

  const [open, setOpen] = useState(false)
  const [tempDate, setTempDate] = useState<Dayjs>(value.value)
  const [tempGranularity, setTempGranularity] = useState<TimeGranularity>(value.granularity)
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(value.value)
  const [viewLevel, setViewLevel] = useState<ViewLevel>(getMinViewLevel(value.granularity))

  // 派生值：当前粒度对应的最小视图层级
  const minViewLevel = getMinViewLevel(tempGranularity)
  const isAtMinLevel = viewLevel === minViewLevel
  const titleClickable = viewLevel !== 'decade'

  const openDrawer = () => {
    setTempDate(value.value)
    setTempGranularity(value.granularity)
    setCurrentMonth(value.value)
    setViewLevel(getMinViewLevel(value.granularity))
    setOpen(true)
  }

  const handleConfirm = () => {
    onChange(normalizePointValue({ granularity: tempGranularity, value: tempDate }))
    setOpen(false)
  }

  // 标题点击：向上升级视图层级
  const handleTitleClick = () => {
    if (viewLevel === 'decade') return
    if (viewLevel === 'month') setViewLevel('year')
    else setViewLevel('decade')
  }

  // 格子点击分发：最底层走选择逻辑，导航层走下钻逻辑
  const handleCellClick = (cellValue: Dayjs) => {
    if (isAtMinLevel) {
      setTempDate(cellValue)
    } else {
      // 导航层：更新 currentMonth，降级 viewLevel 一级
      setCurrentMonth(cellValue)
      if (viewLevel === 'decade') setViewLevel('year')
      else if (viewLevel === 'year') setViewLevel('month')
    }
  }

  const handleGranularityChange = (granularity: TimeGranularity) => {
    const nextValue = config.presets[granularity]?.[0]?.getValue(dayjs()) || createPointValue(granularity, tempDate)
    setTempGranularity(granularity)
    setTempDate(nextValue.value)
    setCurrentMonth(nextValue.value)
    setViewLevel(getMinViewLevel(granularity))
  }

  const handlePresetClick = (presetKey: string) => {
    const presetsForGranularity = config.presets[tempGranularity] || []
    const preset = presetsForGranularity.find((item) => item.key === presetKey)
    if (!preset) return
    const nextValue = preset.getValue(dayjs())
    setTempDate(nextValue.value)
    setTempGranularity(nextValue.granularity)
    setCurrentMonth(nextValue.value)
    setViewLevel(getMinViewLevel(nextValue.granularity))
  }

  const mobilePresets = useMemo(
    () => config.presets[tempGranularity] || [],
    [config.presets, tempGranularity]
  )

  // 箭头：最底层移动值，导航层翻页浏览
  const handlePrev = () => {
    if (isAtMinLevel) {
      const newValue = movePointValue({ granularity: tempGranularity, value: tempDate }, -1)
      setTempDate(newValue.value)
      setCurrentMonth(newValue.value)
    } else {
      // 导航层：按 viewLevel 翻页，不修改 temp 值
      setCurrentMonth((prev) => viewLevel === 'year' ? prev.subtract(1, 'year') : prev.subtract(10, 'year'))
    }
  }

  const handleNext = () => {
    if (isAtMinLevel) {
      const newValue = movePointValue({ granularity: tempGranularity, value: tempDate }, 1)
      setTempDate(newValue.value)
      setCurrentMonth(newValue.value)
    } else {
      // 导航层：按 viewLevel 翻页，不修改 temp 值
      setCurrentMonth((prev) => viewLevel === 'year' ? prev.add(1, 'year') : prev.add(10, 'year'))
    }
  }

  // 箭头禁用判断：导航层始终可用，仅最底层受 min/max 限制
  const prevDisabled = isAtMinLevel && isPointAtMin({ granularity: tempGranularity, value: tempDate }, config.minDate)
  const nextDisabled = isAtMinLevel && isPointAtMax({ granularity: tempGranularity, value: tempDate }, config.maxDate)

  const title = getHeaderTitle(viewLevel, currentMonth)

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
          <CalendarHeader
            title={title}
            onPrev={handlePrev}
            onNext={handleNext}
            onTitleClick={handleTitleClick}
            titleClickable={titleClickable}
            prevDisabled={prevDisabled}
            nextDisabled={nextDisabled}
            colorTextPrimary={colorTextPrimary}
            colorBgHover={colorBgHover}
            colorBorderSubtle={colorBorderSubtle}
            spaceCardPadding={spaceCardPadding}
            spaceInlineDefault={spaceInlineDefault}
          />

          <div key={viewLevel} style={{ animation: 'mb-picker-fade-in 0.18s ease-out' }}>
            {viewLevel === 'month' && renderDayGrid(
              currentMonth,
              isAtMinLevel ? tempDate : null,
              null,
              config.minDate, config.maxDate, false, handleCellClick,
              gridColors,
            )}

            {viewLevel === 'year' && renderGrid(
              getMonthGridCells(
                currentMonth,
                isAtMinLevel ? tempDate : null,
                null,
                config.minDate, config.maxDate, false,
              ),
              handleCellClick,
              gridColors,
            )}

            {viewLevel === 'decade' && renderGrid(
              getYearGridCells(
                currentMonth,
                isAtMinLevel ? tempDate : null,
                null,
                config.minDate, config.maxDate, false,
              ),
              handleCellClick,
              gridColors,
            )}
          </div>

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

          {isAtMinLevel && mobilePresets.length > 0 && (
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

  const { token } = theme.useToken()
  const colorBorderSubtle = token.colorBorderSecondary
  const colorActionPrimary = token.colorPrimary
  const colorOnActionPrimary = token.colorWhite
  const colorBgHover = token.controlItemBgHover || token.colorBgTextHover
  const colorBgApp = token.colorBgLayout
  const colorBgSelected = token.controlItemBgActive || token.colorPrimaryBg
  const colorTextPrimary = token.colorText
  const spaceCardPadding = `${token.padding}px`
  const spaceInlineDefault = `${token.paddingXS}px`

  const gridColors: GridColors = {
    colorActionPrimary,
    colorBgSelected,
    colorOnActionPrimary,
    colorTextPrimary,
    colorBgHover,
    colorBorderSubtle,
    colorBgApp,
  }

  const [open, setOpen] = useState(false)
  const [tempStart, setTempStart] = useState<Dayjs>(resolvedValue.start)
  const [tempEnd, setTempEnd] = useState<Dayjs>(resolvedValue.end)
  const [tempGranularity, setTempGranularity] = useState<TimeGranularity>(resolvedValue.granularity)
  const [selecting, setSelecting] = useState(false)
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(resolvedValue.start)
  const [viewLevel, setViewLevel] = useState<ViewLevel>(getMinViewLevel(resolvedValue.granularity))

  // 派生值
  const minViewLevel = getMinViewLevel(tempGranularity)
  const isAtMinLevel = viewLevel === minViewLevel
  const titleClickable = viewLevel !== 'decade'

  const openDrawer = () => {
    setTempStart(resolvedValue.start)
    setTempEnd(resolvedValue.end)
    setTempGranularity(resolvedValue.granularity)
    setCurrentMonth(resolvedValue.start)
    setSelecting(false)
    setViewLevel(getMinViewLevel(resolvedValue.granularity))
    setOpen(true)
  }

  const handleConfirm = () => {
    if (tempStart && tempEnd) {
      onChange(normalizeRangeValue({ granularity: tempGranularity, start: tempStart, end: tempEnd }))
    }
    setOpen(false)
  }

  // 标题点击：向上升级视图层级
  const handleTitleClick = () => {
    if (viewLevel === 'decade') return
    if (viewLevel === 'month') setViewLevel('year')
    else setViewLevel('decade')
  }

  // 格子点击分发
  const handleCellClick = (cellValue: Dayjs) => {
    if (isAtMinLevel) {
      // 最底层：现有 Range 选择逻辑
      if (!selecting) {
        setTempStart(cellValue.startOf(tempGranularity))
        setTempEnd(cellValue.endOf(tempGranularity))
        setSelecting(true)
      } else {
        if (cellValue.isBefore(tempStart, tempGranularity)) {
          setTempStart(cellValue.startOf(tempGranularity))
          setTempEnd(cellValue.endOf(tempGranularity))
          setSelecting(true)
        } else {
          setTempEnd(cellValue.endOf(tempGranularity))
          setSelecting(false)
        }
      }
    } else {
      // 导航层：仅更新 currentMonth，降级 viewLevel，不触发 selecting
      setCurrentMonth(cellValue)
      if (viewLevel === 'decade') setViewLevel('year')
      else if (viewLevel === 'year') setViewLevel('month')
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
    setViewLevel(getMinViewLevel(granularity))
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
    setCurrentMonth(nextValue.start)
    setViewLevel(getMinViewLevel(nextValue.granularity))
  }

  const mobilePresets = useMemo(
    () => config.presets[tempGranularity] || [],
    [config.presets, tempGranularity]
  )

  // 箭头：最底层按区间跨度整体平移，导航层翻页浏览
  const handlePrev = () => {
    if (isAtMinLevel) {
      const newValue = moveRangeValue({ granularity: tempGranularity, start: tempStart, end: tempEnd }, -1)
      setTempStart(newValue.start)
      setTempEnd(newValue.end)
      setCurrentMonth(newValue.start)
    } else {
      // 导航层：按 viewLevel 翻页，不修改 temp 值，不重置 selecting
      setCurrentMonth((prev) => viewLevel === 'year' ? prev.subtract(1, 'year') : prev.subtract(10, 'year'))
    }
  }

  const handleNext = () => {
    if (isAtMinLevel) {
      const newValue = moveRangeValue({ granularity: tempGranularity, start: tempStart, end: tempEnd }, 1)
      setTempStart(newValue.start)
      setTempEnd(newValue.end)
      setCurrentMonth(newValue.start)
    } else {
      // 导航层：按 viewLevel 翻页，不修改 temp 值，不重置 selecting
      setCurrentMonth((prev) => viewLevel === 'year' ? prev.add(1, 'year') : prev.add(10, 'year'))
    }
  }

  // 箭头禁用判断：导航层始终可用，仅最底层受 min/max 限制
  const prevDisabled = isAtMinLevel && isRangeAtMin({ granularity: tempGranularity, start: tempStart, end: tempEnd }, config.minDate)
  const nextDisabled = isAtMinLevel && isRangeAtMax({ granularity: tempGranularity, start: tempStart, end: tempEnd }, config.maxDate)

  const title = getHeaderTitle(viewLevel, currentMonth)

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
          <CalendarHeader
            title={title}
            onPrev={handlePrev}
            onNext={handleNext}
            onTitleClick={handleTitleClick}
            titleClickable={titleClickable}
            prevDisabled={prevDisabled}
            nextDisabled={nextDisabled}
            colorTextPrimary={colorTextPrimary}
            colorBgHover={colorBgHover}
            colorBorderSubtle={colorBorderSubtle}
            spaceCardPadding={spaceCardPadding}
            spaceInlineDefault={spaceInlineDefault}
          />

          <div key={viewLevel} style={{ animation: 'mb-picker-fade-in 0.18s ease-out' }}>
            {viewLevel === 'month' && renderDayGrid(
              currentMonth,
              isAtMinLevel ? tempStart : null,
              isAtMinLevel ? tempEnd : null,
              config.minDate, config.maxDate, true,
              handleCellClick,
              gridColors,
            )}

            {viewLevel === 'year' && renderGrid(
              getMonthGridCells(
                currentMonth,
                isAtMinLevel ? tempStart : null,
                isAtMinLevel ? tempEnd : null,
                config.minDate, config.maxDate, true,
              ),
              handleCellClick,
              gridColors,
            )}

            {viewLevel === 'decade' && renderGrid(
              getYearGridCells(
                currentMonth,
                isAtMinLevel ? tempStart : null,
                isAtMinLevel ? tempEnd : null,
                config.minDate, config.maxDate, true,
              ),
              handleCellClick,
              gridColors,
            )}
          </div>

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

          {isAtMinLevel && mobilePresets.length > 0 && (
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
