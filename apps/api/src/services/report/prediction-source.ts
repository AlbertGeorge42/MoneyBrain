import {
  ZERO_MINOR,
  fromDate,
  type LedgerTransaction,
  type PredictedEvent,
  type TransactionKind,
} from '../../../../../packages/domain/src/index.js'
import { toMinor } from '../../common/index.js'
import { dayEnd, formatDateLocal } from '../../common/date.js'
import { generatePredictions } from '../budget.service.js'
import type { PredictionTransaction } from './cash-flow-types.js'

/** 报表提示文案：API 返回前端的展示字符串，Domain 不生成文案。 */
export const PREDICTION_NOTE_DEFAULT = '含预算预测数据'
export const PREDICTION_NOTE_BALANCE_SHEET = '预算影响后的预测值，不含投资收益、资产增值等'

/**
 * 条件获取预算预测点位（纯取数编排，不含金额算法）。
 *
 * 起点恒为今天而不是报表窗口起点：否则窗口起点之前的预算点位会被吞掉，
 * 纯预测场景下期初预测恒为 0。窗口内的过滤由各报表 / 领域函数负责。
 */
export async function getPredictionsIfFuture(
  endDate: string,
  includePredictions: boolean,
): Promise<PredictionTransaction[]> {
  if (!includePredictions) return []

  const now = new Date()
  const end = dayEnd(endDate)
  if (end <= now) return []

  return generatePredictions(formatDateLocal(now), endDate)
}

/** 预算点位 → 预测领域事件：统一走复式分录，不再手写符号表。 */
export function toPredictedEvents(predictions: readonly PredictionTransaction[]): PredictedEvent[] {
  const events: PredictedEvent[] = []
  for (const p of predictions) {
    if (p.type !== 'income' && p.type !== 'expense' && p.type !== 'transfer') continue
    const ledger: LedgerTransaction = {
      id: `${p.budgetId}-${p.date.getTime()}-${p.accountId}`,
      kind: p.type as TransactionKind,
      date: fromDate(p.date),
      amount: toMinor(p.amount),
      fee: ZERO_MINOR,
      coupon: ZERO_MINOR,
      accountId: p.accountId,
      toAccountId: p.toAccountId,
      categoryId: p.categoryId,
      relatedTransactionId: null,
      relatedType: null,
      excludeFromIncomeExpense: false,
    }
    events.push({ time: p.date.getTime(), ledger })
  }
  return events
}
