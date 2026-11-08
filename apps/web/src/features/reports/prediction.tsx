/**
 * 未来数据的统一编码（报表未来时间轴）
 *
 * 「预测」只有一个来源：文字标签 + 图例首项 + 图表虚实线 + asOf 竖向虚线 + 表格 hint
 * 都由这里产出，四个视图不得各写一份。
 *
 * 编码规则（浅色 / 暗色共用 token，不写死颜色）：
 * - 文字标记：`预测` / `预算计划`；任何未来数字旁必须有标记，不能只靠 tooltip；
 * - 图例首项：固定为「预测」标记，其次才是已发生；
 * - 折线：已发生实线；未来（预测）虚线；预算计划用虚线 + 文字标记，不混用纹理；
 * - asOf：竖向虚线 + 「数据截至」说明，标记真实数据的终点。
 *
 * 本文件只拼装展示，不做任何金额加减；构成项全部由调用方传入后端字段。
 */
import type { ReactNode } from 'react'
import {
  PREDICTION_TEXT,
  type BreakdownItem,
  type PredictionKind,
} from './predictionModel'

export type { BreakdownItem, PredictionKind }

/** 任何未来数字旁的常驻文字标记。 */
export function PredictionBadge({
  kind = 'prediction',
  label,
  title,
}: {
  kind?: PredictionKind
  label?: string
  title?: string
}) {
  return (
    <span
      className={`mb-rp-predict-badge is-${kind}`}
      title={title}
      data-kind={kind}
    >
      {label ?? PREDICTION_TEXT[kind]}
    </span>
  )
}

/** 表格 / 卡片行内后缀：已知标记统一走 PredictionBadge，其余字符串保持原样。 */
export function ReportRowHint({ hint }: { hint: string }) {
  if (hint === PREDICTION_TEXT.prediction) return <PredictionBadge kind="prediction" />
  if (hint === PREDICTION_TEXT.budgetPlan) return <PredictionBadge kind="budgetPlan" />
  return <span className="mb-rp-row-hint">{hint}</span>
}

/** 图例：首项固定为「预测」，其后才是已发生与调用方补充项。 */
export function PredictionLegend({
  actualLabel = '已发生',
  extra,
}: {
  actualLabel?: string
  extra?: ReactNode
}) {
  return (
    <div className="mb-rp-predict-legend" aria-label="图例">
      <span className="mb-rp-predict-legend-item">
        <span className="mb-rp-predict-swatch is-predicted" aria-hidden="true" />
        <PredictionBadge kind="prediction" />
      </span>
      <span className="mb-rp-predict-legend-item">
        <span className="mb-rp-predict-swatch is-actual" aria-hidden="true" />
        {actualLabel}
      </span>
      {extra}
    </div>
  )
}

/** 图表中的 asOf 竖向虚线（真实数据终点）；四个视图共用。 */
export function PredictionAsOfLine({
  x,
  top,
  bottom,
  label,
}: {
  x: number
  top: number
  bottom: number
  label: string
}) {
  return (
    <g className="mb-rp-predict-asof">
      <line x1={x} y1={top} x2={x} y2={bottom} />
      <text x={x} y={top - 6} textAnchor="start">
        {label}
      </text>
    </g>
  )
}

/**
 * 构成明细：真实值 / 计划值 / 合计。
 *
 * 桌面悬停与移动点按复用同一份 items，后端字段原样展示；
 * 这里不出现任何 `reduce`、相加或倒推。
 */
export function PredictionBreakdown({
  title,
  items,
  note,
}: {
  title?: string
  items: BreakdownItem[]
  note?: string
}) {
  return (
    <div className="mb-rp-predict-detail">
      {title && (
        <div className="mb-rp-predict-detail-head">
          <strong>{title}</strong>
          <PredictionBadge kind="prediction" />
        </div>
      )}
      <dl className="mb-rp-predict-detail-list">
        {items.map((item) => (
          <div
            key={item.label}
            className={item.total ? 'mb-rp-predict-detail-row is-total' : 'mb-rp-predict-detail-row'}
          >
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
      {note && <p className="mb-rp-predict-note">{note}</p>}
    </div>
  )
}
