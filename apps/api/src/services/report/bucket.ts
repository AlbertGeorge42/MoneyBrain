/**
 * 四粒度桶的 API 边界：只负责未来上限的 HTTP 校验与文案。
 * 分桶、标签、向外对齐、上限计算全部由领域层 `projection/buckets.ts` 提供。
 */
import {
  buildProjectionBuckets as buildBuckets,
  futureLimitOf,
  type ProjectionGranularity,
  type ProjectionBucket,
  type LocalDate,
} from '../../../../../packages/domain/src/index.js'
import { ValidationError } from '../../common/error.js'

const GRANULARITY_NAME: Record<ProjectionGranularity, string> = {
  day: '日',
  week: '周',
  month: '月',
  year: '年',
}

/**
 * 向外对齐生成桶，不拆桶；超出未来上限直接抛 400（不截断 to）。
 * 过去区间不设限。
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
  return buildBuckets(granularity, from, to)
}
