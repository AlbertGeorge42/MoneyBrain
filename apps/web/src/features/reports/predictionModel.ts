/**
 * 预测编码的常量与展示模型。
 *
 * 单独成文件，避免组件文件同时导出常量触发 react-refresh 警告；
 * 四个视图的标签文字与构成项类型都从这里取。
 */

export type PredictionKind = 'prediction' | 'budgetPlan'

export const PREDICTION_TEXT: Record<PredictionKind, string> = {
  prediction: '预测',
  budgetPlan: '预算计划',
}

export interface BreakdownItem {
  label: string
  value: string
  /** 接口合计行；强调显示，但仍是后端字段直出。 */
  total?: boolean
}
