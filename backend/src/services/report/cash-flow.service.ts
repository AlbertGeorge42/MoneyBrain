import { prisma } from '../../index.js'
import { calculateBalanceAtDate, calculateBalanceChangeDecimal, calculateTransferInAmountDecimal } from '../balance.service.js'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library.js'
import { toDecimal, ZERO } from '../../utils/decimal.js'

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

export interface CashFlowActivity {
  inflow: number
  outflow: number
  items: Array<{
    categoryName: string
    amount: number
    type: string
    direction: string
  }>
  net: number
}

export interface CashFlowResult {
  startDate: string
  endDate: string
  cashInflow: number
  cashOutflow: number
  netCashFlow: number
  flowByAccount: Record<string, { inflow: number; outflow: number }>
  cashAccounts: string[]
  startCash: number
  endCash: number
  cashChange: number
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
}

export async function generateCashFlow(startDate: string, endDate: string): Promise<CashFlowResult> {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T23:59:59.999`)

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

  const operating: CashFlowActivityDecimal = { inflow: ZERO, outflow: ZERO, items: [] }
  const investing: CashFlowActivityDecimal = { inflow: ZERO, outflow: ZERO, items: [] }
  const financing: CashFlowActivityDecimal = { inflow: ZERO, outflow: ZERO, items: [] }
  const uncategorized: CashFlowActivityDecimal = { inflow: ZERO, outflow: ZERO, items: [] }

  const getTargetByType = (cashFlowType: string | null): CashFlowActivityDecimal => {
    return cashFlowType === 'investing' ? investing :
           cashFlowType === 'financing' ? financing :
           cashFlowType === 'operating' ? operating : uncategorized
  }

  transactions.forEach(t => {
    const isFromCash = cashAccountIds.includes(t.accountId)
    const isToCash = t.toAccountId && cashAccountIds.includes(t.toAccountId)
    const cashFlowType = t.category?.cashFlowType || null
    const amount = t.amount
    const fee = toDecimal(t.fee)
    const coupon = toDecimal(t.coupon)

    if (t.type === 'income' && isFromCash) {
      const target = getTargetByType(cashFlowType)
      target.inflow = target.inflow.plus(amount)
      target.items.push({
        categoryName: t.category?.name || '未分类',
        amount: amount.toNumber(),
        type: 'income',
        direction: 'inflow',
      })
    } else if (t.type === 'expense' && isFromCash) {
      const target = getTargetByType(cashFlowType)
      target.outflow = target.outflow.plus(amount)
      target.items.push({
        categoryName: t.category?.name || '未分类',
        amount: amount.toNumber(),
        type: 'expense',
        direction: 'outflow',
      })
    } else if (t.type === 'transfer') {
      if (isFromCash && !isToCash) {
        const actualOutflow = calculateBalanceChangeDecimal('transfer', amount, fee, coupon).abs()
        const target = getTargetByType(cashFlowType)
        target.outflow = target.outflow.plus(actualOutflow)
        target.items.push({
          categoryName: t.category?.name || '转账转出',
          amount: actualOutflow.toNumber(),
          type: 'transfer_out',
          direction: 'outflow',
        })
      } else if (!isFromCash && isToCash) {
        const actualInflow = calculateTransferInAmountDecimal(amount, fee, coupon)
        const target = getTargetByType(cashFlowType)
        target.inflow = target.inflow.plus(actualInflow)
        target.items.push({
          categoryName: t.category?.name || '转账转入',
          amount: actualInflow.toNumber(),
          type: 'transfer_in',
          direction: 'inflow',
        })
      }
    } else if (t.type === 'refund' && isFromCash) {
      const actualInflow = calculateBalanceChangeDecimal('refund', amount, fee, ZERO)
      const target = getTargetByType(cashFlowType)
      target.inflow = target.inflow.plus(actualInflow)
      target.items.push({
        categoryName: t.category?.name || '退款',
        amount: actualInflow.toNumber(),
        type: 'refund',
        direction: 'inflow',
      })
    }
  })

  const cashInflow = operating.inflow.plus(investing.inflow).plus(financing.inflow).plus(uncategorized.inflow)
  const cashOutflow = operating.outflow.plus(investing.outflow).plus(financing.outflow).plus(uncategorized.outflow)
  const netCashFlow = cashInflow.minus(cashOutflow)

  const flowByAccount = buildFlowByAccount(transactions, cashAccountIds)

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

  const sankeyData = buildSankeyData(transactions, cashAccountIds)

  const toActivityResult = (activity: CashFlowActivityDecimal): CashFlowActivity => ({
    inflow: activity.inflow.toNumber(),
    outflow: activity.outflow.toNumber(),
    items: activity.items,
    net: activity.inflow.minus(activity.outflow).toNumber(),
  })

  return {
    startDate,
    endDate,
    cashInflow: cashInflow.toNumber(),
    cashOutflow: cashOutflow.toNumber(),
    netCashFlow: netCashFlow.toNumber(),
    flowByAccount,
    cashAccounts: cashAccounts.map(a => a.name),
    startCash,
    endCash,
    cashChange: endCash - startCash,
    byActivity: {
      operating: toActivityResult(operating),
      investing: toActivityResult(investing),
      financing: toActivityResult(financing),
      uncategorized: toActivityResult(uncategorized),
    },
    sankey: sankeyData,
  }
}

function buildFlowByAccount(
  transactions: TransactionWithIncludes[],
  cashAccountIds: string[],
): Record<string, { inflow: number; outflow: number }> {
  const flowByAccount: Record<string, { inflow: Decimal; outflow: Decimal }> = {}

  const getOrCreate = (name: string) => {
    if (!flowByAccount[name]) flowByAccount[name] = { inflow: ZERO, outflow: ZERO }
    return flowByAccount[name]
  }

  transactions.forEach(t => {
    const isFromCash = cashAccountIds.includes(t.accountId)
    const isToCash = t.toAccountId && cashAccountIds.includes(t.toAccountId)
    const amount = t.amount
    const fee = toDecimal(t.fee)
    const coupon = toDecimal(t.coupon)

    if (t.type === 'income' && isFromCash) {
      const name = t.account?.name || '未知账户'
      getOrCreate(name).inflow = getOrCreate(name).inflow.plus(amount)
    } else if (t.type === 'expense' && isFromCash) {
      const name = t.account?.name || '未知账户'
      getOrCreate(name).outflow = getOrCreate(name).outflow.plus(amount)
    } else if (t.type === 'transfer') {
      if (isFromCash && !isToCash) {
        const name = t.account?.name || '未知账户'
        const actualOutflow = calculateBalanceChangeDecimal('transfer', amount, fee, coupon).abs()
        getOrCreate(name).outflow = getOrCreate(name).outflow.plus(actualOutflow)
      } else if (!isFromCash && isToCash && t.toAccount) {
        const name = t.toAccount.name
        const actualInflow = calculateTransferInAmountDecimal(amount, fee, coupon)
        getOrCreate(name).inflow = getOrCreate(name).inflow.plus(actualInflow)
      }
    } else if (t.type === 'refund' && isFromCash) {
      const name = t.account?.name || '未知账户'
      const actualInflow = calculateBalanceChangeDecimal('refund', amount, fee, ZERO)
      getOrCreate(name).inflow = getOrCreate(name).inflow.plus(actualInflow)
    }
  })

  const result: Record<string, { inflow: number; outflow: number }> = {}
  for (const [name, flow] of Object.entries(flowByAccount)) {
    result[name] = {
      inflow: flow.inflow.toNumber(),
      outflow: flow.outflow.toNumber(),
    }
  }
  return result
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
