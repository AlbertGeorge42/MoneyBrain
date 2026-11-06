/**
 * 统一日期选择器（HF）
 *
 * 同一份面板内容服务两处：流水筛选（可留空 = 不限）与报表时间条（必须有期间）。
 * PC 为输入框式触发 + 浮层；移动 390 为底部面板（沿用 mb-rp-sheet 的底部升起、
 * 按内容收缩、动作区常驻规范）。内部值一律 YYYY-MM-DD，展示与请求参数同源。
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Drawer } from '@mantine/core'
import type { DeviceMode } from '@/features/shared/types'
import {
  WEEKDAYS,
  addMonths,
  calendarCells,
  clampDate,
  formatDateText,
  formatMonthTitle,
  monthOf,
  moveDay,
  normalizeRange,
  snapDay,
  yearOf,
  type DateGranularity,
  type DatePresetOption,
  type DateRange,
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
  /** 报表月 / 年粒度：边界吸附到月初月末 / 年初年末。 */
  gran?: DateGranularity
  variant?: 'field' | 'inline'
  align?: 'left' | 'right'
  className?: string
  sheetTitle?: string
}

type ActiveField = 'from' | 'to'

function viewOf(value: string): { year: number; month: number } {
  return { year: yearOf(value), month: monthOf(value) }
}

function padMonth(month: number): string {
  return String(month).padStart(2, '0')
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
  className,
  sheetTitle = '选择日期',
}: DatePickerProps) {
  const isPoint = mode === 'point'
  const placeholderText = placeholder ?? (optional ? '不限' : '请选择')
  const noteId = useId()

  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const pendingFocus = useRef<string | null>(null)

  const [portalTarget] = useState<HTMLElement | null>(() => {
    if (typeof document === 'undefined') return null
    return (
      document.querySelector<HTMLElement>('.mb-hf-phone') ??
      document.querySelector<HTMLElement>('.mb-hf-root')
    )
  })

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange>(value)
  const [active, setActive] = useState<ActiveField>('from')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState(() => viewOf(value.from || value.to || today))
  const [focusDate, setFocusDate] = useState(value.from || value.to || today)

  // 关闭态跟随外部值；打开态只动 draft，避免请求结果回写打断选择。
  useEffect(() => {
    if (open) return
    setDraft((current) =>
      current.from === value.from && current.to === value.to
        ? current
        : { from: value.from, to: value.to },
    )
  }, [open, value.from, value.to])

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
  }, [open, view, focusDate, device])

  // PC 点外部关闭；移动端由 Drawer overlay 关闭。关闭不抢走点外部的焦点。
  useEffect(() => {
    if (!open || device === 'mobile') return
    const onPointerDown = (event: globalThis.MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open, device])

  const focusCell = (date: string) => {
    const node = panelRef.current?.querySelector<HTMLElement>(`[data-date="${date}"]`)
    node?.focus()
  }

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
    setView(viewOf(anchor))
    setFocusDate(anchor)
    pendingFocus.current = anchor
    setOpen(true)
  }

  const onTrigger = (event: MouseEvent<HTMLButtonElement>, field: ActiveField) => {
    triggerRef.current = event.currentTarget
    if (open) {
      const anchor = (isPoint ? value.from : field === 'from' ? value.from : value.to) || today
      setActive(isPoint ? 'from' : field)
      setView(viewOf(anchor))
      setFocusDate(anchor)
      pendingFocus.current = anchor
      return
    }
    openPanel(field)
  }

  const dayDisabled = (date: string) => Boolean(maxDate && date > maxDate)

  const pickDay = (raw: string) => {
    const snapped = clampDate(
      isPoint ? snapDay(raw, gran, 'end') : snapDay(raw, gran, active === 'from' ? 'start' : 'end'),
      maxDate,
    )
    setError(null)
    setFocusDate(raw)
    if (monthOf(raw) !== view.month || yearOf(raw) !== view.year) setView(viewOf(raw))
    if (isPoint) {
      setDraft({ from: snapped, to: snapped })
      setFeedback(`时点已设为 ${snapped}`)
      return
    }
    const next =
      active === 'from' ? { from: snapped, to: draft.to } : { from: draft.from, to: snapped }
    const normalized = normalizeRange(next.from, next.to)
    setDraft(normalized.range)
    if (normalized.swapped) {
      setFeedback(`起止反选，已自动交换为 ${normalized.range.from} ~ ${normalized.range.to}`)
    } else if (active === 'from') {
      setFeedback(`起始已设为 ${normalized.range.from}，再选结束日`)
    } else {
      setFeedback(`结束已设为 ${normalized.range.to}`)
    }
    setActive(active === 'from' ? 'to' : 'from')
  }

  const pickPreset = (preset: DatePresetOption) => {
    if (preset.disabledReason) return
    setDraft({ from: preset.from, to: preset.to })
    setError(null)
    setFeedback(`预设「${preset.label}」：${preset.from} ~ ${preset.to}`)
    setActive('to')
    const anchor = preset.to || preset.from
    if (anchor) {
      setView(viewOf(anchor))
      setFocusDate(anchor)
    }
  }

  const pickCustom = () => {
    setError(null)
    setFeedback(null)
    const anchor = (draft[active] || draft.from || draft.to || today) as string
    setView(viewOf(anchor))
    setFocusDate(anchor)
    const node = panelRef.current?.querySelector<HTMLElement>(`[data-date="${anchor}"]`)
    if (node) node.focus()
    else {
      pendingFocus.current = anchor
      setOpen(true)
    }
  }

  const goMonth = (delta: number) => {
    const anchor = `${view.year}-${padMonth(view.month)}-01`
    const next = addMonths(anchor, delta)
    setView(viewOf(next))
    setFocusDate(next)
  }

  const matchedPreset =
    presets.find((preset) => preset.from === draft.from && preset.to === draft.to)?.id ?? null
  const disabledPresets = presets.filter((preset) => preset.disabledReason)

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
    const currentDate = (event.target as HTMLElement).getAttribute('data-date')
    if (!currentDate) return
    event.preventDefault()
    const nextDate = clampDate(moveDay(currentDate, key), maxDate)
    const nextView = viewOf(nextDate)
    const withinView = nextView.year === view.year && nextView.month === view.month
    setFocusDate(nextDate)
    if (withinView) {
      focusCell(nextDate)
      return
    }
    setView(nextView)
    pendingFocus.current = nextDate
  }

  const granNote =
    gran === 'month'
      ? '月粒度：起取月初、止取月末'
      : gran === 'year'
        ? '年粒度：起取年初、止取年末'
        : null

  const cells = calendarCells(view.year, view.month)

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
          <button type="button" className="mb-dp-field is-active" aria-pressed="true">
            <span className="mb-dp-field-label">时点</span>
            <span className={draft.from ? 'mb-dp-field-value' : 'mb-dp-field-value is-empty'}>
              {formatDateText(draft.from, placeholderText)}
            </span>
          </button>
        </div>
      ) : (
        <div className="mb-dp-fields">
          <button
            type="button"
            className={active === 'from' ? 'mb-dp-field is-active' : 'mb-dp-field'}
            aria-pressed={active === 'from'}
            onClick={() => setActive('from')}
          >
            <span className="mb-dp-field-label">起</span>
            <span className={draft.from ? 'mb-dp-field-value' : 'mb-dp-field-value is-empty'}>
              {formatDateText(draft.from, placeholderText)}
            </span>
          </button>
          <button
            type="button"
            className={active === 'to' ? 'mb-dp-field is-active' : 'mb-dp-field'}
            aria-pressed={active === 'to'}
            onClick={() => setActive('to')}
          >
            <span className="mb-dp-field-label">止</span>
            <span className={draft.to ? 'mb-dp-field-value' : 'mb-dp-field-value is-empty'}>
              {formatDateText(draft.to, placeholderText)}
            </span>
          </button>
        </div>
      )}

      <div className="mb-dp-presets" role="group" aria-label="快捷预设">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={matchedPreset === preset.id ? 'mb-dp-preset is-active' : 'mb-dp-preset'}
            aria-pressed={matchedPreset === preset.id}
            disabled={Boolean(preset.disabledReason)}
            aria-describedby={preset.disabledReason ? noteId : undefined}
            onClick={() => pickPreset(preset)}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          className={matchedPreset ? 'mb-dp-preset' : 'mb-dp-preset is-active'}
          aria-pressed={!matchedPreset}
          onClick={pickCustom}
        >
          自选
        </button>
      </div>
      {disabledPresets.length > 0 && (
        <p className="mb-dp-note" id={noteId}>
          当前粒度下不可用：{disabledPresets.map((preset) => preset.label).join(' · ')}
        </p>
      )}

      <div className="mb-dp-divider" aria-hidden="true" />

      <div className="mb-dp-cal-head">
        <button type="button" className="mb-dp-iconbtn" aria-label="上个月" onClick={() => goMonth(-1)}>
          <ChevronLeft size={16} />
        </button>
        <span className="mb-dp-cal-title">{formatMonthTitle(view.year, view.month)}</span>
        <button type="button" className="mb-dp-iconbtn" aria-label="下个月" onClick={() => goMonth(1)}>
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="mb-dp-weekdays" aria-hidden="true">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <div className="mb-dp-day-grid" role="grid" aria-label="日期网格" onKeyDown={onGridKeyDown}>
        {cells.map((cell) => {
          const activeDay = isPoint
            ? cell.date === draft.from
            : cell.date === draft.from || cell.date === draft.to
          const inRange =
            !isPoint &&
            Boolean(draft.from && draft.to) &&
            cell.date > draft.from &&
            cell.date < draft.to
          const classes = [
            'mb-dp-day',
            cell.inMonth ? '' : 'is-outside',
            inRange ? 'is-in-range' : '',
            activeDay ? 'is-active' : '',
            !activeDay && cell.date === today ? 'is-today' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button
              key={cell.date}
              type="button"
              data-date={cell.date}
              tabIndex={cell.date === focusDate ? 0 : -1}
              disabled={dayDisabled(cell.date)}
              aria-pressed={activeDay}
              aria-label={cell.date}
              className={classes}
              onClick={() => pickDay(cell.date)}
            >
              {cell.day}
            </button>
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
          <button type="button" className="mb-dp-btn is-clear" onClick={clear}>
            清空（不限）
          </button>
        )}
        <button type="button" className="mb-dp-btn is-ghost" onClick={() => close(true)}>
          取消
        </button>
        <button type="button" className="mb-dp-btn is-primary" onClick={apply}>
          应用
        </button>
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

  return (
    <div className={rootClass} ref={rootRef}>
      <div className="mb-dp-control" role="group" aria-label={isPoint ? '时点' : '日期区间'}>
        {isPoint ? (
          <button
            type="button"
            className="mb-dp-zone"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={`时点，当前 ${value.from || '未选择'}`}
            onClick={(event) => onTrigger(event, 'from')}
          >
            <span className="mb-dp-zone-label">时点</span>
            <span className={value.from ? 'mb-dp-zone-value' : 'mb-dp-zone-placeholder'}>
              {formatDateText(value.from, placeholderText)}
            </span>
          </button>
        ) : (
          <>
            <button
              type="button"
              className="mb-dp-zone"
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-label={`起始日期，当前 ${value.from || placeholderText}`}
              onClick={(event) => onTrigger(event, 'from')}
            >
              <span className="mb-dp-zone-label">起</span>
              <span className={value.from ? 'mb-dp-zone-value' : 'mb-dp-zone-placeholder'}>
                {formatDateText(value.from, placeholderText)}
              </span>
            </button>
            <span className="mb-dp-sep" aria-hidden="true">
              ~
            </span>
            <button
              type="button"
              className="mb-dp-zone"
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-label={`结束日期，当前 ${value.to || placeholderText}`}
              onClick={(event) => onTrigger(event, 'to')}
            >
              <span className="mb-dp-zone-label">止</span>
              <span className={value.to ? 'mb-dp-zone-value' : 'mb-dp-zone-placeholder'}>
                {formatDateText(value.to, placeholderText)}
              </span>
            </button>
          </>
        )}
      </div>

      {open && device !== 'mobile' && <div className="mb-dp-pop">{panel}</div>}

      <Drawer
        opened={open && device === 'mobile'}
        onClose={() => close(true)}
        position="bottom"
        size="auto"
        withinPortal
        portalProps={portalTarget ? { target: portalTarget } : undefined}
        title={sheetTitle}
        classNames={{
          content: 'mb-rp-sheet mb-dp-sheet',
          header: 'mb-rp-sheet-head',
          title: 'mb-rp-sheet-title',
          body: 'mb-rp-sheet-body mb-dp-sheet-body',
          overlay: 'mb-rp-overlay',
          close: 'mb-rp-sheet-close',
        }}
      >
        {panel}
      </Drawer>
    </div>
  )
}
