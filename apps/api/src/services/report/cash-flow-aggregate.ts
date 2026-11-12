import { abs, add, neg, sub, ZERO_MINOR, rulesFor, type Minor } from '../../../../../packages/domain/src/index.js'
import { AggregatedFlows, CashFlowActivityMinor, ProcessedTx } from './cash-flow-types.js'

// 查找或新增 activity item：相同 categoryName + direction 累加金额，否则新增
function upsertActivityItem(
  items: CashFlowActivityMinor['items'],
  amount: Minor,
  categoryName: string,
  direction: 'inflow' | 'outflow',
  meta: { categoryId: string | null; parentId: string | null; level: number; type: string }
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
  // 查找是否已存在相同类别名称的 item，如果存在则累加金额
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
  ruleVersion: number,
) {
  if (isOutflow) {
    const actualOutflow = abs(rulesFor(ruleVersion).transferOutflow(amount, fee, coupon))
    // 符号约定：outflow 累加为负
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
    const actualInflow = rulesFor(ruleVersion).transferInflow(amount)
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
 * 同一函数对 actual 和 predicted 通用：通过传入的 buckets 区分目标。
 */
export function aggregate(items: ProcessedTx[]): AggregatedFlows {
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
    const rules = rulesFor(it.ruleVersion)

    if (it.type === 'income' && it.isFromCash) {
      addTransaction(
        target, it.categoryName, it.categoryId, it.parentId, it.level,
        it.amount, 'income', 'inflow',
      )
      const accountFlow = getOrCreateAccountFlow(it.accountName)
      accountFlow.inflow = add(accountFlow.inflow, it.amount)
    } else if (it.type === 'expense' && it.isFromCash) {
      addTransaction(
        target, it.categoryName, it.categoryId, it.parentId, it.level,
        it.amount, 'expense', 'outflow',
      )
      const accountFlow = getOrCreateAccountFlow(it.accountName)
      // 符号约定：outflow 累加为负
      accountFlow.outflow = sub(accountFlow.outflow, it.amount)
    } else if (it.type === 'transfer') {
      if (it.isFromCash && !it.isToCash) {
        // 转出：原行为区分 actual('未分类') / predicted('转账转出') 默认值
        const fromName = it.categoryName || (it.isPredicted ? '转账转出' : '未分类')
        addTransferFlow(
          target, fromName, '', it.categoryId, it.parentId, it.level,
          it.amount, it.fee, it.coupon, true, it.ruleVersion,
        )
        const accountFlow = getOrCreateAccountFlow(it.accountName)
        const actualOutflow = abs(rules.transferOutflow(it.amount, it.fee, it.coupon))
        // 符号约定：outflow 累加为负
        accountFlow.outflow = sub(accountFlow.outflow, actualOutflow)
      } else if (!it.isFromCash && it.isToCash && it.toAccountName) {
        // 转入：原行为区分 actual('未分类') / predicted('转账转入') 默认值
        const toName = it.categoryName || (it.isPredicted ? '转账转入' : '未分类')
        addTransferFlow(
          target, '', toName, it.categoryId, it.parentId, it.level,
          it.amount, it.fee, it.coupon, false, it.ruleVersion,
        )
        const accountFlow = getOrCreateAccountFlow(it.toAccountName)
        // 转账转入的现金只经领域层规则取值（与转出侧 transferOutflow 对称，A0）
        const actualInflow = rules.transferInflow(it.amount)
        accountFlow.inflow = add(accountFlow.inflow, actualInflow)
      }
    } else if (it.type === 'adjustment' && it.isFromCash) {
      // 平账只改变账户余额，不是一笔资金流入/流出：单列累计，不进任何活动桶。
      reconciliation = add(reconciliation, it.amount)
    } else if (it.type === 'refund' && it.isFromCash) {
      // 退款方向由原交易类型决定（领域层规则）：
      // 收入退款 = 钱流出账户 → 现金流为流出；支出退款 = 钱流回账户 → 流入。
      const offset = rules.refundOffsetKind(it.relatedType)
      if (offset === null) continue

      const direction = offset === 'income' ? 'outflow' : 'inflow'
      addTransaction(
        target, it.categoryName, it.categoryId, it.parentId, it.level,
        it.amount, 'refund', direction,
      )
      const accountFlow = getOrCreateAccountFlow(it.accountName)
      if (direction === 'inflow') {
        accountFlow.inflow = add(accountFlow.inflow, it.amount)
      } else {
        // 符号约定：outflow 累加为负
        accountFlow.outflow = sub(accountFlow.outflow, it.amount)
      }
    }
  }

  return { operating, investing, financing, uncategorized, reconciliation, flowByAccount }
}
