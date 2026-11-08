/**
 * 报表时间条（HF 批次 3 / 未来时间轴 P2）
 *
 * 时点看锚定日，期间看起止；粒度即改即生效。预设与日期区间全部交给共享
 * DatePicker（PC 浮层 / 移动底部面板一套交互），这里只保留报表语义：
 * 粒度步进、切粒度重锚定、四粒度各自的未来上限。
 *
 * 三态判定（已发生 / 混合 / 全未来）由 reportsTime 统一计算，时间条只负责显示；
 * 所有视图共用同一条时间条，不做视图级未来禁用。
 */
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DatePicker } from '@/features/shared/datePicker/DatePicker'
import type { DatePresetOption } from '@/features/shared/datePicker/datePickerModel'
import { HfButton } from '@/features/shared/HfButton'
import { HfSegmented } from '@/features/shared/HfSegmented'
import type { DeviceMode } from '@/features/shared/types'
import {
  GRANULARITIES,
  GRANULARITY_LABELS,
  PRESETS,
  RANGE_STATE_LABEL,
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
  /** 统计范围回显：只展示，不参与控件行排版，不改变行高。 */
  scopeTag?: string
  onChange: (next: ReportTime) => void
  onToast: (message: string) => void
}

/** 时点粒度提示：桶末估值，日粒度不额外标注。 */
const POINT_TAG: Record<Granularity, string | undefined> = {
  day: undefined,
  week: '周末估值',
  month: '月末估值',
  year: '年末估值',
}

/** 未来预设落到当前粒度 / 时点或期间的具体起止；未来端点按当前粒度上限截断。 */
function buildPresets(gran: Granularity, isPoint: boolean, today: string): DatePresetOption[] {
  const horizon = futureHorizon(today, gran)
  return PRESETS.map((preset) => {
    const future = isFuturePreset(preset.id)
    const supported = presetSupported(preset.id, gran)
    const range = isPoint
      ? { from: presetPoint(preset.id, gran, today), to: presetPoint(preset.id, gran, today) }
      : presetRange(preset.id, gran, today)
    const from = range.from > horizon ? horizon : range.from
    const to = range.to > horizon ? horizon : range.to
    let disabledReason: string | undefined
    if (!supported) {
      disabledReason = future
        ? '未来预设以自然月表述，当前粒度不可用'
        : `${GRANULARITY_LABELS[gran]}粒度下不可用`
    }
    return { id: preset.id, label: preset.label, from, to, disabledReason }
  })
}

export function TimeBar({
  device,
  tab,
  time,
  today,
  scopeTag,
  onChange,
  onToast,
}: TimeBarProps) {
  const isPoint = tab === 'balance'
  const presets = buildPresets(time.gran, isPoint, today)
  const horizon = futureHorizon(today, time.gran)
  const state: RangeState = isPoint
    ? pointRangeState(time.point, today, time.gran)
    : rangeState(time.from, time.to, today)

  const applyRange = (next: { from: string; to: string }, presetId: string | null) => {
    const id = presetId as PresetId | null
    if (isPoint) {
      if (next.from > horizon) {
        onToast(`按${GRANULARITY_LABELS[time.gran]}粒度，未来最多查看至 ${horizon}`)
        return
      }
      onChange({ ...time, point: next.from, preset: id })
      onToast(id ? `预设「${presetLabel(id)}」已生效` : `时点已切换至 ${next.from}`)
      return
    }
    const check = validateRange(next.from, next.to, time.gran, today)
    if (!check.ok) {
      onToast(check.message ?? '时间范围不合法')
      return
    }
    onChange({ ...time, from: next.from, to: next.to, preset: id })
    onToast(id ? `预设「${presetLabel(id)}」已生效` : `期间已切换至 ${next.from} ~ ${next.to}`)
  }

  const changeGran = (next: Granularity) => {
    if (next === time.gran) return
    const nextHorizon = futureHorizon(today, next)
    const inFuture = isPoint
      ? time.point > today
      : rangeState(time.from, time.to, today) !== 'past'

    if (isPoint) {
      const snapped = snapPoint(time.point, next)
      const point = inFuture && snapped > nextHorizon ? nextHorizon : snapped
      onChange({ ...time, gran: next, point, preset: null })
      onToast(
        point !== snapped
          ? `按${GRANULARITY_LABELS[next]}粒度，未来最多查看至 ${nextHorizon}，时点已调整`
          : `粒度已切换为${GRANULARITY_LABELS[next]}，时点自动对齐桶末`,
      )
      return
    }

    const range = reanchorRange(time.from, time.to, next)
    const to = range.to > nextHorizon ? nextHorizon : range.to
    let from = range.from > nextHorizon ? nextHorizon : range.from
    if (from > to) from = to
    const clamped = from !== range.from || to !== range.to
    const keepPreset = time.preset && presetSupported(time.preset, next) ? time.preset : null
    onChange({ ...time, gran: next, from, to, preset: keepPreset })
    onToast(
      clamped
        ? `按${GRANULARITY_LABELS[next]}粒度，未来最多查看至 ${nextHorizon}，期间已截断`
        : keepPreset
          ? `粒度已切换为${GRANULARITY_LABELS[next]}`
          : `粒度已切换为${GRANULARITY_LABELS[next]}，无法套用原预设，已转为自定义期间`,
    )
  }

  const step = (delta: number) => {
    if (isPoint) {
      const point = shiftPoint(time.point, time.gran, delta)
      if (point > horizon) {
        onToast(`按${GRANULARITY_LABELS[time.gran]}粒度，未来最多查看至 ${horizon}`)
        return
      }
      onChange({ ...time, point, preset: null })
      return
    }
    const range = shiftRange(time.from, time.to, time.gran, delta)
    if (range.to > horizon) {
      onToast(`按${GRANULARITY_LABELS[time.gran]}粒度，未来最多查看至 ${horizon}`)
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
            maxDate={horizon}
            disabledNote={`未来可查看至 ${horizon} · ${GRANULARITY_LABELS[time.gran]}粒度`}
            gran={time.gran}
            variant="inline"
            align="left"
            tag={isPoint ? POINT_TAG[time.gran] : undefined}
            sheetTitle="时间范围"
          />
          <HfButton className="mb-rp-iconbtn" aria-label="下一期" onClick={() => step(1)}>
            <ChevronRight size={18} />
          </HfButton>
        </div>
        <span className={`mb-rp-range-state is-${state}`} aria-live="polite">
          {RANGE_STATE_LABEL[state]}
        </span>
        <HfSegmented
          variant="granularity"
          label="聚合粒度"
          value={time.gran}
          options={GRANULARITIES.map((gran) => ({ id: gran, label: GRANULARITY_LABELS[gran] }))}
          onChange={changeGran}
        />
        {scopeTag && <span className="mb-rp-scope-tag">{scopeTag}</span>}
      </div>
    </div>
  )
}
