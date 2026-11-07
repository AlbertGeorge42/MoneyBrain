/**
 * 报表时间条（HF 批次 3 / 统一日期控件接入）
 *
 * 时点看锚定日，期间看起止；粒度即改即生效。预设与日期区间全部交给共享
 * DatePicker（PC 浮层 / 移动底部面板一套交互），这里只保留报表语义：
 * 粒度步进、切粒度重锚定、未来日期禁用的可见原因。
 */
import { ChevronLeft, ChevronRight, Settings } from 'lucide-react'
import { DatePicker } from '@/features/shared/datePicker/DatePicker'
import type { DatePresetOption } from '@/features/shared/datePicker/datePickerModel'
import { HfSegmented } from '@/features/shared/HfSegmented'
import type { DeviceMode } from '@/features/shared/types'
import {
  GRANULARITIES,
  GRANULARITY_LABELS,
  PRESETS,
  presetLabel,
  presetPoint,
  presetRange,
  presetSupported,
  reanchorRange,
  shiftPoint,
  shiftRange,
  snapPoint,
  validateRange,
  type Granularity,
  type PresetId,
  type ReportTab,
  type ReportTime,
} from './reportsTime'

interface TimeBarProps {
  device: DeviceMode
  tab: ReportTab
  time: ReportTime
  /** 期间锚点：API 模式是真实今天 / 最新流水，种子模式是冻结的 2026-10-28。 */
  today: string
  onChange: (next: ReportTime) => void
  onToast: (message: string) => void
  onOpenSettings: () => void
}

/** 预设落到当前粒度 / 时点或期间的具体起止；未来端点按数据截止日截断。 */
function buildPresets(
  gran: Granularity,
  isPoint: boolean,
  today: string,
): DatePresetOption[] {
  return PRESETS.map((preset) => {
    const supported = presetSupported(preset.id, gran)
    const range = isPoint
      ? { from: presetPoint(preset.id, gran, today), to: presetPoint(preset.id, gran, today) }
      : presetRange(preset.id, gran, today)
    const from = range.from > today ? today : range.from
    const to = range.to > today ? today : range.to
    return {
      id: preset.id,
      label: preset.label,
      from,
      to,
      disabledReason: supported ? undefined : `${GRANULARITY_LABELS[gran]}粒度下不可用`,
    }
  })
}

export function TimeBar({ device, tab, time, today, onChange, onToast, onOpenSettings }: TimeBarProps) {
  const isPoint = tab === 'balance'
  const presets = buildPresets(time.gran, isPoint, today)

  const applyRange = (next: { from: string; to: string }, presetId: string | null) => {
    const id = presetId as PresetId | null
    if (isPoint) {
      onChange({ ...time, point: next.from, preset: id })
      onToast(id ? `预设「${presetLabel(id)}」已生效` : `时点已切换至 ${next.from}`)
      return
    }
    const check = validateRange(next.from, next.to, time.gran)
    if (!check.ok) {
      onToast(check.message ?? '时间范围不合法')
      return
    }
    onChange({ ...time, from: next.from, to: next.to, preset: id })
    onToast(id ? `预设「${presetLabel(id)}」已生效` : `期间已切换至 ${next.from} ~ ${next.to}`)
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
    <div className="mb-rp-timebar">
      <div className="mb-rp-time-main">
        <div className="mb-rp-time-picker">
          <button type="button" className="mb-rp-iconbtn" aria-label="上一期" onClick={() => step(-1)}>
            <ChevronLeft size={18} />
          </button>
          <DatePicker
            device={device}
            mode={isPoint ? 'point' : 'range'}
            value={
              isPoint ? { from: time.point, to: time.point } : { from: time.from, to: time.to }
            }
            onChange={applyRange}
            presets={presets}
            today={today}
            maxDate={today}
            disabledNote={`未来日期不可选 · 数据截至 ${today}`}
            gran={time.gran}
            variant="inline"
            align="left"
            tag={isPoint ? '月末估值' : undefined}
            sheetTitle="时间范围"
          />
          <button type="button" className="mb-rp-iconbtn" aria-label="下一期" onClick={() => step(1)}>
            <ChevronRight size={18} />
          </button>
        </div>
        <HfSegmented
          variant="granularity"
          label="聚合粒度"
          value={time.gran}
          options={GRANULARITIES.map((gran) => ({ id: gran, label: GRANULARITY_LABELS[gran] }))}
          onChange={changeGran}
        />
        {device === 'desktop' && (
          <button type="button" className="mb-rp-settings-btn" onClick={onOpenSettings}>
            <Settings size={15} />
            设置
          </button>
        )}
      </div>
    </div>
  )
}
