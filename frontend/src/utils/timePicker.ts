import dayjs, { type Dayjs } from 'dayjs'

export type TimeGranularity = 'day' | 'month' | 'year'

export interface PointTimeValue {
  granularity: TimeGranularity
  value: Dayjs
}

export interface RangeTimeValue {
  granularity: TimeGranularity
  start: Dayjs
  end: Dayjs
}

export interface TimePreset<T> {
  key: string
  label: string
  getValue: (reference: Dayjs) => T
}

export interface PointTimePickerConfig {
  label?: string
  allowedGranularities: TimeGranularity[]
  presets: Partial<Record<TimeGranularity, TimePreset<PointTimeValue>[]>>
  minDate?: Dayjs
  maxDate?: Dayjs
}

export interface RangeTimePickerConfig {
  label?: string
  allowedGranularities: TimeGranularity[]
  presets: Partial<Record<TimeGranularity, TimePreset<RangeTimeValue>[]>>
  minDate?: Dayjs
  maxDate?: Dayjs
}

export const normalizePointValue = (value: PointTimeValue): PointTimeValue => ({
  granularity: value.granularity,
  value: value.value.startOf(value.granularity),
})

export const normalizeRangeValue = (value: RangeTimeValue): RangeTimeValue => {
  const normalizedStart = value.start.startOf(value.granularity)
  const normalizedEnd = value.end.endOf(value.granularity)

  if (normalizedStart.isAfter(normalizedEnd)) {
    return {
      granularity: value.granularity,
      start: normalizedEnd.startOf(value.granularity),
      end: normalizedStart.endOf(value.granularity),
    }
  }

  return {
    granularity: value.granularity,
    start: normalizedStart,
    end: normalizedEnd,
  }
}

export const movePointValue = (value: PointTimeValue, offset: number): PointTimeValue =>
  normalizePointValue({
    granularity: value.granularity,
    value: value.value.add(offset, value.granularity),
  })

const getRangeSpan = (value: RangeTimeValue): number => {
  if (value.granularity === 'day') {
    return value.end.startOf('day').diff(value.start.startOf('day'), 'day') + 1
  }

  if (value.granularity === 'month') {
    return value.end.startOf('month').diff(value.start.startOf('month'), 'month') + 1
  }

  return value.end.startOf('year').diff(value.start.startOf('year'), 'year') + 1
}

export const moveRangeValue = (value: RangeTimeValue, offset: number): RangeTimeValue => {
  const span = getRangeSpan(value)
  const amount = span * offset

  // 区间导航按当前区间跨度整体平移，保持“上一周期/下一周期”的语义一致。
  return normalizeRangeValue({
    granularity: value.granularity,
    start: value.start.add(amount, value.granularity),
    end: value.end.add(amount, value.granularity),
  })
}

export const formatPointValue = (value: PointTimeValue): string => {
  if (value.granularity === 'day') {
    return value.value.format('YYYY-MM-DD')
  }

  if (value.granularity === 'month') {
    return value.value.format('YYYY年MM月')
  }

  return value.value.format('YYYY年')
}

export const formatRangeValue = (value: RangeTimeValue): string => {
  if (value.granularity === 'day') {
    return `${value.start.format('YYYY-MM-DD')} ~ ${value.end.format('YYYY-MM-DD')}`
  }

  if (value.granularity === 'month') {
    return `${value.start.format('YYYY年MM月')} ~ ${value.end.format('YYYY年MM月')}`
  }

  return `${value.start.format('YYYY年')} ~ ${value.end.format('YYYY年')}`
}

export const toMonthParam = (value: PointTimeValue): string => value.value.format('YYYY-MM')

export const toDateParam = (value: PointTimeValue): string => {
  if (value.granularity === 'day') {
    return value.value.format('YYYY-MM-DD')
  }
  if (value.granularity === 'month') {
    return value.value.format('YYYY-MM')
  }
  return value.value.format('YYYY')
}

export const toDateRangeParams = (value: RangeTimeValue): { startDate: string; endDate: string } => ({
  startDate: value.start.format('YYYY-MM-DD'),
  endDate: value.end.format('YYYY-MM-DD'),
})

export const createPointValue = (granularity: TimeGranularity, value: Dayjs): PointTimeValue =>
  normalizePointValue({ granularity, value })

export const createRangeValue = (granularity: TimeGranularity, start: Dayjs, end: Dayjs): RangeTimeValue =>
  normalizeRangeValue({ granularity, start, end })

export const getGranularityText = (granularity: TimeGranularity): string => {
  if (granularity === 'day') return '日'
  if (granularity === 'month') return '月'
  return '年'
}

export const createPointPeriodPreset = (
  key: string,
  label: string,
  granularity: TimeGranularity,
  offset = 0,
): TimePreset<PointTimeValue> => ({
  key,
  label,
  getValue: (reference) => createPointValue(granularity, reference.add(offset, granularity)),
})

export const createPointMonthStartPreset = (
  key: string,
  label: string,
): TimePreset<PointTimeValue> => ({
  key,
  label,
  getValue: (reference) => createPointValue('day', reference.startOf('month')),
})

export const createPointMonthEndPreset = (
  key: string,
  label: string,
): TimePreset<PointTimeValue> => ({
  key,
  label,
  getValue: (reference) => createPointValue('day', reference.endOf('month')),
})

export const createRangePeriodPreset = (
  key: string,
  label: string,
  granularity: TimeGranularity,
  offset = 0,
): TimePreset<RangeTimeValue> => ({
  key,
  label,
  getValue: (reference) => {
    const anchor = reference.add(offset, granularity)
    return createRangeValue(granularity, anchor.startOf(granularity), anchor.endOf(granularity))
  },
})

export const createTrailingRangePreset = (
  key: string,
  label: string,
  amount: number,
  granularity: TimeGranularity,
): TimePreset<RangeTimeValue> => ({
  key,
  label,
  getValue: (reference) => {
    const start = reference.subtract(amount - 1, granularity).startOf(granularity)
    const end = reference.endOf(granularity)
    return createRangeValue(granularity, start, end)
  },
})

const getQuarterStart = (value: Dayjs): Dayjs => {
  const quarterStartMonth = Math.floor(value.month() / 3) * 3
  return value.month(quarterStartMonth).startOf('month')
}

const getQuarterEnd = (value: Dayjs): Dayjs => getQuarterStart(value).add(2, 'month').endOf('month')

export const createQuarterRangePreset = (key: string, label: string, offset = 0): TimePreset<RangeTimeValue> => ({
  key,
  label,
  getValue: (reference) => {
    const anchor = getQuarterStart(reference).add(offset * 3, 'month')
    return createRangeValue('month', anchor.startOf('month'), anchor.add(2, 'month').endOf('month'))
  },
})

export const createYearToDatePreset = (key: string, label: string): TimePreset<RangeTimeValue> => ({
  key,
  label,
  getValue: (reference) => createRangeValue('day', reference.startOf('year'), reference.endOf('day')),
})

export const createCurrentQuarterRange = (reference: Dayjs): RangeTimeValue =>
  createRangeValue('month', getQuarterStart(reference), getQuarterEnd(reference))

export function getRangeTimeSemantics(start: Dayjs, end: Dayjs): { isPast: boolean; isFuture: boolean; isMixed: boolean } {
  const today = dayjs().startOf('day')
  const e = end.startOf('day')
  const s = start.startOf('day')
  const isPast = e.isBefore(today) || e.isSame(today)
  const isFuture = s.isAfter(today)
  const isMixed = !isPast && !isFuture
  return { isPast, isFuture, isMixed }
}

export function getPointTimeSemantics(value: Dayjs): { isPastOrToday: boolean; isFuture: boolean } {
  const today = dayjs().startOf('day')
  const v = value.startOf('day')
  const isPastOrToday = v.isBefore(today) || v.isSame(today)
  const isFuture = v.isAfter(today)
  return { isPastOrToday, isFuture }
}

// ─── 反序列化：从 URL 参数字符串恢复时间值 ───

/** 根据粒度选择日期格式 */
const granularityFormat = (g: TimeGranularity): string => {
  if (g === 'day') return 'YYYY-MM-DD'
  if (g === 'month') return 'YYYY-MM'
  return 'YYYY'
}

/** 推断日期字符串的粒度：4位=year, 7位=month, 10位=day */
const inferGranularity = (dateStr: string): TimeGranularity => {
  if (dateStr.length <= 4) return 'year'
  if (dateStr.length <= 7) return 'month'
  return 'day'
}

/** 序列化 PointTimeValue 为 URL 参数字符串，按粒度输出 YYYY / YYYY-MM / YYYY-MM-DD */
export const toPointTimeParam = (value: PointTimeValue): string =>
  value.value.format(granularityFormat(value.granularity))

/** 序列化 RangeTimeValue 为 URL 参数字符串，按粒度输出 start,end */
export const toRangeTimeParam = (value: RangeTimeValue): string => {
  const fmt = granularityFormat(value.granularity)
  return `${value.start.format(fmt)},${value.end.format(fmt)}`
}

/** 从 URL 参数字符串恢复 PointTimeValue，格式：YYYY / YYYY-MM / YYYY-MM-DD */
export const fromPointTimeParam = (dateStr: string): PointTimeValue => {
  const granularity = inferGranularity(dateStr)
  return createPointValue(granularity, dayjs(dateStr))
}

/** 从 URL 参数字符串恢复 RangeTimeValue，格式按粒度：YYYY,YYYY / YYYY-MM,YYYY-MM / YYYY-MM-DD,YYYY-MM-DD */
export const fromRangeTimeParam = (rangeStr: string): RangeTimeValue | null => {
  const parts = rangeStr.split(',')
  if (parts.length !== 2) return null
  const [startStr, endStr] = parts
  const granularity = inferGranularity(startStr)
  return createRangeValue(granularity, dayjs(startStr), dayjs(endStr))
}