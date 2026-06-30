import { generatePredictions } from '../budget.service.js'
import { dayStart, dayEnd } from '../../common/date.js'

// 重导出日期工具，保持原有 import 路径可用
export { dayStart, dayEnd, nextDay, formatDateLocal } from '../../common/date.js'

// ===== 常量 =====

export const PREDICTION_NOTE_DEFAULT = '含预算预测数据'
export const PREDICTION_NOTE_BALANCE_SHEET = '预算影响后的预测值，不含投资收益、资产增值等'

// ===== 预测相关 =====

interface PredictionLike {
  type: string
  amount: number
  accountId: string
  toAccountId: string | null
}

interface AccountTypeLookup {
  get(id: string): { type: string } | undefined
}

/**
 * 遍历预测列表，按 income/expense/transfer 分类，
 * 返回每个账户的余额变动 Map<accountId, change>
 */
export function accumulatePredictionChanges(
  predictions: PredictionLike[]
): Map<string, number> {
  const changes = new Map<string, number>()

  for (const p of predictions) {
    if (p.type === 'income') {
      changes.set(p.accountId, (changes.get(p.accountId) || 0) + p.amount)
    }
    if (p.type === 'expense') {
      changes.set(p.accountId, (changes.get(p.accountId) || 0) - p.amount)
    }
    if (p.type === 'transfer') {
      changes.set(p.accountId, (changes.get(p.accountId) || 0) - p.amount)
      if (p.toAccountId) {
        changes.set(p.toAccountId, (changes.get(p.toAccountId) || 0) + p.amount)
      }
    }
  }

  return changes
}

/**
 * 从 predictionChanges Map 中，按账户类型汇总资产/负债变动
 */
export function sumPredictionByType(
  predictionChanges: Map<string, number>,
  accountLookup: AccountTypeLookup
): { assetChange: number; liabilityChange: number } {
  let assetChange = 0
  let liabilityChange = 0

  for (const [accountId, change] of predictionChanges.entries()) {
    const account = accountLookup.get(accountId)
    if (account?.type === 'asset') assetChange += change
    else if (account?.type === 'liability') liabilityChange += change
  }

  return { assetChange, liabilityChange }
}

// ===== 时点预测快照（统一 API） =====

interface PredictionWithDate extends PredictionLike {
  date: Date
}

/**
 * 过滤到指定时点（含）为止的预测数据
 * predictions 通常已按 date 升序排序，但本函数不依赖该约定。
 */
export function filterPredictionsUpTo<P extends PredictionWithDate>(
  predictions: P[],
  timePoint: Date
): P[] {
  const cutoff = timePoint.getTime()
  return predictions.filter(p => p.date.getTime() <= cutoff)
}

/**
 * 计算指定时点的预测资产/负债/净资产变动。
 *
 * 返回的金额是**带正负号的变动量**，调用方应叠加到 actual 之上：
 * - `assets` 始终 >= 0（正数代表资产增加）
 * - `liabilities` 始终 >= 0（正数代表负债绝对值增加）
 * - `netWorth = assets - liabilities`
 *
 * 统一了原先收入支出表 "actual + 变动" 的差值写法，避免混合期与纯预测期的分叉逻辑。
 */
export function computePredictedAssetsLiabilities<P extends PredictionWithDate>(
  predictions: P[],
  timePoint: Date,
  accountLookup: Map<string, { type: string }>
): { assets: number; liabilities: number; netWorth: number } {
  const relevant = filterPredictionsUpTo(predictions, timePoint)
  const changes = accumulatePredictionChanges(relevant)
  const { assetChange, liabilityChange } = sumPredictionByType(changes, accountLookup)

  // 资产/负债变动可能为负（accumulate 把 expense 当作 -amount），
  // 报表口径上我们关心的是"绝对值变化量"，因此取负使正数代表负债增加。
  // 注意：使用 +0 避免 Object.is(-0, 0) 判定为不等。
  return {
    assets: assetChange,
    liabilities: liabilityChange !== 0 ? -liabilityChange : 0,
    netWorth: assetChange + liabilityChange,
  }
}

/**
 * 计算指定时点的"指定账户集合"的预测余额变动。
 *
 * 适用于：
 * - 现金流量表：传入 cashAccountIds，统计现金类账户的预测变动
 * - 投资分析表：传入 investmentAccountIds，统计投资类账户的预测变动
 *
 * transfer 内部抵消语义：若 fromAccount 与 toAccount 同属指定集合，金额相消，外部表现为 0。
 */
export function computePredictedAccountTotal<P extends PredictionWithDate>(
  predictions: P[],
  timePoint: Date,
  accountIds: ReadonlySet<string>
): number {
  const relevant = filterPredictionsUpTo(predictions, timePoint)
  let total = 0
  for (const p of relevant) {
    const isFrom = accountIds.has(p.accountId)
    const isTo = p.toAccountId !== null && accountIds.has(p.toAccountId)
    if (!isFrom && !isTo) continue

    if (p.type === 'income' && isFrom) total += p.amount
    else if (p.type === 'expense' && isFrom) total -= p.amount
    else if (p.type === 'transfer') {
      if (isFrom) total -= p.amount
      if (isTo) total += p.amount
    }
  }
  return total
}

// ===== 资产/负债/净资产求和 =====

interface AccountWithType {
  type: string
}

/**
 * 按账户类型求和
 * @param getValue 获取账户余额的函数
 */
export function sumByType<T extends AccountWithType>(
  accounts: T[],
  type: 'asset' | 'liability',
  getValue: (account: T) => number
): number {
  return accounts
    .filter(a => a.type === type)
    .reduce((sum, a) => sum + getValue(a), 0)
}

/**
 * 汇总资产、负债、净资产
 *
 * 数据约定（API 层契约）：
 * - `assets`    正数：当前资产总额
 * - `liabilities` 正数：当前负债金额（"你欠多少"），不再保留数据库中"余额为负"的旧约定
 * - `netWorth`  资产 - 负债，可正可负
 *
 * 数据库中负债账户的余额通常为负（-1000 表示欠 1000），这里取绝对值再相减。
 * 历史调用方若依赖旧约定（`liabilities` 为负、`netWorth = assets + liabilities`），
 * 请改为读 `liabilities` 后自行处理符号，或调用方直接用 `assets - Math.abs(liabilities)` 计算净资产。
 */
export function sumAssetsLiabilities<T extends AccountWithType>(
  accounts: T[],
  getValue: (account: T) => number
): { assets: number; liabilities: number; netWorth: number } {
  const assets = sumByType(accounts, 'asset', getValue)
  const liabilities = Math.abs(sumByType(accounts, 'liability', getValue))
  return { assets, liabilities, netWorth: assets - liabilities }
}

// ===== 预测数据获取 =====

interface Prediction {
  date: Date
  type: string
  amount: number
  note: string | null
  accountId: string
  toAccountId: string | null
  categoryId: string | null
  budgetId: string
  budgetName: string
}

/**
 * 条件获取预测数据：当 end > now 时调用 generatePredictions，
 * 否则返回空数组。自动处理 predictionsStart 的截断。
 */
export async function getPredictionsIfFuture(
  startDate: string,
  endDate: string,
  includePredictions: boolean
): Promise<Prediction[]> {
  if (!includePredictions) return []

  const now = new Date()
  const end = dayEnd(endDate)

  if (end <= now) return []

  // 预测范围从今天开始，而不是 startDate。
  // 即使整个期间在未来，也必须从今天开始生成预测，
  // 否则 startDate 之前的预测（如 startDate=2026-07-01 时，6/9 到 6/30 的预算）
  // 会被吞掉，导致纯预测场景下 startPredicted 永远为 0。
  // 期初/期末的过滤由 computePredictedAssetsLiabilities / computePredictedAccountTotal 内部完成。
  const nowStr = now.toISOString().split('T')[0]
  return generatePredictions(nowStr, endDate)
}
