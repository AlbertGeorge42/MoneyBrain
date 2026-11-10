/**
 * 四粒度桶（日 / ISO 周 / 自然月 / 自然年）。
 *
 * 投影与预算计划共用同一套桶边界、标签与未来上限，避免两条链路对
 * 「同一区间」产出不同标签或不同上限。
 */
import type { ProjectionGranularity } from '../../../../../packages/contracts/types/index.js'
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
} from '../../../../../packages/domain/src/index.js'
import { ValidationError } from '../../common/error.js'

export interface ProjectionBucket {
  granularity: ProjectionGranularity
  label: string
  /** 桶起点（含）。 */
  start: LocalDate
  /** 桶终点（含），点位的 date 即此值。 */
  end: LocalDate
  endExclusive: LocalDate
}

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

const GRANULARITY_NAME: Record<ProjectionGranularity, string> = {
  day: '日',
  week: '周',
  month: '月',
  year: '年',
}

/**
 * 未来查看上限（只约束结束日期 `to`；过去区间不设限）。
 * 日 3 个月 / 周 6 个月 / 月 12 个月 / 年 3 年——年粒度不放到 5 年，
 * 避免日预算在极端情况下展开过多 occurrence 后只能报错。
 */
function futureLimitOf(granularity: ProjectionGranularity, asOf: LocalDate): LocalDate {
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
 * 向外对齐生成桶，不拆桶：
 * - 日：from..to 的每一天
 * - 周：ISO 周一起，首尾桶可能有 from/to 之外的日期
 * - 月：自然月；年：自然年
 */
export function buildProjectionBuckets(
  asOf: LocalDate,
  granularity: ProjectionGranularity,
  from: LocalDate,
  to: LocalDate,
): ProjectionBucket[] {
  const limit = futureLimitOf(granularity, asOf)
  if (to > limit) {
    const coarser = granularity === 'day'
      ? '；也可改用更粗的粒度（周 / 月 / 年）'
      : granularity === 'week'
        ? '；也可改用更粗的粒度（月 / 年）'
        : granularity === 'month'
          ? '；也可改用更粗的粒度（年）'
          : ''
    throw new ValidationError(
      `按${GRANULARITY_NAME[granularity]}粒度，未来最多查看至 ${limit}：请把结束日期 to 调早${coarser}后重试`,
    )
  }

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
