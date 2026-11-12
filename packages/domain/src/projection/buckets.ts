import {
  addDays,
  addMonths,
  isoWeekLabel,
  startOfMonth,
  startOfNextMonth,
  startOfNextYear,
  startOfWeek,
  startOfYear,
  type LocalDate,
} from '../date.js'
import type { ProjectionBucket, ProjectionGranularity } from './types.js'

/** 把任意日期归到它所在桶的起点。 */
export function bucketStartOf(granularity: ProjectionGranularity, value: LocalDate): LocalDate {
  switch (granularity) {
    case 'day':
      return value
    case 'week':
      return startOfWeek(value)
    case 'month':
      return startOfMonth(value)
    case 'year':
      return startOfYear(value)
  }
}

function nextBucketStart(granularity: ProjectionGranularity, start: LocalDate): LocalDate {
  switch (granularity) {
    case 'day':
      return addDays(start, 1)
    case 'week':
      return addDays(start, 7)
    case 'month':
      return startOfNextMonth(start)
    case 'year':
      return startOfNextYear(start)
  }
}

function bucketLabelOf(granularity: ProjectionGranularity, start: LocalDate): string {
  switch (granularity) {
    case 'day':
      return start
    case 'week':
      return isoWeekLabel(start)
    case 'month':
      return start.slice(0, 7)
    case 'year':
      return start.slice(0, 4)
  }
}

/**
 * 未来查看上限：日 3 个月 / 周 6 个月 / 月 12 个自然月末 / 年 3 年。
 * 只约束结束日期 to，过去区间不设限；是否拒绝请求由 API 层决定。
 */
export function futureLimitOf(granularity: ProjectionGranularity, asOf: LocalDate): LocalDate {
  switch (granularity) {
    case 'day':
      return addMonths(asOf, 3)
    case 'week':
      return addMonths(asOf, 6)
    case 'month':
      return addDays(startOfNextMonth(addMonths(startOfMonth(asOf), 12)), -1)
    case 'year':
      return `${Number(asOf.slice(0, 4)) + 3}-12-31` as LocalDate
  }
}

/**
 * 向外对齐生成桶，不拆桶：首尾桶的 start/end 可能溢出 from/to。
 * start / end 为闭区间，endExclusive 为半开上界。
 */
export function buildProjectionBuckets(
  granularity: ProjectionGranularity,
  from: LocalDate,
  to: LocalDate,
): ProjectionBucket[] {
  const buckets: ProjectionBucket[] = []
  let start = bucketStartOf(granularity, from)
  while (start <= to) {
    const endExclusive = nextBucketStart(granularity, start)
    buckets.push({
      granularity,
      label: bucketLabelOf(granularity, start),
      start,
      end: addDays(endExclusive, -1),
      endExclusive,
    })
    start = endExclusive
  }
  return buckets
}
