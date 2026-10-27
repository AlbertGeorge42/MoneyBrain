import { minor, rulesFor, type Minor } from '../../../../../packages/domain/src/index.js'
import { AggregatedFlows, CashFlowActivityMinor, ProcessedTx } from './cash-flow-types.js'

// 查找或新增 activity item：相同 categoryName + direction 累加金额，否则新增
function upsertActivityItem(
  items: CashFlowActivityMinor['items'],
  amount: Minor,
  categoryName: string,
  direction: 'inflow' | 'outflow',
  meta: { categoryId: string | null; parentId: string | null; level: number; type: string; icon?: string | null; color?: string | null }
): void {
  const sign = direction === 'inflow' ? 1 : -1
  const existing = items.find(item => item.categoryName === categoryName && item.direction === direction)
  if (existing) {
    existing.amount = minor(existing.amount + sign * amount)
  } else {
    items.push({
      categoryName,
      categoryId: meta.categoryId,
      parentId: meta.parentId,
      level: meta.level,
      amount: minor(sign * amount),
      type: meta.type,
      direction,
      icon: meta.icon ?? null,
      color: meta.color ?? null,
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
  icon?: string | null,
  color?: string | null,
) {
  if (direction === 'inflow') {
    activity.inflow = minor(activity.inflow + amount)
  } else {
    // 符号约定：outflow 累加为负，使 net = inflow + outflow 直接成立
    activity.outflow = minor(activity.outflow - amount)
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
  icon?: string | null,
  color?: string | null,
) {
  if (isOutflow) {
    const actualOutflow = minor(Math.abs(rulesFor(ruleVersion).transferOutflow(amount, fee, coupon)))
    // 符号约定：outflow 累加为负
    activity.outflow = minor(activity.outflow - actualOutflow)
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
    // 转入账户收到的是本金，手续费不会贷记到转入账户
    const actualInflow = amount
    activity.inflow = minor(activity.inflow + actualInflow)
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
  const operating: CashFlowActivityMinor = { inflow: minor(0), outflow: minor(0), items: [] }
  const investing: CashFlowActivityMinor = { inflow: minor(0), outflow: minor(0), items: [] }
  const financing: CashFlowActivityMinor = { inflow: minor(0), outflow: minor(0), items: [] }
  const uncategorized: CashFlowActivityMinor = { inflow: minor(0), outflow: minor(0), items: [] }
  const flowByAccount: Record<string, { inflow: Minor; outflow: Minor }> = {}

  const getTargetByType = (cashFlowType: string | null): CashFlowActivityMinor =>
    cashFlowType === 'investing' ? investing :
    cashFlowType === 'financing' ? financing :
    cashFlowType === 'operating' ? operating : uncategorized

  const getOrCreateAccountFlow = (name: string) => {
    if (!flowByAccount[name]) flowByAccount[name] = { inflow: minor(0), outflow: minor(0) }
    return flowByAccount[name]
  }

  for (const it of items) {
    const target = getTargetByType(it.cashFlowType)
    const rules = rulesFor(it.ruleVersion)

    if (it.type === 'income' && it.isFromCash) {
      addTransaction(
        target, it.categoryName, it.categoryId, it.parentId, it.level,
        it.amount, 'income', 'inflow', it.icon, it.color,
      )
      const accountFlow = getOrCreateAccountFlow(it.accountName)
      accountFlow.inflow = minor(accountFlow.inflow + it.amount)
    } else if (it.type === 'expense' && it.isFromCash) {
      addTransaction(
        target, it.categoryName, it.categoryId, it.parentId, it.level,
        it.amount, 'expense', 'outflow', it.icon, it.color,
      )
      const accountFlow = getOrCreateAccountFlow(it.accountName)
      // 符号约定：outflow 累加为负
      accountFlow.outflow = minor(accountFlow.outflow - it.amount)
    } else if (it.type === 'transfer') {
      if (it.isFromCash && !it.isToCash) {
        // 转出：原行为区分 actual('未分类') / predicted('转账转出') 默认值
        const fromName = it.categoryName || (it.isPredicted ? '转账转出' : '未分类')
        addTransferFlow(
          target, fromName, '', it.categoryId, it.parentId, it.level,
          it.amount, it.fee, it.coupon, true, it.ruleVersion, it.icon, it.color,
        )
        const accountFlow = getOrCreateAccountFlow(it.accountName)
        const actualOutflow = minor(Math.abs(rules.transferOutflow(it.amount, it.fee, it.coupon)))
        // 符号约定：outflow 累加为负
        accountFlow.outflow = minor(accountFlow.outflow - actualOutflow)
      } else if (!it.isFromCash && it.isToCash && it.toAccountName) {
        // 转入：原行为区分 actual('未分类') / predicted('转账转入') 默认值
        const toName = it.categoryName || (it.isPredicted ? '转账转入' : '未分类')
        addTransferFlow(
          target, '', toName, it.categoryId, it.parentId, it.level,
          it.amount, it.fee, it.coupon, false, it.ruleVersion, it.icon, it.color,
        )
        const accountFlow = getOrCreateAccountFlow(it.toAccountName)
        const actualInflow = it.amount
        accountFlow.inflow = minor(accountFlow.inflow + actualInflow)
      }
    } else if (it.type === 'refund' && it.isFromCash) {
      // 退款方向由原交易类型决定（领域层规则）：
      // 收入退款 = 钱流出账户 → 现金流为流出；支出退款 = 钱流回账户 → 流入。
      const offset = rules.refundOffsetKind(it.relatedType)
      if (offset === null) continue

      const direction = offset === 'income' ? 'outflow' : 'inflow'
      addTransaction(
        target, it.categoryName, it.categoryId, it.parentId, it.level,
        it.amount, 'refund', direction, it.icon, it.color,
      )
      const accountFlow = getOrCreateAccountFlow(it.accountName)
      if (direction === 'inflow') {
        accountFlow.inflow = minor(accountFlow.inflow + it.amount)
      } else {
        // 符号约定：outflow 累加为负
        accountFlow.outflow = minor(accountFlow.outflow - it.amount)
      }
    }
  }

  return { operating, investing, financing, uncategorized, flowByAccount }
}
