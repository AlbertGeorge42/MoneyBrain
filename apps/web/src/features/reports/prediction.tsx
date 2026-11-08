/**
 * 未来数据的统一编码（报表未来时间轴）
 *
 * 「预测」只有一个来源：表格 hint / 指标构成说明都由这里产出，四个视图不得各写一份。
 * 编码规则：文字标记常驻，不靠颜色、透明度或 tooltip；标记文字来自 predictionModel。
 */
import type { PredictionKind } from './predictionModel'
import { PREDICTION_TEXT } from './predictionModel'

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
