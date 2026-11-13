import { refundOffsetKind, transferInflow, transferNet, transferOutflow } from '../../ledger/rules.js'
import { ZERO_MINOR, abs, add, neg, sub, type Minor } from '../../money.js'
import type { AggregatedFlows, CashFlowActivityMinor, ProcessedTx } from './types.js'

// 查找或新增 activity item：相同 categoryName + direction 累加金额，否则新增
function upsertActivityItem(
  items: CashFlowActivityMinor['items'],
  amount: Minor,
  categoryName: string,
  direction: 'inflow' | 'outflow',
  meta: { categoryId: string | null; parentId: string | null; level: number; type: string },
): void {
  const sign = direction === 'inflow' ? 1 : -1
  const existing = items.find(item => item.categoryName === categoryName && item.direction === direction)
  if (existing) {
    existing.amount = sign > 0 ? add(existing.amount, amount) : sub(existing.amount, amount)
  } else {
    items.push({
      categoryName,
      categoryId: meta.categoryId,
      parentId: meta.parentId,
      level: meta.level,
      amount: sign > 0 ? amount : neg(amount),
      type: meta.type,
      direction,
    })
  }
}

function addTransaction(
  activity: CashFlowActivityMinor,
  categoryName: string,
  categoryId: string | null,
  parentId: string | null,
  level: number,
  amount: Minor,
  type: string,
  direction: 'inflow' | 'outflow',
) {
  if (direction === 'inflow') {
    activity.inflow = add(activity.inflow, amount)
  } else {
    // 符号约定：outflow 累加为负，使 net = inflow + outflow 直接成立
    activity.outflow = sub(activity.outflow, amount)
  }
  upsertActivityItem(activity.items, amount, categoryName, direction, {
    categoryId,
    parentId,
    level,
    type,
  })
}

function addTransferFlow(
  activity: CashFlowActivityMinor,
  fromName: string,
  toName: string,
  categoryId: string | null,
  parentId: string | null,
  level: number,
  amount: Minor,
  fee: Minor,
  coupon: Minor,
  isOutflow: boolean,
) {
  if (isOutflow) {
    const actualOutflow = abs(transferOutflow(amount, fee))
    activity.outflow = sub(activity.outflow, actualOutflow)
    const categoryName = fromName || '转账转出'
    upsertActivityItem(activity.items, actualOutflow, categoryName, 'outflow', {
      categoryId,
      parentId,
      level,
      type: 'transfer_out',
    })
  } else {
    // 转账转入的现金只经领域层规则取值（与转出侧 transferOutflow 对称，A0）
    const actualInflow = transferInflow(amount, coupon)
    activity.inflow = add(activity.inflow, actualInflow)
    const categoryName = toName || '转账转入'
    upsertActivityItem(activity.items, actualInflow, categoryName, 'inflow', {
      categoryId,
      parentId,
      level,
      type: 'transfer_in',
    })
  }
}

/**
 * 将 ProcessedTx 列表聚合到 4 类活动桶 + 按账户现金流。
 * actual 与 predicted 走同一套口径，通过 isPredicted 只影响转账默认名称。
 */
export function aggregate(items: readonly ProcessedTx[]): AggregatedFlows {
  const operating: CashFlowActivityMinor = { inflow: ZERO_MINOR, outflow: ZERO_MINOR, items: [] }
  const investing: CashFlowActivityMinor = { inflow: ZERO_MINOR, outflow: ZERO_MINOR, items: [] }
  const financing: CashFlowActivityMinor = { inflow: ZERO_MINOR, outflow: ZERO_MINOR, items: [] }
  const uncategorized: CashFlowActivityMinor = { inflow: ZERO_MINOR, outflow: ZERO_MINOR, items: [] }
  const flowByAccount: Record<string, { inflow: Minor; outflow: Minor }> = {}
  let reconciliation = ZERO_MINOR

  const getTargetByType = (cashFlowType: string | null): CashFlowActivityMinor =>
    cashFlowType === 'investing' ? investing :
    cashFlowType === 'financing' ? financing :
    cashFlowType === 'operating' ? operating : uncategorized

  const getOrCreateAccountFlow = (name: string) => {
    if (!flowByAccount[name]) flowByAccount[name] = { inflow: ZERO_MINOR, outflow: ZERO_MINOR }
    return flowByAccount[name]
  }

  for (const it of items) {
    const target = getTargetByType(it.cashFlowType)

    if (it.type === 'income' && it.isFromCash) {
      addTransaction(target, it.categoryName, it.categoryId, it.parentId, it.level, it.amount, 'income', 'inflow')
      const accountFlow = getOrCreateAccountFlow(it.accountName)
      accountFlow.inflow = add(accountFlow.inflow, it.amount)
    } else if (it.type === 'expense' && it.isFromCash) {
      addTransaction(target, it.categoryName, it.categoryId, it.parentId, it.level, it.amount, 'expense', 'outflow')
      const accountFlow = getOrCreateAccountFlow(it.accountName)
      accountFlow.outflow = sub(accountFlow.outflow, it.amount)
    } else if (it.type === 'transfer') {
      if (it.isFromCash && !it.isToCash) {
        // 转出：区分 actual('未分类') / predicted('转账转出') 默认值
        const fromName = it.categoryName || (it.isPredicted ? '转账转出' : '未分类')
        addTransferFlow(target, fromName, '', it.categoryId, it.parentId, it.level, it.amount, it.fee, it.coupon, true)
        const accountFlow = getOrCreateAccountFlow(it.accountName)
        const actualOutflow = abs(transferOutflow(it.amount, it.fee))
        accountFlow.outflow = sub(accountFlow.outflow, actualOutflow)
      } else if (!it.isFromCash && it.isToCash && it.toAccountName) {
        // 转入：区分 actual('未分类') / predicted('转账转入') 默认值
        const toName = it.categoryName || (it.isPredicted ? '转账转入' : '未分类')
        addTransferFlow(target, '', toName, it.categoryId, it.parentId, it.level, it.amount, it.fee, it.coupon, false)
        const accountFlow = getOrCreateAccountFlow(it.toAccountName)
        const actualInflow = transferInflow(it.amount, it.coupon)
        accountFlow.inflow = add(accountFlow.inflow, actualInflow)
      } else if (it.isFromCash && it.isToCash) {
        // 本金在现金集合内相消；手续费与券的净额 c−f 才是真实现金变动，必须记入，
        // 否则 netCashFlow + reconciliation !== cashChange（见 requirements.md §3.1）。
        // 桑基的「手续费 / 优惠券」节点与 cashFlowOf 走同一口径。
        const net = transferNet(it.fee, it.coupon)
        if (net < 0) {
          const feeAmount = abs(net)
          addTransaction(target, '手续费', null, null, 0, feeAmount, 'transfer_fee', 'outflow')
          const accountFlow = getOrCreateAccountFlow(it.accountName)
          accountFlow.outflow = sub(accountFlow.outflow, feeAmount)
        } else if (net > 0) {
          addTransaction(target, '优惠券', null, null, 0, net, 'transfer_coupon', 'inflow')
          const accountFlow = getOrCreateAccountFlow(it.toAccountName ?? it.accountName)
          accountFlow.inflow = add(accountFlow.inflow, net)
        }
      }
    } else if (it.type === 'adjustment' && it.isFromCash) {
      reconciliation = add(reconciliation, it.amount)
    } else if (it.type === 'refund' && it.isFromCash) {
      const offset = refundOffsetKind(it.relatedType)
      if (offset === null) continue

      const direction = offset === 'income' ? 'outflow' : 'inflow'
      addTransaction(target, it.categoryName, it.categoryId, it.parentId, it.level, it.amount, 'refund', direction)
      const accountFlow = getOrCreateAccountFlow(it.accountName)
      if (direction === 'inflow') accountFlow.inflow = add(accountFlow.inflow, it.amount)
      else accountFlow.outflow = sub(accountFlow.outflow, it.amount)
    }
  }

  return { operating, investing, financing, uncategorized, reconciliation, flowByAccount }
}
