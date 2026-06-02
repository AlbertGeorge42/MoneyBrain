import { prisma } from '../../index.js'
import { calculateBalancesBatch } from '../balance.service.js'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library.js'
import { toDecimal, ZERO } from '../../common/index.js'
import { generatePredictions } from '../budget.service.js'

type TransactionWithIncludes = Prisma.TransactionGetPayload<{
  include: { account: true; toAccount: true; category: true }
}>

interface PredictionTransaction {
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
  startCash: ReportValue
  endCash: ReportValue
  cashChange: ReportValue
  byActivity: {
    operating: CashFlowActivity
    investing: CashFlowActivity
    financing: CashFlowActivity
    uncategorized: CashFlowActivity
  }
  sankey: {
    nodes: Array<{ name: string; category: string }>
    links: Array<{ source: string; target: string; value: number; actualValue?: number; predictedValue?: number }>
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
  let predictions: PredictionTransaction[] = []
  let categoryMap: Map<string, { cashFlowType: string | null; name: string }> = new Map()
  let accountMap: Map<string, { name: string }> = new Map()

  if (includePredictions && end > now) {
    predictions = await generatePredictions(
      start > now ? startDate : now.toISOString().split('T')[0],
      endDate
    )

    const allCategories = await prisma.transactionCategory.findMany()
    categoryMap = new Map(allCategories.map(c => [c.id, { cashFlowType: c.cashFlowType, name: c.name }]))
    const allAccounts = await prisma.account.findMany()
    accountMap = new Map(allAccounts.map(a => [a.id, { name: a.name }]))

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

  const balanceCache = await calculateBalancesBatch(cashAccountIds, [start, nextDayOfEnd])

  const actualStartCash = cashAccountIds.reduce((sum, id) => sum + balanceCache.get(id, start), 0)
  const actualEndCash = cashAccountIds.reduce((sum, id) => sum + balanceCache.get(id, nextDayOfEnd), 0)
  const actualCashChange = actualEndCash - actualStartCash

  let predictedStartCash = 0
  let predictedEndCash = 0

  if (includePredictions && end > now) {
    const nowStr = now.toISOString().split('T')[0]
    
    if (start > now) {
      const startPredictions = await generatePredictions(nowStr, startDate)
      for (const p of startPredictions) {
        const isFromCash = cashAccountIds.includes(p.accountId)
        const isToCash = p.toAccountId && cashAccountIds.includes(p.toAccountId)
        if (p.type === 'income' && isFromCash) {
          predictedStartCash += p.amount
        } else if (p.type === 'expense' && isFromCash) {
          predictedStartCash -= p.amount
        } else if (p.type === 'transfer') {
          if (isFromCash) predictedStartCash -= p.amount
          if (isToCash) predictedStartCash += p.amount
        }
      }
    }

    const endPredictions = await generatePredictions(nowStr, endDate)
    for (const p of endPredictions) {
      const isFromCash = cashAccountIds.includes(p.accountId)
      const isToCash = p.toAccountId && cashAccountIds.includes(p.toAccountId)
      if (p.type === 'income' && isFromCash) {
        predictedEndCash += p.amount
      } else if (p.type === 'expense' && isFromCash) {
        predictedEndCash -= p.amount
      } else if (p.type === 'transfer') {
        if (isFromCash) predictedEndCash -= p.amount
        if (isToCash) predictedEndCash += p.amount
      }
    }
  }

  const sankeyData = buildSankeyData(transactions, predictions, cashAccountIds, categoryMap, accountMap)

  return {
    startDate,
    endDate,
    cashInflow: { actual: actualCashInflow.toNumber(), predicted: predictedCashInflow.toNumber() },
    cashOutflow: { actual: actualCashOutflow.toNumber(), predicted: predictedCashOutflow.toNumber() },
    netCashFlow: { actual: actualNetCashFlow.toNumber(), predicted: predictedNetCashFlow.toNumber() },
    flowByAccount,
    cashAccounts: cashAccounts.map(a => a.name),
    startCash: { actual: actualStartCash, predicted: predictedStartCash },
    endCash: { actual: actualEndCash, predicted: predictedEndCash },
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
  predictions: PredictionTransaction[],
  cashAccountIds: string[],
  categoryMap: Map<string, { cashFlowType: string | null; name: string }>,
  accountMap: Map<string, { name: string }>,
): { 
  nodes: Array<{ name: string; category: string }>; 
  links: Array<{ source: string; target: string; value: number; actualValue?: number; predictedValue?: number }> 
} {
  const incomeCategoryNodesActual: Map<string, Decimal> = new Map()
  const incomeCategoryNodesPredicted: Map<string, Decimal> = new Map()
  const nonCashSourceNodesActual: Map<string, Decimal> = new Map()
  const nonCashSourceNodesPredicted: Map<string, Decimal> = new Map()
  const expenseCategoryNodesActual: Map<string, Decimal> = new Map()
  const expenseCategoryNodesPredicted: Map<string, Decimal> = new Map()
  const nonCashTargetNodesActual: Map<string, Decimal> = new Map()
  const nonCashTargetNodesPredicted: Map<string, Decimal> = new Map()
  const cashAccountFlowsActual: Map<string, Decimal> = new Map()
  const cashAccountFlowsPredicted: Map<string, Decimal> = new Map()

  const sourceToCashLinksActual: Map<string, Map<string, Decimal>> = new Map()
  const sourceToCashLinksPredicted: Map<string, Map<string, Decimal>> = new Map()
  const cashToTargetLinksActual: Map<string, Map<string, Decimal>> = new Map()
  const cashToTargetLinksPredicted: Map<string, Map<string, Decimal>> = new Map()

  const processTransaction = (
    type: string,
    isFromCash: boolean,
    isToCash: boolean,
    amount: Decimal,
    fee: Decimal,
    coupon: Decimal,
    categoryName: string | undefined,
    accountName: string | undefined,
    toAccountName: string | undefined,
    isActual: boolean
  ) => {
    const incomeCategoryNodes = isActual ? incomeCategoryNodesActual : incomeCategoryNodesPredicted
    const nonCashSourceNodes = isActual ? nonCashSourceNodesActual : nonCashSourceNodesPredicted
    const expenseCategoryNodes = isActual ? expenseCategoryNodesActual : expenseCategoryNodesPredicted
    const nonCashTargetNodes = isActual ? nonCashTargetNodesActual : nonCashTargetNodesPredicted
    const cashAccountFlows = isActual ? cashAccountFlowsActual : cashAccountFlowsPredicted
    const sourceToCashLinks = isActual ? sourceToCashLinksActual : sourceToCashLinksPredicted
    const cashToTargetLinks = isActual ? cashToTargetLinksActual : cashToTargetLinksPredicted

    if (type === 'income' && isFromCash) {
      const catName = categoryName || '其他收入'
      const cashName = accountName || '现金账户'
      addToMap(incomeCategoryNodes, catName, amount)
      addToMap(cashAccountFlows, cashName, amount)
      if (!sourceToCashLinks.has(catName)) sourceToCashLinks.set(catName, new Map())
      addToMap(sourceToCashLinks.get(catName)!, cashName, amount)
    } else if (type === 'expense' && isFromCash) {
      const catName = categoryName || '其他支出'
      const cashName = accountName || '现金账户'
      addToMap(expenseCategoryNodes, catName, amount)
      addToMap(cashAccountFlows, cashName, amount)
      if (!cashToTargetLinks.has(cashName)) cashToTargetLinks.set(cashName, new Map())
      addToMap(cashToTargetLinks.get(cashName)!, catName, amount)
    } else if (type === 'transfer') {
      if (!isFromCash && isToCash && toAccountName) {
        const fromName = accountName || '非现金账户'
        const toCashName = toAccountName
        const actualInflow = calculateTransferInAmountDecimal(amount, fee, coupon)
        addToMap(nonCashSourceNodes, fromName, actualInflow)
        addToMap(cashAccountFlows, toCashName, actualInflow)
        if (!sourceToCashLinks.has(fromName)) sourceToCashLinks.set(fromName, new Map())
        addToMap(sourceToCashLinks.get(fromName)!, toCashName, actualInflow)
      } else if (isFromCash && !isToCash && accountName) {
        const fromCashName = accountName
        const toName = toAccountName || '非现金账户'
        const actualOutflow = calculateBalanceChangeDecimal('transfer', amount, fee, coupon).abs()
        addToMap(nonCashTargetNodes, toName, actualOutflow)
        addToMap(cashAccountFlows, fromCashName, actualOutflow)
        if (!cashToTargetLinks.has(fromCashName)) cashToTargetLinks.set(fromCashName, new Map())
        addToMap(cashToTargetLinks.get(fromCashName)!, toName, actualOutflow)
      }
    } else if (type === 'refund' && isFromCash) {
      const catName = categoryName || '退款'
      const cashName = accountName || '现金账户'
      const actualInflow = calculateBalanceChangeDecimal('refund', amount, fee, ZERO)
      addToMap(incomeCategoryNodes, catName, actualInflow)
      addToMap(cashAccountFlows, cashName, actualInflow)
      if (!sourceToCashLinks.has(catName)) sourceToCashLinks.set(catName, new Map())
      addToMap(sourceToCashLinks.get(catName)!, cashName, actualInflow)
    }
  }

  transactions.forEach(t => {
    const isFromCash = cashAccountIds.includes(t.accountId)
    const isToCash = !!t.toAccountId && cashAccountIds.includes(t.toAccountId)
    processTransaction(
      t.type,
      isFromCash,
      isToCash,
      t.amount,
      toDecimal(t.fee),
      toDecimal(t.coupon),
      t.category?.name,
      t.account?.name,
      t.toAccount?.name,
      true
    )
  })

  predictions.forEach(p => {
    const isFromCash = cashAccountIds.includes(p.accountId)
    const isToCash = !!p.toAccountId && cashAccountIds.includes(p.toAccountId)
    if (!isFromCash && !isToCash) return
    const category = p.categoryId ? categoryMap.get(p.categoryId) : null
    const account = accountMap.get(p.accountId)
    const toAccount = p.toAccountId ? accountMap.get(p.toAccountId) : null
    processTransaction(
      p.type,
      isFromCash,
      isToCash,
      toDecimal(p.amount),
      ZERO,
      ZERO,
      category?.name,
      account?.name,
      toAccount?.name,
      false
    )
  })

  const mergeNodes = (actual: Map<string, Decimal>, predicted: Map<string, Decimal>): Set<string> => {
    const result = new Set<string>()
    actual.forEach((_, key) => result.add(key))
    predicted.forEach((_, key) => result.add(key))
    return result
  }

  const allIncomeCategoryNodes = mergeNodes(incomeCategoryNodesActual, incomeCategoryNodesPredicted)
  const allNonCashSourceNodes = mergeNodes(nonCashSourceNodesActual, nonCashSourceNodesPredicted)
  const allExpenseCategoryNodes = mergeNodes(expenseCategoryNodesActual, expenseCategoryNodesPredicted)
  const allNonCashTargetNodes = mergeNodes(nonCashTargetNodesActual, nonCashTargetNodesPredicted)
  const allCashAccountFlows = mergeNodes(cashAccountFlowsActual, cashAccountFlowsPredicted)

  const sankeyNodes: Array<{ name: string; category: string }> = []
  const nodeNameMap: Map<string, string> = new Map()

  const sortedNodeNames = (nodeSet: Set<string>, actualMap: Map<string, Decimal>, predictedMap: Map<string, Decimal>) => {
    return Array.from(nodeSet).sort((a, b) => {
      const aVal = (actualMap.get(a) || ZERO).plus(predictedMap.get(a) || ZERO)
      const bVal = (actualMap.get(b) || ZERO).plus(predictedMap.get(b) || ZERO)
      return bVal.minus(aVal).toNumber()
    })
  }

  for (const name of sortedNodeNames(allNonCashSourceNodes, nonCashSourceNodesActual, nonCashSourceNodesPredicted)) {
    const uniqueName = `${name}_ncs`
    nodeNameMap.set(`ncs_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'non_cash_source' })
  }
  for (const name of sortedNodeNames(allIncomeCategoryNodes, incomeCategoryNodesActual, incomeCategoryNodesPredicted)) {
    const uniqueName = `${name}_income`
    nodeNameMap.set(`income_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'income_category' })
  }
  for (const name of sortedNodeNames(allCashAccountFlows, cashAccountFlowsActual, cashAccountFlowsPredicted)) {
    const uniqueName = `${name}_cash`
    nodeNameMap.set(`cash_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'cash' })
  }
  for (const name of sortedNodeNames(allNonCashTargetNodes, nonCashTargetNodesActual, nonCashTargetNodesPredicted)) {
    const uniqueName = `${name}_nct`
    nodeNameMap.set(`nct_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'non_cash_target' })
  }
  for (const name of sortedNodeNames(allExpenseCategoryNodes, expenseCategoryNodesActual, expenseCategoryNodesPredicted)) {
    const uniqueName = `${name}_expense`
    nodeNameMap.set(`expense_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'expense_category' })
  }

  const sankeyLinks: Array<{ source: string; target: string; value: number; actualValue?: number; predictedValue?: number }> = []

  const mergeLinks = (
    actualLinks: Map<string, Map<string, Decimal>>,
    predictedLinks: Map<string, Map<string, Decimal>>,
    isSourceToCash: boolean
  ) => {
    const allSources = new Set<string>()
    actualLinks.forEach((_, source) => allSources.add(source))
    predictedLinks.forEach((_, source) => allSources.add(source))

    for (const sourceName of allSources) {
      const actualTargets = actualLinks.get(sourceName) || new Map()
      const predictedTargets = predictedLinks.get(sourceName) || new Map()
      const allTargets = new Set<string>()
      actualTargets.forEach((_, target) => allTargets.add(target))
      predictedTargets.forEach((_, target) => allTargets.add(target))

      for (const targetName of allTargets) {
        const actualAmount = actualTargets.get(targetName) || ZERO
        const predictedAmount = predictedTargets.get(targetName) || ZERO
        const totalAmount = actualAmount.plus(predictedAmount)

        if (totalAmount.greaterThan(ZERO)) {
          const sourceKey = isSourceToCash
            ? (incomeCategoryNodesActual.has(sourceName) || incomeCategoryNodesPredicted.has(sourceName) ? `income_${sourceName}` : `ncs_${sourceName}`)
            : `cash_${sourceName}`
          const targetKey = isSourceToCash
            ? `cash_${targetName}`
            : (expenseCategoryNodesActual.has(targetName) || expenseCategoryNodesPredicted.has(targetName) ? `expense_${targetName}` : `nct_${targetName}`)

          sankeyLinks.push({
            source: nodeNameMap.get(sourceKey) || sourceName,
            target: nodeNameMap.get(targetKey) || targetName,
            value: totalAmount.toNumber(),
            actualValue: actualAmount.greaterThan(ZERO) ? actualAmount.toNumber() : undefined,
            predictedValue: predictedAmount.greaterThan(ZERO) ? predictedAmount.toNumber() : undefined,
          })
        }
      }
    }
  }

  mergeLinks(sourceToCashLinksActual, sourceToCashLinksPredicted, true)
  mergeLinks(cashToTargetLinksActual, cashToTargetLinksPredicted, false)

  return { nodes: sankeyNodes, links: sankeyLinks }
}
