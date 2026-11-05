/**
 * 报表时间条与统一时间面板（HF 批次 3）
 *
 * 时点看锚定日，期间看起止；粒度即改即生效。预设与自定义日历只负责生成草稿，
 * 兼容矩阵、桶跨度校验、重锚定规则全部来自 reportsTime，避免两套时间语义。
 */
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Settings } from 'lucide-react'
import { Drawer } from '@mantine/core'
import type { DeviceMode } from '@/features/shared/types'
import {
  GRANULARITIES,
  GRANULARITY_LABELS,
  PRESETS,
  formatPointLabel,
  formatRangeLabel,
  monthEnd,
  monthOf,
  monthStart,
  presetLabel,
  presetPoint,
  presetRange,
  presetSupported,
  reanchorRange,
  shiftPoint,
  shiftRange,
  snapPoint,
  validateRange,
  yearEnd,
  yearOf,
  yearStart,
  type Granularity,
  type PresetId,
  type ReportTab,
  type ReportTime,
} from './reportsTime'
import { TODAY } from '@/features/overview/model'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

interface Draft {
  point: string
  from: string
  to: string
  active: 'from' | 'to'
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function weekdayOffset(year: number, month: number): number {
  const day = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  return day === 0 ? 6 : day - 1
}

function DayGrid({
  year,
  month,
  value,
  onChange,
}: {
  year: number
  month: number
  value: string | null
  onChange: (date: string) => void
}) {
  const total = daysInMonth(year, month)
  const offset = weekdayOffset(year, month)
  const cells = Array.from({ length: offset + total }, (_, index) => {
    const day = index - offset + 1
    if (day < 1) return null
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return { day, date }
  })
  return (
    <div className="mb-rp-cal">
      <div className="mb-rp-cal-weekdays" aria-hidden="true">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <div className="mb-rp-cal-grid">
        {cells.map((cell, index) =>
          cell === null ? (
            <span key={`blank-${index}`} className="mb-rp-cal-blank" aria-hidden="true" />
          ) : (
            <button
              key={cell.date}
              type="button"
              className={cell.date === value ? 'mb-rp-cal-day is-active' : 'mb-rp-cal-day'}
              aria-pressed={cell.date === value}
              onClick={() => onChange(cell.date)}
            >
              {cell.day}
            </button>
          ),
        )}
      </div>
    </div>
  )
}

function MonthGrid({
  year,
  value,
  onSelect,
  onNavigate,
}: {
  year: number
  value: string | null
  onSelect?: (month: number) => void
  onNavigate?: (month: number) => void
}) {
  return (
    <div className="mb-rp-cal-months">
      {Array.from({ length: 12 }, (_, index) => {
        const month = index + 1
        const activeMonth = value ? yearOf(value) === year && monthOf(value) === month : false
        return (
          <button
            key={month}
            type="button"
            className={activeMonth ? 'mb-rp-cal-month is-active' : 'mb-rp-cal-month'}
            aria-pressed={activeMonth}
            onClick={() => (onSelect ? onSelect(month) : onNavigate?.(month))}
          >
            {month} 月
          </button>
        )
      })}
    </div>
  )
}

function YearGrid({
  year,
  value,
  onSelect,
}: {
  year: number
  value: string | null
  onSelect: (year: number) => void
}) {
  const startYear = year - 6
  return (
    <div className="mb-rp-cal-years">
      {Array.from({ length: 12 }, (_, index) => {
        const option = startYear + index
        return (
          <button
            key={option}
            type="button"
            className={value && yearOf(value) === option ? 'mb-rp-cal-month is-active' : 'mb-rp-cal-month'}
            aria-pressed={Boolean(value && yearOf(value) === option)}
            onClick={() => onSelect(option)}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}

function TimeFields({
  tab,
  gran,
  draft,
  onDraft,
}: {
  tab: ReportTab
  gran: Granularity
  draft: Draft
  onDraft: (next: Draft) => void
}) {
  const isPoint = tab === 'balance'
  const anchor = isPoint ? draft.point : draft.active === 'from' ? draft.from : draft.to
  const [view, setView] = useState({ year: yearOf(anchor), month: monthOf(anchor) })

  useEffect(() => {
    setView({ year: yearOf(anchor), month: monthOf(anchor) })
  }, [anchor])

  const update = (patch: Partial<Draft>) => onDraft({ ...draft, ...patch })

  const pickDay = (date: string) => {
    if (isPoint) {
      update({ point: date })
      return
    }
    if (draft.active === 'from') {
      update({ from: date, to: draft.to < date ? date : draft.to, active: 'to' })
      return
    }
    update({ to: date, from: draft.from > date ? date : draft.from, active: 'from' })
  }

  const pickMonth = (month: number) => {
    if (gran !== 'month') {
      setView({ ...view, month })
      return
    }
    const start = `${view.year}-${String(month).padStart(2, '0')}-01`
    if (isPoint) {
      update({ point: monthEnd(start) })
      return
    }
    if (draft.active === 'from') {
      const from = monthStart(start)
      const to = from > draft.to ? monthEnd(start) : draft.to
      update({ from, to, active: 'to' })
      return
    }
    const to = monthEnd(start)
    const from = draft.from > to ? monthStart(start) : draft.from
    update({ to, from, active: 'from' })
  }

  const pickYear = (year: number) => {
    const start = yearStart(`${year}-01-01`)
    if (isPoint) {
      update({ point: yearEnd(start) })
      return
    }
    if (draft.active === 'from') {
      update({ from: start, to: draft.to < start ? yearEnd(start) : draft.to, active: 'to' })
      return
    }
    const end = yearEnd(start)
    update({ to: end, from: draft.from > end ? start : draft.from, active: 'from' })
  }

  return (
    <div className="mb-rp-time-fields">
      {isPoint ? (
        <div className="mb-rp-date-trigger is-point">
          <span className="mb-rp-date-label">时点</span>
          <span className="mb-rp-date-value">{draft.point}</span>
        </div>
      ) : (
        <div className="mb-rp-date-pair">
          <button
            type="button"
            className={draft.active === 'from' ? 'mb-rp-date-trigger is-active' : 'mb-rp-date-trigger'}
            aria-pressed={draft.active === 'from'}
            onClick={() => update({ active: 'from' })}
          >
            <span className="mb-rp-date-label">起</span>
            <span className="mb-rp-date-value">{draft.from}</span>
          </button>
          <span className="mb-rp-date-sep" aria-hidden="true">
            ~
          </span>
          <button
            type="button"
            className={draft.active === 'to' ? 'mb-rp-date-trigger is-active' : 'mb-rp-date-trigger'}
            aria-pressed={draft.active === 'to'}
            onClick={() => update({ active: 'to' })}
          >
            <span className="mb-rp-date-label">止</span>
            <span className="mb-rp-date-value">{draft.to}</span>
          </button>
        </div>
      )}

      {(gran === 'day' || gran === 'month') && (
        <div className="mb-rp-cal-head">
          <button type="button" className="mb-rp-iconbtn" aria-label="上一年" onClick={() => setView({ ...view, year: view.year - 1 })}>
            <ChevronLeft size={16} />
          </button>
          <span className="mb-rp-cal-title">{view.year} 年</span>
          <button type="button" className="mb-rp-iconbtn" aria-label="下一年" onClick={() => setView({ ...view, year: view.year + 1 })}>
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {gran === 'day' && (
        <>
          <MonthGrid
            year={view.year}
            value={isPoint ? draft.point : draft.active === 'from' ? draft.from : draft.to}
            onNavigate={(month) => setView({ ...view, month })}
          />
          <DayGrid
            year={view.year}
            month={view.month}
            value={isPoint ? draft.point : draft.active === 'from' ? draft.from : draft.to}
            onChange={pickDay}
          />
        </>
      )}

      {gran === 'month' && (
        <MonthGrid
          year={view.year}
          value={isPoint ? draft.point : draft.active === 'from' ? draft.from : draft.to}
          onSelect={pickMonth}
        />
      )}

      {gran === 'year' && (
        <>
          <div className="mb-rp-cal-head">
            <button type="button" className="mb-rp-iconbtn" aria-label="上一年" onClick={() => setView({ ...view, year: view.year - 1 })}>
              <ChevronLeft size={16} />
            </button>
            <span className="mb-rp-cal-title">{view.year} 年附近</span>
            <button type="button" className="mb-rp-iconbtn" aria-label="下一年" onClick={() => setView({ ...view, year: view.year + 1 })}>
              <ChevronRight size={16} />
            </button>
          </div>
          <YearGrid
            year={view.year}
            value={isPoint ? draft.point : draft.active === 'from' ? draft.from : draft.to}
            onSelect={pickYear}
          />
        </>
      )}

      <p className="mb-rp-time-note">
        {isPoint
          ? `时点锚定：${gran === 'month' ? '月粒度取月末' : gran === 'year' ? '年粒度取年末' : '日粒度按当日'}`
          : `期间按${GRANULARITY_LABELS[gran]}聚合；起止会自动对齐到桶边界。`}
      </p>
    </div>
  )
}

function PresetChips({ gran, onPick }: { gran: Granularity; onPick: (preset: PresetId) => void }) {
  return (
    <div className="mb-rp-presets" role="group" aria-label="时间预设">
      {PRESETS.map((preset) => {
        const supported = presetSupported(preset.id, gran)
        return (
          <button
            key={preset.id}
            type="button"
            className="mb-rp-preset"
            disabled={!supported}
            title={supported ? undefined : `该预设在${GRANULARITY_LABELS[gran]}粒度下不可用`}
            onClick={() => onPick(preset.id)}
          >
            {preset.label}
          </button>
        )
      })}
    </div>
  )
}

interface TimeBarProps {
  device: DeviceMode
  tab: ReportTab
  time: ReportTime
  onChange: (next: ReportTime) => void
  onToast: (message: string) => void
  onOpenSettings: () => void
}

export function TimeBar({ device, tab, time, onChange, onToast, onOpenSettings }: TimeBarProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>({ point: time.point, from: time.from, to: time.to, active: 'to' })
  const rootRef = useRef<HTMLDivElement>(null)
  const isPoint = tab === 'balance'
  const label = isPoint ? formatPointLabel(time.point, time.gran, TODAY) : formatRangeLabel(time)
  const validation = validateRange(draft.from, draft.to, time.gran)

  useEffect(() => {
    if (!open || device === 'mobile') return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open, device])

  useEffect(() => {
    setDraft({ point: time.point, from: time.from, to: time.to, active: 'to' })
  }, [time.point, time.from, time.to])

  const openPanel = () => {
    setDraft({ point: time.point, from: time.from, to: time.to, active: 'to' })
    setOpen(true)
  }

  const applyPreset = (preset: PresetId) => {
    if (isPoint) {
      onChange({ ...time, point: presetPoint(preset, time.gran, TODAY), preset })
    } else {
      onChange({ ...time, ...presetRange(preset, time.gran, TODAY), preset })
    }
    setOpen(false)
    onToast(`预设「${presetLabel(preset)}」已生效`)
  }

  const applyDraft = () => {
    if (!isPoint) {
      const check = validateRange(draft.from, draft.to, time.gran)
      if (!check.ok) {
        onToast(check.message ?? '时间范围不合法')
        return
      }
    }
    if (isPoint) onChange({ ...time, point: draft.point, preset: null })
    else onChange({ ...time, from: draft.from, to: draft.to, preset: null })
    setOpen(false)
    onToast(isPoint ? `时点已切换至 ${draft.point}` : `期间已切换至 ${draft.from} ~ ${draft.to}`)
  }

  const changeGran = (next: Granularity) => {
    if (next === time.gran) return
    if (isPoint) {
      onChange({ ...time, gran: next, point: snapPoint(time.point, next) })
      onToast(`粒度已切换为${GRANULARITY_LABELS[next]}，时点自动对齐${next === 'month' ? '月末' : next === 'year' ? '年末' : '当日'}`)
      return
    }
    const range = reanchorRange(time.from, time.to, next)
    const keepPreset = time.preset && presetSupported(time.preset, next) ? time.preset : null
    onChange({ ...time, gran: next, ...range, preset: keepPreset })
    onToast(
      keepPreset
        ? `粒度已切换为${GRANULARITY_LABELS[next]}`
        : `粒度已切换为${GRANULARITY_LABELS[next]}，无法套用原预设，已转为自定义期间`,
    )
  }

  const step = (delta: number) => {
    if (isPoint) {
      onChange({ ...time, point: shiftPoint(time.point, time.gran, delta), preset: null })
      return
    }
    onChange({ ...time, ...shiftRange(time.from, time.to, time.gran, delta), preset: null })
  }

  return (
    <div className="mb-rp-timebar" ref={rootRef}>
      <div className="mb-rp-time-main">
        <div className="mb-rp-time-picker">
          <button type="button" className="mb-rp-iconbtn" aria-label="上一期" onClick={() => step(-1)}>
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            className="mb-rp-time-trigger"
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={() => (open ? setOpen(false) : openPanel())}
          >
            <span className="mb-rp-time-value">{label}</span>
            {isPoint && <span className="mb-rp-time-tag">月末估值</span>}
          </button>
          <button type="button" className="mb-rp-iconbtn" aria-label="下一期" onClick={() => step(1)}>
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="mb-rp-gran" role="group" aria-label="聚合粒度">
          {GRANULARITIES.map((gran) => (
            <button
              key={gran}
              type="button"
              className={gran === time.gran ? 'mb-rp-gran-btn is-active' : 'mb-rp-gran-btn'}
              aria-pressed={gran === time.gran}
              onClick={() => changeGran(gran)}
            >
              {GRANULARITY_LABELS[gran]}
            </button>
          ))}
        </div>
        {device === 'desktop' && (
          <button type="button" className="mb-rp-settings-btn" onClick={onOpenSettings}>
            <Settings size={15} />
            设置
          </button>
        )}
      </div>

      {open && device === 'desktop' && (
        <div className="mb-rp-pop" role="dialog" aria-label="时间范围">
          <div className="mb-rp-pop-head">
            <span className="mb-rp-pop-title">时间范围</span>
            <span className="mb-rp-pop-gran">粒度：{GRANULARITY_LABELS[time.gran]}</span>
          </div>
          <PresetChips gran={time.gran} onPick={applyPreset} />
          <div className="mb-rp-pop-divider" role="separator" />
          <TimeFields tab={tab} gran={time.gran} draft={draft} onDraft={setDraft} />
          {!isPoint && !validation.ok && <p className="mb-rp-time-error">{validation.message}</p>}
          <div className="mb-rp-pop-actions">
            <button type="button" className="mb-rp-btn is-ghost" onClick={() => setOpen(false)}>
              取消
            </button>
            <button type="button" className="mb-rp-btn is-primary" onClick={applyDraft}>
              应用
            </button>
          </div>
        </div>
      )}

      <Drawer
        opened={open && device === 'mobile'}
        onClose={() => setOpen(false)}
        position="bottom"
        size="auto"
        withinPortal={false}
        title="时间范围"
        classNames={{
          content: 'mb-rp-sheet',
          header: 'mb-rp-sheet-head',
          title: 'mb-rp-sheet-title',
          body: 'mb-rp-sheet-body',
          overlay: 'mb-rp-overlay',
          close: 'mb-rp-sheet-close',
        }}
      >
        <PresetChips gran={time.gran} onPick={applyPreset} />
        <div className="mb-rp-pop-divider" role="separator" />
        <TimeFields tab={tab} gran={time.gran} draft={draft} onDraft={setDraft} />
        {!isPoint && !validation.ok && <p className="mb-rp-time-error">{validation.message}</p>}
        <div className="mb-rp-sheet-actions">
          <button type="button" className="mb-rp-btn is-ghost" onClick={() => setOpen(false)}>
            取消
          </button>
          <button type="button" className="mb-rp-btn is-primary" onClick={applyDraft}>
            应用
          </button>
        </div>
      </Drawer>
    </div>
  )
}
