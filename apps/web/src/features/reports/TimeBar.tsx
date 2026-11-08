/**
 * 报表时间条（HF 批次 3 / 未来时间轴 P2）
 *
 * 时点看锚定日，期间看起止；粒度即改即生效。预设与日期区间全部交给共享
 * DatePicker（PC 浮层 / 移动底部面板一套交互），这里只保留报表语义：
 * 粒度步进、切粒度重锚定、未来仅月粒度 + 最多 12 个自然月的可见原因。
 *
 * 三态判定（已发生 / 混合 / 全未来）由 reportsTime 统一计算，时间条只负责显示。
 */
import { ChevronLeft, ChevronRight, Settings } from 'lucide-react'
import { DatePicker } from '@/features/shared/datePicker/DatePicker'
import type { DatePresetOption } from '@/features/shared/datePicker/datePickerModel'
import { HfButton } from '@/features/shared/HfButton'
import { HfSegmented } from '@/features/shared/HfSegmented'
import type { DeviceMode } from '@/features/shared/types'
import {
  GRANULARITIES,
  GRANULARITY_LABELS,
  PRESETS,
  futureAllowed,
  futureHorizon,
  isFuturePreset,
  pointRangeState,
  presetLabel,
  presetPoint,
  presetRange,
  presetSupported,
  rangeState,
  reanchorRange,
  shiftPoint,
  shiftRange,
  snapPoint,
  validateRange,
  yearStart,
  type Granularity,
  type PresetId,
  type RangeState,
  type ReportTab,
  type ReportTime,
} from './reportsTime'

interface TimeBarProps {
  device: DeviceMode
  tab: ReportTab
  time: ReportTime
  /** 期间锚点：API 模式是真实今天 / 最新流水，种子模式是冻结的 2026-10-28。 */
  today: string
  /** 当前视图是否支持未来区间；不支持的视图未来预设置灰。 */
  futureEnabled: boolean
  onChange: (next: ReportTime) => void
  onToast: (message: string) => void
  onOpenSettings: () => void
}

const STATE_LABEL: Record<RangeState, string> = {
  past: '已发生',
  mixed: '混合区间 · 含未来',
  future: '全未来',
}

/** 预设落到当前粒度 / 时点或期间的具体起止；未来端点按 12 个月上限截断。 */
function buildPresets(
  gran: Granularity,
  isPoint: boolean,
  today: string,
  futureEnabled: boolean,
): DatePresetOption[] {
  const horizon = futureHorizon(today)
  return PRESETS.map((preset) => {
    const future = isFuturePreset(preset.id)
    const supported =
      presetSupported(preset.id, gran) && (!future || (futureEnabled && futureAllowed(gran)))
    const range = isPoint
      ? { from: presetPoint(preset.id, gran, today), to: presetPoint(preset.id, gran, today) }
      : presetRange(preset.id, gran, today)
    const from = range.from > horizon ? horizon : range.from
    const to = range.to > horizon ? horizon : range.to
    let disabledReason: string | undefined
    if (!supported) {
      if (future && !futureEnabled) disabledReason = '该视图暂不支持未来区间'
      else if (future && !futureAllowed(gran)) disabledReason = '未来区间仅支持月粒度'
      else disabledReason = `${GRANULARITY_LABELS[gran]}粒度下不可用`
    }
    return { id: preset.id, label: preset.label, from, to, disabledReason }
  })
}

export function TimeBar({
  device,
  tab,
  time,
  today,
  futureEnabled,
  onChange,
  onToast,
  onOpenSettings,
}: TimeBarProps) {
  const isPoint = tab === 'balance'
  const presets = buildPresets(time.gran, isPoint, today, futureEnabled)
  const horizon = futureHorizon(today)
  const allowFuture = futureEnabled && futureAllowed(time.gran)
  const state: RangeState = isPoint
    ? pointRangeState(time.point, today, time.gran)
    : rangeState(time.from, time.to, today)

  const applyRange = (next: { from: string; to: string }, presetId: string | null) => {
    const id = presetId as PresetId | null
    if (isPoint) {
      if (next.from > today && !allowFuture) {
        onToast(
          futureEnabled ? '未来时点仅支持月粒度，请先切换为月' : '该视图暂不支持未来时点',
        )
        return
      }
      if (next.from > horizon) {
        onToast(`未来最多查看 12 个自然月（至 ${horizon}）`)
        return
      }
      onChange({ ...time, point: next.from, preset: id })
      onToast(id ? `预设「${presetLabel(id)}」已生效` : `时点已切换至 ${next.from}`)
      return
    }
    const check = validateRange(next.from, next.to, time.gran, futureEnabled ? today : undefined)
    if (!check.ok) {
      onToast(check.message ?? '时间范围不合法')
      return
    }
    onChange({ ...time, from: next.from, to: next.to, preset: id })
    onToast(id ? `预设「${presetLabel(id)}」已生效` : `期间已切换至 ${next.from} ~ ${next.to}`)
  }

  const changeGran = (next: Granularity) => {
    if (next === time.gran) return
    const inFuture = isPoint
      ? time.point > today
      : rangeState(time.from, time.to, today) !== 'past'
    // 未来区间只有月粒度；切到日 / 年时回落 asOf，避免把预测塞进不支持的时间轴。
    if (inFuture && !futureAllowed(next)) {
      const fallback = isPoint
        ? { point: snapPoint(today, next) }
        : next === 'day'
          ? { from: today, to: today }
          : { from: yearStart(today), to: today }
      onChange({ ...time, gran: next, ...fallback, preset: null })
      onToast(`未来区间仅支持月粒度，已回落至 ${today}`)
      return
    }
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
      const point = shiftPoint(time.point, time.gran, delta)
      if (point > horizon) {
        onToast(`未来最多查看 12 个自然月（至 ${horizon}）`)
        return
      }
      onChange({ ...time, point, preset: null })
      return
    }
    const range = shiftRange(time.from, time.to, time.gran, delta)
    if (range.to > horizon) {
      onToast(`未来最多查看 12 个自然月（至 ${horizon}）`)
      return
    }
    onChange({ ...time, ...range, preset: null })
  }

  return (
    <div className="mb-rp-timebar">
      <div className="mb-rp-time-main">
        <div className="mb-rp-time-picker">
          <HfButton className="mb-rp-iconbtn" aria-label="上一期" onClick={() => step(-1)}>
            <ChevronLeft size={18} />
          </HfButton>
          <DatePicker
            device={device}
            mode={isPoint ? 'point' : 'range'}
            value={
              isPoint ? { from: time.point, to: time.point } : { from: time.from, to: time.to }
            }
            onChange={applyRange}
            presets={presets}
            today={today}
            maxDate={allowFuture ? horizon : today}
            disabledNote={
              allowFuture
                ? `未来可查看至 ${horizon} · 仅月粒度`
                : futureEnabled
                  ? `未来日期仅支持月粒度 · 数据截至 ${today}`
                  : `未来日期不可选 · 数据截至 ${today}`
            }
            gran={time.gran}
            variant="inline"
            align="left"
            tag={isPoint ? '月末估值' : undefined}
            sheetTitle="时间范围"
          />
          <HfButton className="mb-rp-iconbtn" aria-label="下一期" onClick={() => step(1)}>
            <ChevronRight size={18} />
          </HfButton>
        </div>
        {futureEnabled && (
          <span className={`mb-rp-range-state is-${state}`} aria-live="polite">
            {STATE_LABEL[state]}
          </span>
        )}
        <HfSegmented
          variant="granularity"
          label="聚合粒度"
          value={time.gran}
          options={GRANULARITIES.map((gran) => ({ id: gran, label: GRANULARITY_LABELS[gran] }))}
          onChange={changeGran}
        />
        {device === 'desktop' && (
          <HfButton className="mb-rp-settings-btn" onClick={onOpenSettings}>
            <Settings size={15} />
            设置
          </HfButton>
        )}
      </div>
    </div>
  )
}
