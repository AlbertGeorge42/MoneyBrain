/**
 * 统一日期选择器（HF）
 *
 * 同一份面板内容服务两处：流水筛选（可留空 = 不限）与报表时间条（必须有期间）。
 * PC 为输入框式触发 + 浮层；移动 390 为底部面板（沿用 mb-rp-sheet 的底部升起、
 * 按内容收缩、动作区常驻规范）。内部值一律 YYYY-MM-DD，展示与请求参数同源。
 *
 * 粒度决定三件事：面板长什么样、日期显示到哪一级、快速选择提供哪些项。
 * 日看日历网格、周看周列表、月看 12 个月、年看年份窗口；
 * 显示只到该粒度（月粒度不显示日），点击单元按「起取桶首、止取桶末」写入。
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { HfButton } from '@/features/shared/HfButton'
import { HfSheet } from '@/features/shared/HfSheet'
import type { DeviceMode } from '@/features/shared/types'
import {
  WEEKDAYS,
  clampDate,
  formatByGran,
  granCells,
  granColumns,
  normalizeRange,
  shiftView,
  viewTitle,
  type DateGranularity,
  type DatePresetOption,
  type DateRange,
  type GranView,
} from './datePickerModel'
import './datePicker.css'

interface DatePickerProps {
  device: DeviceMode
  /** point = 单日（报表资产负债时点），range = 起止区间。 */
  mode?: 'range' | 'point'
  value: DateRange
  onChange: (next: DateRange, presetId: string | null) => void
  /** 允许留空；空值展示 placeholder（流水筛选「不限」）。 */
  optional?: boolean
  placeholder?: string
  presets?: readonly DatePresetOption[]
  /** 日历基准日 / 预设锚点，由调用方给（真实库用账本 today，种子库用冻结日）。 */
  today: string
  /** 晚于该日的日期禁用，并展示 disabledNote。 */
  maxDate?: string
  disabledNote?: string
  /** 粒度：决定面板形态、显示层级与吸附边界。 */
  gran?: DateGranularity
  variant?: 'field' | 'inline'
  align?: 'left' | 'right'
  /** 触发器尾部小标签（如报表时点的「月末估值」）。 */
  tag?: string
  className?: string
  sheetTitle?: string
}

type ActiveField = 'from' | 'to'

function viewOf(value: string): GranView {
  const [year, month] = value.split('-').map(Number)
  return { year, month }
}

export function DatePicker({
  device,
  mode = 'range',
  value,
  onChange,
  optional = false,
  placeholder,
  presets = [],
  today,
  maxDate,
  disabledNote,
  gran = 'day',
  variant = 'field',
  align = 'left',
  tag,
  className,
  sheetTitle = '选择日期',
}: DatePickerProps) {
  const isPoint = mode === 'point'
  const placeholderText = placeholder ?? (optional ? '不限' : '请选择')

  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const pendingFocus = useRef<string | null>(null)

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange>(value)
  const [active, setActive] = useState<ActiveField>('from')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState(() => viewOf(value.from || value.to || today))
  const [focusIndex, setFocusIndex] = useState(0)

  // 关闭态跟随外部值；打开态只动 draft，避免请求结果回写打断选择。
  useEffect(() => {
    if (open) return
    setDraft((current) =>
      current.from === value.from && current.to === value.to
        ? current
        : { from: value.from, to: value.to },
    )
  }, [open, value.from, value.to])

  const cells = useMemo(() => granCells(gran, view), [gran, view])
  const columns = granColumns(gran)

  useEffect(() => {
    if (!open) return
    const target = pendingFocus.current
    if (!target) return
    const timer = window.setTimeout(() => {
      const node = panelRef.current?.querySelector<HTMLElement>(`[data-date="${target}"]`)
      if (!node) return
      node.focus()
      pendingFocus.current = null
    }, device === 'mobile' ? 60 : 0)
    return () => window.clearTimeout(timer)
  }, [open, view, focusIndex, device])

  // PC 点外部关闭；移动端由 Drawer overlay 关闭。关闭不抢走点外部的焦点。
  useEffect(() => {
    if (!open || device === 'mobile') return
    const onPointerDown = (event: globalThis.MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open, device])

  const close = (restoreFocus: boolean) => {
    setOpen(false)
    if (!restoreFocus) return
    const trigger = triggerRef.current
    window.setTimeout(
      () => trigger?.focus(),
      device === 'mobile' ? 60 : 0,
    )
  }

  const openPanel = (field: ActiveField) => {
    const nextActive: ActiveField = isPoint ? 'from' : field
    const current = isPoint
      ? value.from
      : field === 'from'
        ? value.from
        : value.to
    const anchor = current || today
    setActive(nextActive)
    setDraft(value)
    setFeedback(null)
    setError(null)
    const nextView = viewOf(anchor)
    setView(nextView)
    const nextCells = granCells(gran, nextView)
    const index = nextCells.findIndex((cell) => cell.start === anchor)
    setFocusIndex(index >= 0 ? index : 0)
    pendingFocus.current = index >= 0 ? anchor : nextCells[0]?.start ?? anchor
    setOpen(true)
  }

  const onTrigger = (event: MouseEvent<HTMLButtonElement>, field: ActiveField) => {
    triggerRef.current = event.currentTarget
    if (open) {
      const anchor = (isPoint ? value.from : field === 'from' ? value.from : value.to) || today
      setActive(isPoint ? 'from' : field)
      const nextView = viewOf(anchor)
      setView(nextView)
      const nextCells = granCells(gran, nextView)
      const index = nextCells.findIndex((cell) => cell.start === anchor)
      setFocusIndex(index >= 0 ? index : 0)
      pendingFocus.current = index >= 0 ? anchor : nextCells[0]?.start ?? anchor
      return
    }
    openPanel(field)
  }

  // 焦点还没进浮层的瞬间也可能按 Esc（例如刚点开触发控件），这里兜底关闭。
  const onZoneKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    event.stopPropagation()
    close(true)
  }

  const cellDisabled = (start: string) => Boolean(maxDate && start > maxDate)

  const pickCell = (index: number) => {
    const cell = cells[index]
    if (!cell || cellDisabled(cell.start)) return
    setError(null)
    setFocusIndex(index)
    if (isPoint) {
      // 时点取桶末：与报表「月末估值 / 年末估值」同一口径。
      const point = clampDate(cell.end, maxDate)
      setDraft({ from: point, to: point })
      setFeedback(`时点已设为 ${formatByGran(point, gran)}`)
      return
    }
    const next =
      active === 'from'
        ? { from: cell.start, to: draft.to }
        : { from: draft.from, to: cell.end }
    const normalized = normalizeRange(next.from, next.to)
    setDraft(normalized.range)
    if (normalized.swapped) {
      setFeedback(
        `起止反选，已自动交换为 ${formatByGran(normalized.range.from, gran)} ~ ${formatByGran(normalized.range.to, gran)}`,
      )
    } else if (active === 'from') {
      setFeedback(`起始已设为 ${formatByGran(normalized.range.from, gran)}，再选结束`)
    } else {
      setFeedback(`结束已设为 ${formatByGran(normalized.range.to, gran)}`)
    }
    setActive(active === 'from' ? 'to' : 'from')
  }

  const pickPreset = (preset: DatePresetOption) => {
    setDraft({ from: preset.from, to: preset.to })
    setError(null)
    setFeedback(
      isPoint
        ? `预设「${preset.label}」：${formatByGran(preset.from, gran)}`
        : `预设「${preset.label}」：${formatByGran(preset.from, gran)} ~ ${formatByGran(preset.to, gran)}`,
    )
    setActive('to')
    const anchor = preset.to || preset.from
    if (anchor) {
      const nextView = viewOf(anchor)
      setView(nextView)
      const nextCells = granCells(gran, nextView)
      const index = nextCells.findIndex((cell) => cell.start === anchor)
      setFocusIndex(index >= 0 ? index : 0)
    }
  }

  const pickCustom = () => {
    setError(null)
    setFeedback(null)
    const anchor = (draft[active] || draft.from || draft.to || today) as string
    const nextView = viewOf(anchor)
    setView(nextView)
    const nextCells = granCells(gran, nextView)
    const index = nextCells.findIndex((cell) => cell.start === anchor)
    setFocusIndex(index >= 0 ? index : 0)
    pendingFocus.current = nextCells[index >= 0 ? index : 0]?.start ?? anchor
    setOpen(true)
  }

  const goPage = (delta: number) => {
    const next = shiftView(gran, view, delta)
    setView(next)
    setFocusIndex(0)
    pendingFocus.current = granCells(gran, next)[0]?.start ?? null
  }

  const matchedPreset =
    presets.find((preset) => preset.from === draft.from && preset.to === draft.to)?.id ?? null

  const apply = () => {
    const normalized = normalizeRange(draft.from, draft.to)
    if (isPoint) {
      if (!normalized.range.from) {
        setError('请选择日期')
        return
      }
      onChange({ from: normalized.range.from, to: normalized.range.from }, matchedPreset)
      close(true)
      return
    }
    if (!optional && (!normalized.range.from || !normalized.range.to)) {
      setError('请选择完整的起止日期')
      return
    }
    onChange(normalized.range, matchedPreset)
    close(true)
  }

  const clear = () => {
    onChange({ from: '', to: '' }, null)
    close(true)
  }

  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close(true)
      return
    }
    if (event.key !== 'Tab') return
    const nodes = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((node) => node.tabIndex >= 0)
    if (nodes.length === 0) return
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = event.key
    if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown') {
      return
    }
    const current = (event.target as HTMLElement).getAttribute('data-date')
    const currentIndex = current ? cells.findIndex((cell) => cell.start === current) : -1
    if (currentIndex < 0) return
    event.preventDefault()
    const delta =
      key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : key === 'ArrowUp' ? -columns : columns
    const nextIndex = Math.min(Math.max(currentIndex + delta, 0), cells.length - 1)
    const nextCell = cells[nextIndex]
    if (!nextCell) return
    setFocusIndex(nextIndex)
    const node = panelRef.current?.querySelector<HTMLElement>(`[data-date="${nextCell.start}"]`)
    node?.focus()
  }

  const granNote =
    gran === 'week'
      ? '周粒度：起取周一、止取周日'
      : gran === 'month'
        ? '月粒度：起取月初、止取月末'
        : gran === 'year'
          ? '年粒度：起取年初、止取年末'
          : null

  const panel = (
    <div
      className="mb-dp-panel"
      ref={panelRef}
      role="dialog"
      aria-modal={device === 'mobile' ? true : undefined}
      aria-label={isPoint ? '选择时点' : '选择日期区间'}
      onKeyDown={onPanelKeyDown}
    >
      <div className="mb-dp-head">
        <span className="mb-dp-title">{isPoint ? '选择时点' : '选择日期区间'}</span>
        {granNote && <span className="mb-dp-head-note">{granNote}</span>}
      </div>

      {isPoint ? (
        <div className="mb-dp-fields is-single">
          <HfButton className="mb-dp-field is-active" aria-pressed="true">
            <span className="mb-dp-field-label">时点</span>
            <span className={draft.from ? 'mb-dp-field-value' : 'mb-dp-field-value is-empty'}>
              {draft.from ? formatByGran(draft.from, gran) : placeholderText}
            </span>
          </HfButton>
        </div>
      ) : (
        <div className="mb-dp-fields">
          <HfButton
            className={active === 'from' ? 'mb-dp-field is-active' : 'mb-dp-field'}
            aria-pressed={active === 'from'}
            onClick={() => setActive('from')}
          >
            <span className="mb-dp-field-label">起</span>
            <span className={draft.from ? 'mb-dp-field-value' : 'mb-dp-field-value is-empty'}>
              {draft.from ? formatByGran(draft.from, gran) : placeholderText}
            </span>
          </HfButton>
          <HfButton
            className={active === 'to' ? 'mb-dp-field is-active' : 'mb-dp-field'}
            aria-pressed={active === 'to'}
            onClick={() => setActive('to')}
          >
            <span className="mb-dp-field-label">止</span>
            <span className={draft.to ? 'mb-dp-field-value' : 'mb-dp-field-value is-empty'}>
              {draft.to ? formatByGran(draft.to, gran) : placeholderText}
            </span>
          </HfButton>
        </div>
      )}

      {presets.length > 0 && (
        <div className="mb-dp-presets" role="group" aria-label="快捷预设">
          {presets.map((preset) => (
            <HfButton
              key={preset.id}
              className={matchedPreset === preset.id ? 'mb-dp-preset is-active' : 'mb-dp-preset'}
              aria-pressed={matchedPreset === preset.id}
              onClick={() => pickPreset(preset)}
            >
              {preset.label}
            </HfButton>
          ))}
          <HfButton
            className={matchedPreset ? 'mb-dp-preset' : 'mb-dp-preset is-active'}
            aria-pressed={!matchedPreset}
            onClick={pickCustom}
          >
            自选
          </HfButton>
        </div>
      )}

      <div className="mb-dp-divider" aria-hidden="true" />

      <div className="mb-dp-cal-head">
        <HfButton className="mb-dp-iconbtn" aria-label="上一页" onClick={() => goPage(-1)}>
          <ChevronLeft size={16} />
        </HfButton>
        <span className="mb-dp-cal-title">{viewTitle(gran, view)}</span>
        <HfButton className="mb-dp-iconbtn" aria-label="下一页" onClick={() => goPage(1)}>
          <ChevronRight size={16} />
        </HfButton>
      </div>

      {gran === 'day' && (
        <div className="mb-dp-weekdays" aria-hidden="true">
          {WEEKDAYS.map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>
      )}

      <div
        className="mb-dp-grid"
        style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        role="grid"
        aria-label="日期网格"
        onKeyDown={onGridKeyDown}
      >
        {cells.map((cell, index) => {
          const activeDay = isPoint
            ? cell.start <= draft.from && draft.from <= cell.end
            : cell.start === draft.from || cell.end === draft.to
          const inRange =
            !isPoint &&
            Boolean(draft.from && draft.to) &&
            cell.start > draft.from &&
            cell.end < draft.to
          const classes = [
            'mb-dp-day',
            cell.inMonth === false ? 'is-outside' : '',
            inRange ? 'is-in-range' : '',
            activeDay ? 'is-active' : '',
            !activeDay && cell.start === today ? 'is-today' : '',
            gran !== 'day' ? 'is-gran' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <HfButton
              key={cell.start}
              data-date={cell.start}
              tabIndex={index === focusIndex ? 0 : -1}
              disabled={cellDisabled(cell.start)}
              aria-pressed={activeDay}
              aria-label={gran === 'day' ? cell.start : cell.label}
              className={classes}
              onClick={() => pickCell(index)}
            >
              {cell.label}
            </HfButton>
          )
        })}
      </div>

      {disabledNote && <p className="mb-dp-note">{disabledNote}</p>}
      {feedback && (
        <p className="mb-dp-feedback" role="status" aria-live="polite">
          {feedback}
        </p>
      )}
      {error && (
        <p className="mb-dp-error" role="alert">
          {error}
        </p>
      )}

      <div className={device === 'mobile' ? 'mb-dp-sheet-actions' : 'mb-dp-actions'}>
        {optional && (
          <HfButton className="mb-dp-btn is-clear" onClick={clear}>
            清空（不限）
          </HfButton>
        )}
        <HfButton className="mb-dp-btn is-ghost" onClick={() => close(true)}>
          取消
        </HfButton>
        <HfButton className="mb-dp-btn is-primary" onClick={apply}>
          应用
        </HfButton>
      </div>
    </div>
  )

  const rootClass = [
    'mb-dp',
    device === 'mobile' ? 'is-mobile' : 'is-desktop',
    variant === 'inline' ? 'is-inline' : '',
    align === 'right' ? 'is-align-right' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  const zoneText = (raw: string) => (raw ? formatByGran(raw, gran) : placeholderText)

  return (
    <div className={rootClass} ref={rootRef}>
      <div className="mb-dp-control" role="group" aria-label={isPoint ? '时点' : '日期区间'}>
        {isPoint ? (
          <HfButton
            className="mb-dp-zone"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={`时点，当前 ${zoneText(value.from)}`}
            onClick={(event) => onTrigger(event, 'from')}
            onKeyDown={onZoneKeyDown}
          >
            <span className="mb-dp-zone-label">时点</span>
            <span className={value.from ? 'mb-dp-zone-value' : 'mb-dp-zone-placeholder'}>
              {zoneText(value.from)}
            </span>
          </HfButton>
        ) : (
          <>
            <HfButton
              className="mb-dp-zone"
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-label={`起始日期，当前 ${zoneText(value.from)}`}
              onClick={(event) => onTrigger(event, 'from')}
              onKeyDown={onZoneKeyDown}
            >
              <span className="mb-dp-zone-label">起</span>
              <span className={value.from ? 'mb-dp-zone-value' : 'mb-dp-zone-placeholder'}>
                {zoneText(value.from)}
              </span>
            </HfButton>
            <span className="mb-dp-sep" aria-hidden="true">
              ~
            </span>
            <HfButton
              className="mb-dp-zone"
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-label={`结束日期，当前 ${zoneText(value.to)}`}
              onClick={(event) => onTrigger(event, 'from')}
              onKeyDown={onZoneKeyDown}
            >
              <span className="mb-dp-zone-label">止</span>
              <span className={value.to ? 'mb-dp-zone-value' : 'mb-dp-zone-placeholder'}>
                {zoneText(value.to)}
              </span>
            </HfButton>
          </>
        )}
        {tag && <span className="mb-dp-tag">{tag}</span>}
      </div>

      {open && device !== 'mobile' && <div className="mb-dp-pop">{panel}</div>}

      <HfSheet
        variant="report"
        device={device}
        opened={open && device === 'mobile'}
        onClose={() => close(true)}
        title={sheetTitle}
        contentClassName="mb-dp-sheet"
        bodyClassName="mb-dp-sheet-body"
        portal
      >
        {panel}
      </HfSheet>
    </div>
  )
}
