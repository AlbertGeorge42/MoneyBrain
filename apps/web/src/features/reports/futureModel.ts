/**
 * 报表未来区间的取数窗口（报表未来时间轴）
 *
 * 窗口只描述「asOf + 粒度 + from/to」，桶边界与累计全部由后端计算；
 * 这里不插值、不摊平、不做任何金额相加。
 */
import { bucketEndOf, bucketStartOf, type Granularity } from './reportsTime'

/** 推演窗口：与后端 `from/to + granularity` 一一对应，同一区间只发一次请求。 */
export interface ProjectionWindow {
  asOf: string
  granularity: Granularity
  from: string
  to: string
}

/**
 * 资产负债时点窗口：
 * - 从今天所在桶的起点起算，保留「已发生 / 混合」基准；
 * - 止于所选时点所在桶的终点，由后端按粒度输出桶末余额。
 */
export function pointWindow(
  point: string,
  today: string,
  gran: Granularity,
): ProjectionWindow {
  const from = bucketStartOf(today, gran)
  const to = bucketEndOf(point, gran)
  return { asOf: today, granularity: gran, from: from > to ? to : from, to }
}

/**
 * 期间窗口（收支 / 现金流）：
 * - 起止保持用户选择，桶由后端向外对齐；
 * - 止对齐到桶末，避免把半个桶当成完整期间。
 */
export function periodWindow(
  from: string,
  to: string,
  today: string,
  gran: Granularity,
): ProjectionWindow {
  return { asOf: today, granularity: gran, from, to: bucketEndOf(to, gran) }
}
