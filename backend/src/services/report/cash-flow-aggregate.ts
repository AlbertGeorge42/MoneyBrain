import { Decimal } from '@prisma/client/runtime/library.js'
import { ZERO } from '../../common/index.js'
import { AggregatedFlows, CashFlowActivityDecimal, ProcessedTx } from './cash-flow-types.js'

export function calculateCashFlowAmount(type: string, amount: Decimal, fee: Decimal, coupon: Decimal): Decimal {
  if (type === 'expense' || type === 'transfer') {
    return amount.plus(fee).minus(coupon)
  }
  if (type === 'refund') {
    return amount.minus(fee).plus(coupon)
  }
  return amount
}

export function calculateCashTransferInAmount(amount: Decimal, fee: Decimal, coupon: Decimal): Decimal {
  return amount.minus(fee).plus(coupon)
}

// 查找或新增 activity item：相同 categoryName + direction 累加金额，否则新增
function upsertActivityItem(
  items: CashFlowActivityDecimal['items'],
  amount: Decimal,
  categoryName: string,
  direction: 'inflow' | 'outflow',
  meta: { categoryId: string | null; parentId: string | null; level: number; type: string; icon?: string | null; color?: string | null }
): void {
  const sign = direction === 'inflow' ? 1 : -1
  const existing = items.find(item => item.categoryName === categoryName && item.direction === direction)
  if (existing) {
    existing.amount += sign * amount.toNumber()
  } else {
    items.push({
      categoryName,
      categoryId: meta.categoryId,
      parentId: meta.parentId,
      level: meta.level,
      amount: sign * amount.toNumber(),
      type: meta.type,
      direction,
      icon: meta.icon ?? null,
      color: meta.color ?? null,
    })
  }
}

function addTransaction(
  activity: CashFlowActivityDecimal,
  categoryName: string,
  categoryId: string | null,
  parentId: string | null,
  level: number,
  amount: Decimal,
  type: string,
  direction: 'inflow' | 'outflow',
  icon?: string | null,
  color?: string | null,
) {
  if (direction === 'inflow') {
    activity.inflow = activity.inflow.plus(amount)
  } else {
    // 符号约定：outflow 累加为负，使 net = inflow + outflow 直接成立
    activity.outflow = activity.outflow.minus(amount)
  }
  // 查找是否已存在相同类别名称的 item，如果存在则累加金额
  upsertActivityItem(activity.items, amount, categoryName, direction, {
    categoryId,
    parentId,
    level,
    type,
    icon,
    color,
  })
}

function addTransferFlow(
  activity: CashFlowActivityDecimal,
  fromName: string,
  toName: string,
  categoryId: string | null,
  parentId: string | null,
  level: number,
  amount: Decimal,
  fee: Decimal,
  coupon: Decimal,
  isOutflow: boolean,
  icon?: string | null,
  color?: string | null,
) {
  if (isOutflow) {
    const actualOutflow = calculateCashFlowAmount('transfer', amount, fee, coupon).abs()
    // 符号约定：outflow 累加为负
    activity.outflow = activity.outflow.minus(actualOutflow)
    const categoryName = fromName || '转账转出'
    upsertActivityItem(activity.items, actualOutflow, categoryName, 'outflow', {
      categoryId,
      parentId,
      level,
      type: 'transfer_out',
      icon,
      color,
    })
  } else {
    const actualInflow = calculateCashTransferInAmount(amount, fee, coupon)
    activity.inflow = activity.inflow.plus(actualInflow)
    const categoryName = toName || '转账转入'
    upsertActivityItem(activity.items, actualInflow, categoryName, 'inflow', {
      categoryId,
      parentId,
      level,
      type: 'transfer_in',
      icon,
      color,
    })
  }
}

/**
 * 将 ProcessedTx 列表聚合到 4 类活动桶 + 按账户现金流。
 * 同一函数对 actual 和 predicted 通用：通过传入的 buckets 区分目标。
 */
export function aggregate(items: ProcessedTx[]): AggregatedFlows {
  const operating: CashFlowActivityDecimal = { inflow: ZERO, outflow: ZERO, items: [] }
  const investing: CashFlowActivityDecimal = { inflow: ZERO, outflow: ZERO, items: [] }
  const financing: CashFlowActivityDecimal = { inflow: ZERO, outflow: ZERO, items: [] }
  const uncategorized: CashFlowActivityDecimal = { inflow: ZERO, outflow: ZERO, items: [] }
  const flowByAccount: Record<string, { inflow: Decimal; outflow: Decimal }> = {}

  const getTargetByType = (cashFlowType: string | null): CashFlowActivityDecimal =>
    cashFlowType === 'investing' ? investing :
    cashFlowType === 'financing' ? financing :
    cashFlowType === 'operating' ? operating : uncategorized

  const getOrCreateAccountFlow = (name: string) => {
    if (!flowByAccount[name]) flowByAccount[name] = { inflow: ZERO, outflow: ZERO }
    return flowByAccount[name]
  }

  for (const it of items) {
    const target = getTargetByType(it.cashFlowType)

    if (it.type === 'income' && it.isFromCash) {
      addTransaction(
        target, it.categoryName, it.categoryId, it.parentId, it.level,
        it.amount, 'income', 'inflow', it.icon, it.color,
      )
      const accountFlow = getOrCreateAccountFlow(it.accountName)
      accountFlow.inflow = accountFlow.inflow.plus(it.amount)
    } else if (it.type === 'expense' && it.isFromCash) {
      addTransaction(
        target, it.categoryName, it.categoryId, it.parentId, it.level,
        it.amount, 'expense', 'outflow', it.icon, it.color,
      )
      const accountFlow = getOrCreateAccountFlow(it.accountName)
      // 符号约定：outflow 累加为负
      accountFlow.outflow = accountFlow.outflow.minus(it.amount)
    } else if (it.type === 'transfer') {
      if (it.isFromCash && !it.isToCash) {
        // 转出：原行为区分 actual('未分类') / predicted('转账转出') 默认值
        const fromName = it.categoryName || (it.isPredicted ? '转账转出' : '未分类')
        addTransferFlow(
          target, fromName, '', it.categoryId, it.parentId, it.level,
          it.amount, it.fee, it.coupon, true, it.icon, it.color,
        )
        const accountFlow = getOrCreateAccountFlow(it.accountName)
        const actualOutflow = calculateCashFlowAmount('transfer', it.amount, it.fee, it.coupon).abs()
        // 符号约定：outflow 累加为负
        accountFlow.outflow = accountFlow.outflow.minus(actualOutflow)
      } else if (!it.isFromCash && it.isToCash && it.toAccountName) {
        // 转入：原行为区分 actual('未分类') / predicted('转账转入') 默认值
        const toName = it.categoryName || (it.isPredicted ? '转账转入' : '未分类')
        addTransferFlow(
          target, '', toName, it.categoryId, it.parentId, it.level,
          it.amount, it.fee, it.coupon, false, it.icon, it.color,
        )
        const accountFlow = getOrCreateAccountFlow(it.toAccountName)
        const actualInflow = calculateCashTransferInAmount(it.amount, it.fee, it.coupon)
        accountFlow.inflow = accountFlow.inflow.plus(actualInflow)
      }
    } else if (it.type === 'refund' && it.isFromCash) {
      const actualInflow = calculateCashFlowAmount('refund', it.amount, it.fee, ZERO)
      addTransaction(
        target, it.categoryName, it.categoryId, it.parentId, it.level,
        actualInflow, 'refund', 'inflow', it.icon, it.color,
      )
      const accountFlow = getOrCreateAccountFlow(it.accountName)
      accountFlow.inflow = accountFlow.inflow.plus(actualInflow)
    }
  }

  return { operating, investing, financing, uncategorized, flowByAccount }
}
