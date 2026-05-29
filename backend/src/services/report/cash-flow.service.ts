import { prisma } from '../../index.js'
import { calculateBalanceAtDate } from '../balance.service.js'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library.js'
import { toDecimal, ZERO } from '../../common/index.js'
import { generatePredictions } from '../budget.service.js'

type TransactionWithIncludes = Prisma.TransactionGetPayload<{
  include: { account: true; toAccount: true; category: true }
}>

interface CashFlowActivityDecimal {
  inflow: Decimal
  outflow: Decimal
  items: Array<{
    categoryName: string
    amount: number
    type: string
    direction: string
  }>
}

interface ReportValue {
  actual: number
  predicted: number
}

export interface CashFlowActivity {
  inflow: ReportValue
  outflow: ReportValue
  net: ReportValue
  items: Array<{
    categoryName: string
    amount: number
    type: string
    direction: string
  }>
}

export interface CashFlowResult {
  startDate: string
  endDate: string
  cashInflow: ReportValue
  cashOutflow: ReportValue
  netCashFlow: ReportValue
  flowByAccount: Record<string, { inflow: ReportValue; outflow: ReportValue }>
  cashAccounts: string[]
  startCash: number
  endCash: number
  cashChange: ReportValue
  byActivity: {
    operating: CashFlowActivity
    investing: CashFlowActivity
    financing: CashFlowActivity
    uncategorized: CashFlowActivity
  }
  sankey: {
    nodes: Array<{ name: string; category: string }>
    links: Array<{ source: string; target: string; value: number }>
  }
  predictionNote?: string
}

function calculateBalanceChangeDecimal(type: string, amount: Decimal, fee: Decimal, coupon: Decimal): Decimal {
  if (type === 'expense' || type === 'transfer') {
    return amount.plus(fee).minus(coupon)
  }
  if (type === 'refund') {
    return amount.minus(fee).plus(coupon)
  }
  return amount
}

function calculateTransferInAmountDecimal(amount: Decimal, fee: Decimal, coupon: Decimal): Decimal {
  return amount.minus(fee).plus(coupon)
}

function addTransaction(
  activity: CashFlowActivityDecimal,
  categoryName: string,
  amount: Decimal,
  type: string,
  direction: 'inflow' | 'outflow'
) {
  if (direction === 'inflow') {
    activity.inflow = activity.inflow.plus(amount)
  } else {
    activity.outflow = activity.outflow.plus(amount)
  }
  activity.items.push({
    categoryName,
    amount: amount.toNumber(),
    type,
    direction,
  })
}

function addTransferFlow(
  activity: CashFlowActivityDecimal,
  fromName: string,
  toName: string,
  amount: Decimal,
  fee: Decimal,
  coupon: Decimal,
  isOutflow: boolean
) {
  if (isOutflow) {
    const actualOutflow = calculateBalanceChangeDecimal('transfer', amount, fee, coupon).abs()
    activity.outflow = activity.outflow.plus(actualOutflow)
    activity.items.push({
      categoryName: fromName,
      amount: actualOutflow.toNumber(),
      type: 'transfer_out',
      direction: 'outflow',
    })
  } else {
    const actualInflow = calculateTransferInAmountDecimal(amount, fee, coupon)
    activity.inflow = activity.inflow.plus(actualInflow)
    activity.items.push({
      categoryName: toName,
      amount: actualInflow.toNumber(),
      type: 'transfer_in',
      direction: 'inflow',
    })
  }
}

function addToMap(map: Map<string, Decimal>, key: string, value: Decimal) {
  map.set(key, (map.get(key) || ZERO).plus(value))
}

function toActivityResult(actual: CashFlowActivityDecimal, predicted: CashFlowActivityDecimal): CashFlowActivity {
  return {
    inflow: { actual: actual.inflow.toNumber(), predicted: predicted.inflow.toNumber() },
    outflow: { actual: actual.outflow.toNumber(), predicted: predicted.outflow.toNumber() },
    net: { actual: actual.inflow.minus(actual.outflow).toNumber(), predicted: predicted.inflow.minus(predicted.outflow).toNumber() },
    items: actual.items,
  }
}

export async function generateCashFlow(startDate: string, endDate: string, includePredictions?: boolean): Promise<CashFlowResult> {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T23:59:59.999`)
  const now = new Date()

  const cashCategories = await prisma.accountCategory.findMany({
    where: { isCashEquivalent: true },
    select: { id: true },
  })
  const cashCategoryIds = cashCategories.map(c => c.id)

  const cashAccounts = await prisma.account.findMany({
    where: { categoryId: { in: cashCategoryIds } },
    select: { id: true, name: true },
  })
  const cashAccountIds = cashAccounts.map(a => a.id)

  const transactions = await prisma.transaction.findMany({
    where: {
      date: { gte: start, lte: end },
      isAdjustment: false,
      OR: [
        { accountId: { in: cashAccountIds } },
        { toAccountId: { in: cashAccountIds } },
      ],
    },
    include: { account: true, toAccount: true, category: true },
  })

  const actualOperating: CashFlowActivityDecimal = { inflow: ZERO, outflow: ZERO, items: [] }
  const actualInvesting: CashFlowActivityDecimal = { inflow: ZERO, outflow: ZERO, items: [] }
  const actualFinancing: CashFlowActivityDecimal = { inflow: ZERO, outflow: ZERO, items: [] }
  const actualUncategorized: CashFlowActivityDecimal = { inflow: ZERO, outflow: ZERO, items: [] }

  const predictedOperating: CashFlowActivityDecimal = { inflow: ZERO, outflow: ZERO, items: [] }
  const predictedInvesting: CashFlowActivityDecimal = { inflow: ZERO, outflow: ZERO, items: [] }
  const predictedFinancing: CashFlowActivityDecimal = { inflow: ZERO, outflow: ZERO, items: [] }
  const predictedUncategorized: CashFlowActivityDecimal = { inflow: ZERO, outflow: ZERO, items: [] }

  const flowByAccountActual: Record<string, { inflow: Decimal; outflow: Decimal }> = {}
  const flowByAccountPredicted: Record<string, { inflow: Decimal; outflow: Decimal }> = {}

  const getActualTargetByType = (cashFlowType: string | null): CashFlowActivityDecimal => {
    return cashFlowType === 'investing' ? actualInvesting :
           cashFlowType === 'financing' ? actualFinancing :
           cashFlowType === 'operating' ? actualOperating : actualUncategorized
  }

  const getPredictedTargetByType = (cashFlowType: string | null): CashFlowActivityDecimal => {
    return cashFlowType === 'investing' ? predictedInvesting :
           cashFlowType === 'financing' ? predictedFinancing :
           cashFlowType === 'operating' ? predictedOperating : predictedUncategorized
  }

  const getOrCreateAccountFlow = (
    flowMap: Record<string, { inflow: Decimal; outflow: Decimal }>,
    name: string
  ) => {
    if (!flowMap[name]) flowMap[name] = { inflow: ZERO, outflow: ZERO }
    return flowMap[name]
  }

  transactions.forEach(t => {
    const isFromCash = cashAccountIds.includes(t.accountId)
    const isToCash = t.toAccountId && cashAccountIds.includes(t.toAccountId)
    const amount = t.amount
    const fee = toDecimal(t.fee)
    const coupon = toDecimal(t.coupon)
    const cashFlowType = t.category?.cashFlowType || null
    const target = getActualTargetByType(cashFlowType)

    if (t.type === 'income' && isFromCash) {
      addTransaction(target, t.category?.name || '未分类', amount, 'income', 'inflow')
      const accountFlow = getOrCreateAccountFlow(flowByAccountActual, t.account?.name || '未知账户')
      accountFlow.inflow = accountFlow.inflow.plus(amount)
    } else if (t.type === 'expense' && isFromCash) {
      addTransaction(target, t.category?.name || '未分类', amount, 'expense', 'outflow')
      const accountFlow = getOrCreateAccountFlow(flowByAccountActual, t.account?.name || '未知账户')
      accountFlow.outflow = accountFlow.outflow.plus(amount)
    } else if (t.type === 'transfer') {
      if (isFromCash && !isToCash) {
        addTransferFlow(target, t.category?.name || '转账转出', '', amount, fee, coupon, true)
        const accountFlow = getOrCreateAccountFlow(flowByAccountActual, t.account?.name || '未知账户')
        const actualOutflow = calculateBalanceChangeDecimal('transfer', amount, fee, coupon).abs()
        accountFlow.outflow = accountFlow.outflow.plus(actualOutflow)
      } else if (!isFromCash && isToCash && t.toAccount) {
        addTransferFlow(target, '', t.category?.name || '转账转入', amount, fee, coupon, false)
        const accountFlow = getOrCreateAccountFlow(flowByAccountActual, t.toAccount.name)
        const actualInflow = calculateTransferInAmountDecimal(amount, fee, coupon)
        accountFlow.inflow = accountFlow.inflow.plus(actualInflow)
      }
    } else if (t.type === 'refund' && isFromCash) {
      const actualInflow = calculateBalanceChangeDecimal('refund', amount, fee, ZERO)
      addTransaction(target, t.category?.name || '退款', actualInflow, 'refund', 'inflow')
      const accountFlow = getOrCreateAccountFlow(flowByAccountActual, t.account?.name || '未知账户')
      accountFlow.inflow = accountFlow.inflow.plus(actualInflow)
    }
  })

  let predictionNote: string | undefined

  if (includePredictions && end > now) {
    const predictions = await generatePredictions(
      start > now ? startDate : now.toISOString().split('T')[0],
      endDate
    )

    const allCategories = await prisma.transactionCategory.findMany()
    const categoryMap = new Map(allCategories.map(c => [c.id, { cashFlowType: c.cashFlowType, name: c.name }]))
    const allAccounts = await prisma.account.findMany()
    const accountMap = new Map(allAccounts.map(a => [a.id, { name: a.name }]))

    predictions.forEach(p => {
      const isFromCash = cashAccountIds.includes(p.accountId)
      const isToCash = p.toAccountId && cashAccountIds.includes(p.toAccountId)

      if (!isFromCash && !isToCash) return

      const amount = toDecimal(p.amount)
      const fee = ZERO
      const coupon = ZERO
      const category = p.categoryId ? categoryMap.get(p.categoryId) : null
      const cashFlowType = category?.cashFlowType || null
      const target = getPredictedTargetByType(cashFlowType)
      const account = accountMap.get(p.accountId)

      if (p.type === 'income' && isFromCash) {
        addTransaction(target, category?.name || '未分类', amount, 'income', 'inflow')
        const accountFlow = getOrCreateAccountFlow(flowByAccountPredicted, account?.name || '未知账户')
        accountFlow.inflow = accountFlow.inflow.plus(amount)
      } else if (p.type === 'expense' && isFromCash) {
        addTransaction(target, category?.name || '未分类', amount, 'expense', 'outflow')
        const accountFlow = getOrCreateAccountFlow(flowByAccountPredicted, account?.name || '未知账户')
        accountFlow.outflow = accountFlow.outflow.plus(amount)
      } else if (p.type === 'transfer') {
        const toAccount = p.toAccountId ? accountMap.get(p.toAccountId) : null
        if (isFromCash && !isToCash) {
          addTransferFlow(target, category?.name || '转账转出', '', amount, fee, coupon, true)
          const accountFlow = getOrCreateAccountFlow(flowByAccountPredicted, account?.name || '未知账户')
          accountFlow.outflow = accountFlow.outflow.plus(amount.abs())
        } else if (!isFromCash && isToCash && toAccount) {
          addTransferFlow(target, '', category?.name || '转账转入', amount, fee, coupon, false)
          const accountFlow = getOrCreateAccountFlow(flowByAccountPredicted, toAccount.name)
          accountFlow.inflow = accountFlow.inflow.plus(amount)
        }
      }
    })

    if (predictions.length > 0) {
      predictionNote = '含预算预测数据'
    }
  }

  const actualCashInflow = actualOperating.inflow.plus(actualInvesting.inflow).plus(actualFinancing.inflow).plus(actualUncategorized.inflow)
  const actualCashOutflow = actualOperating.outflow.plus(actualInvesting.outflow).plus(actualFinancing.outflow).plus(actualUncategorized.outflow)
  const actualNetCashFlow = actualCashInflow.minus(actualCashOutflow)

  const predictedCashInflow = predictedOperating.inflow.plus(predictedInvesting.inflow).plus(predictedFinancing.inflow).plus(predictedUncategorized.inflow)
  const predictedCashOutflow = predictedOperating.outflow.plus(predictedInvesting.outflow).plus(predictedFinancing.outflow).plus(predictedUncategorized.outflow)
  const predictedNetCashFlow = predictedCashInflow.minus(predictedCashOutflow)

  const flowByAccount: Record<string, { inflow: ReportValue; outflow: ReportValue }> = {}
  for (const [name, flow] of Object.entries(flowByAccountActual)) {
    const predicted = flowByAccountPredicted[name] || { inflow: ZERO, outflow: ZERO }
    flowByAccount[name] = {
      inflow: { actual: flow.inflow.toNumber(), predicted: predicted.inflow.toNumber() },
      outflow: { actual: flow.outflow.toNumber(), predicted: predicted.outflow.toNumber() },
    }
  }
  for (const [name, flow] of Object.entries(flowByAccountPredicted)) {
    if (!flowByAccount[name]) {
      flowByAccount[name] = {
        inflow: { actual: 0, predicted: flow.inflow.toNumber() },
        outflow: { actual: 0, predicted: flow.outflow.toNumber() },
      }
    }
  }

  const nextDayOfEnd = new Date(endDate)
  nextDayOfEnd.setDate(nextDayOfEnd.getDate() + 1)

  const startCashBalances = await Promise.all(
    cashAccountIds.map(id => calculateBalanceAtDate(id, start))
  )
  const endCashBalances = await Promise.all(
    cashAccountIds.map(id => calculateBalanceAtDate(id, nextDayOfEnd))
  )

  const startCash = startCashBalances.reduce((sum, b) => sum + b, 0)
  const endCash = endCashBalances.reduce((sum, b) => sum + b, 0)
  const actualCashChange = endCash - startCash

  const sankeyData = buildSankeyData(transactions, cashAccountIds)

  return {
    startDate,
    endDate,
    cashInflow: { actual: actualCashInflow.toNumber(), predicted: predictedCashInflow.toNumber() },
    cashOutflow: { actual: actualCashOutflow.toNumber(), predicted: predictedCashOutflow.toNumber() },
    netCashFlow: { actual: actualNetCashFlow.toNumber(), predicted: predictedNetCashFlow.toNumber() },
    flowByAccount,
    cashAccounts: cashAccounts.map(a => a.name),
    startCash,
    endCash,
    cashChange: { actual: actualCashChange, predicted: predictedNetCashFlow.toNumber() },
    byActivity: {
      operating: toActivityResult(actualOperating, predictedOperating),
      investing: toActivityResult(actualInvesting, predictedInvesting),
      financing: toActivityResult(actualFinancing, predictedFinancing),
      uncategorized: toActivityResult(actualUncategorized, predictedUncategorized),
    },
    sankey: sankeyData,
    predictionNote,
  }
}

function buildSankeyData(
  transactions: TransactionWithIncludes[],
  cashAccountIds: string[],
): { nodes: Array<{ name: string; category: string }>; links: Array<{ source: string; target: string; value: number }> } {
  const incomeCategoryNodes: Map<string, Decimal> = new Map()
  const nonCashSourceNodes: Map<string, Decimal> = new Map()
  const expenseCategoryNodes: Map<string, Decimal> = new Map()
  const nonCashTargetNodes: Map<string, Decimal> = new Map()
  const cashAccountFlows: Map<string, Decimal> = new Map()

  const sourceToCashLinks: Map<string, Map<string, Decimal>> = new Map()
  const cashToTargetLinks: Map<string, Map<string, Decimal>> = new Map()

  const addToMap = (map: Map<string, Decimal>, key: string, value: Decimal) => {
    map.set(key, (map.get(key) || ZERO).plus(value))
  }

  transactions.forEach(t => {
    const isFromCash = cashAccountIds.includes(t.accountId)
    const isToCash = t.toAccountId && cashAccountIds.includes(t.toAccountId)
    const amount = t.amount
    const fee = toDecimal(t.fee)
    const coupon = toDecimal(t.coupon)

    if (t.type === 'income' && isFromCash) {
      const categoryName = t.category?.name || '其他收入'
      const cashAccountName = t.account?.name || '现金账户'

      addToMap(incomeCategoryNodes, categoryName, amount)
      addToMap(cashAccountFlows, cashAccountName, amount)

      if (!sourceToCashLinks.has(categoryName)) sourceToCashLinks.set(categoryName, new Map())
      addToMap(sourceToCashLinks.get(categoryName)!, cashAccountName, amount)
    } else if (t.type === 'expense' && isFromCash) {
      const categoryName = t.category?.name || '其他支出'
      const cashAccountName = t.account?.name || '现金账户'

      addToMap(expenseCategoryNodes, categoryName, amount)
      addToMap(cashAccountFlows, cashAccountName, amount)

      if (!cashToTargetLinks.has(cashAccountName)) cashToTargetLinks.set(cashAccountName, new Map())
      addToMap(cashToTargetLinks.get(cashAccountName)!, categoryName, amount)
    } else if (t.type === 'transfer') {
      if (!isFromCash && isToCash && t.toAccount && t.account) {
        const fromAccountName = t.account.name
        const toCashAccountName = t.toAccount.name
        const actualInflow = calculateTransferInAmountDecimal(amount, fee, coupon)

        addToMap(nonCashSourceNodes, fromAccountName, actualInflow)
        addToMap(cashAccountFlows, toCashAccountName, actualInflow)

        if (!sourceToCashLinks.has(fromAccountName)) sourceToCashLinks.set(fromAccountName, new Map())
        addToMap(sourceToCashLinks.get(fromAccountName)!, toCashAccountName, actualInflow)
      } else if (isFromCash && !isToCash && t.account && t.toAccount) {
        const fromCashAccountName = t.account.name
        const toAccountName = t.toAccount.name
        const actualOutflow = calculateBalanceChangeDecimal('transfer', amount, fee, coupon).abs()

        addToMap(nonCashTargetNodes, toAccountName, actualOutflow)
        addToMap(cashAccountFlows, fromCashAccountName, actualOutflow)

        if (!cashToTargetLinks.has(fromCashAccountName)) cashToTargetLinks.set(fromCashAccountName, new Map())
        addToMap(cashToTargetLinks.get(fromCashAccountName)!, toAccountName, actualOutflow)
      }
    } else if (t.type === 'refund' && isFromCash) {
      const categoryName = t.category?.name || '退款'
      const cashAccountName = t.account?.name || '现金账户'
      const actualInflow = calculateBalanceChangeDecimal('refund', amount, fee, ZERO)

      addToMap(incomeCategoryNodes, categoryName, actualInflow)
      addToMap(cashAccountFlows, cashAccountName, actualInflow)

      if (!sourceToCashLinks.has(categoryName)) sourceToCashLinks.set(categoryName, new Map())
      addToMap(sourceToCashLinks.get(categoryName)!, cashAccountName, actualInflow)
    }
  })

  const sankeyNodes: Array<{ name: string; category: string }> = []
  const sankeyLinks: Array<{ source: string; target: string; value: number }> = []
  const nodeNameMap: Map<string, string> = new Map()

  const sortedEntries = (map: Map<string, Decimal>) =>
    Array.from(map.entries()).sort((a, b) => b[1].minus(a[1]).toNumber())

  for (const [name] of sortedEntries(nonCashSourceNodes)) {
    const uniqueName = `${name}_ncs`
    nodeNameMap.set(`ncs_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'non_cash_source' })
  }
  for (const [name] of sortedEntries(incomeCategoryNodes)) {
    const uniqueName = `${name}_income`
    nodeNameMap.set(`income_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'income_category' })
  }

  for (const [name] of sortedEntries(cashAccountFlows)) {
    const uniqueName = `${name}_cash`
    nodeNameMap.set(`cash_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'cash' })
  }

  for (const [name] of sortedEntries(nonCashTargetNodes)) {
    const uniqueName = `${name}_nct`
    nodeNameMap.set(`nct_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'non_cash_target' })
  }
  for (const [name] of sortedEntries(expenseCategoryNodes)) {
    const uniqueName = `${name}_expense`
    nodeNameMap.set(`expense_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'expense_category' })
  }

  sourceToCashLinks.forEach((cashMap, sourceName) => {
    cashMap.forEach((amount, cashName) => {
      if (amount.greaterThan(ZERO)) {
        const sourceKey = incomeCategoryNodes.has(sourceName) ? `income_${sourceName}` : `ncs_${sourceName}`
        const targetKey = `cash_${cashName}`
        sankeyLinks.push({
          source: nodeNameMap.get(sourceKey) || sourceName,
          target: nodeNameMap.get(targetKey) || cashName,
          value: amount.toNumber(),
        })
      }
    })
  })

  cashToTargetLinks.forEach((targetMap, cashName) => {
    targetMap.forEach((amount, targetName) => {
      if (amount.greaterThan(ZERO)) {
        const sourceKey = `cash_${cashName}`
        const targetKey = expenseCategoryNodes.has(targetName) ? `expense_${targetName}` : `nct_${targetName}`
        sankeyLinks.push({
          source: nodeNameMap.get(sourceKey) || cashName,
          target: nodeNameMap.get(targetKey) || targetName,
          value: amount.toNumber(),
        })
      }
    })
  })

  return { nodes: sankeyNodes, links: sankeyLinks }
}
