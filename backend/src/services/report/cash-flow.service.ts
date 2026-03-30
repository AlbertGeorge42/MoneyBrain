import { prisma } from '../../index.js'
import { calculateBalanceAtDate } from '../balance.service.js'
import { Prisma } from '@prisma/client'

type TransactionWithIncludes = Prisma.TransactionGetPayload<{
  include: { account: true; toAccount: true; category: true }
}>

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

  // 按活动类型分类
  const operating = { inflow: 0, outflow: 0, items: [] as CashFlowActivity['items'] }
  const investing = { inflow: 0, outflow: 0, items: [] as CashFlowActivity['items'] }
  const financing = { inflow: 0, outflow: 0, items: [] as CashFlowActivity['items'] }
  const uncategorized = { inflow: 0, outflow: 0, items: [] as CashFlowActivity['items'] }

  const getTargetByType = (cashFlowType: string | null) => {
    return cashFlowType === 'investing' ? investing :
           cashFlowType === 'financing' ? financing :
           cashFlowType === 'operating' ? operating : uncategorized
  }

  transactions.forEach(t => {
    const isFromCash = cashAccountIds.includes(t.accountId)
    const isToCash = t.toAccountId && cashAccountIds.includes(t.toAccountId)
    const cashFlowType = t.category?.cashFlowType || null

    if (t.type === 'income' && isFromCash) {
      const target = getTargetByType(cashFlowType)
      target.inflow += t.amount.toNumber()
      target.items.push({
        categoryName: t.category?.name || '未分类',
        amount: t.amount.toNumber(),
        type: 'income',
        direction: 'inflow',
      })
    } else if (t.type === 'expense' && isFromCash) {
      const target = getTargetByType(cashFlowType)
      target.outflow += t.amount.toNumber()
      target.items.push({
        categoryName: t.category?.name || '未分类',
        amount: t.amount.toNumber(),
        type: 'expense',
        direction: 'outflow',
      })
    } else if (t.type === 'transfer') {
      if (isFromCash && !isToCash) {
        const target = getTargetByType(cashFlowType)
        target.outflow += t.amount.toNumber()
        target.items.push({
          categoryName: t.category?.name || '转账转出',
          amount: t.amount.toNumber(),
          type: 'transfer_out',
          direction: 'outflow',
        })
      } else if (!isFromCash && isToCash) {
        const target = getTargetByType(cashFlowType)
        target.inflow += t.amount.toNumber()
        target.items.push({
          categoryName: t.category?.name || '转账转入',
          amount: t.amount.toNumber(),
          type: 'transfer_in',
          direction: 'inflow',
        })
      }
    }
  })

  const cashInflow = operating.inflow + investing.inflow + financing.inflow + uncategorized.inflow
  const cashOutflow = operating.outflow + investing.outflow + financing.outflow + uncategorized.outflow
  const netCashFlow = cashInflow - cashOutflow

  // 按账户统计流量
  const flowByAccount = buildFlowByAccount(transactions, cashAccountIds)

  // 计算期初和期末现金余额
  const startCashBalances = await Promise.all(
    cashAccountIds.map(id => calculateBalanceAtDate(id, start))
  )
  const endCashBalances = await Promise.all(
    cashAccountIds.map(id => calculateBalanceAtDate(id, new Date(end.getTime() + 86400000)))
  )

  const startCash = startCashBalances.reduce((sum, b) => sum + b, 0)
  const endCash = endCashBalances.reduce((sum, b) => sum + b, 0)

  const sankeyData = buildSankeyData(transactions, cashAccountIds)

  return {
    startDate,
    endDate,
    cashInflow,
    cashOutflow,
    netCashFlow,
    flowByAccount,
    cashAccounts: cashAccounts.map(a => a.name),
    startCash,
    endCash,
    cashChange: endCash - startCash,
    byActivity: {
      operating: { ...operating, net: operating.inflow - operating.outflow },
      investing: { ...investing, net: investing.inflow - investing.outflow },
      financing: { ...financing, net: financing.inflow - financing.outflow },
      uncategorized: { ...uncategorized, net: uncategorized.inflow - uncategorized.outflow },
    },
    sankey: sankeyData,
  }
}

function buildFlowByAccount(
  transactions: TransactionWithIncludes[],
  cashAccountIds: string[],
): Record<string, { inflow: number; outflow: number }> {
  const flowByAccount: Record<string, { inflow: number; outflow: number }> = {}

  transactions.forEach(t => {
    const isFromCash = cashAccountIds.includes(t.accountId)
    const isToCash = t.toAccountId && cashAccountIds.includes(t.toAccountId)

    if (t.type === 'income' && isFromCash) {
      const name = t.account?.name || '未知账户'
      if (!flowByAccount[name]) flowByAccount[name] = { inflow: 0, outflow: 0 }
      flowByAccount[name].inflow += t.amount.toNumber()
    } else if (t.type === 'expense' && isFromCash) {
      const name = t.account?.name || '未知账户'
      if (!flowByAccount[name]) flowByAccount[name] = { inflow: 0, outflow: 0 }
      flowByAccount[name].outflow += t.amount.toNumber()
    } else if (t.type === 'transfer') {
      if (isFromCash && !isToCash) {
        const name = t.account?.name || '未知账户'
        if (!flowByAccount[name]) flowByAccount[name] = { inflow: 0, outflow: 0 }
        flowByAccount[name].outflow += t.amount.toNumber()
      } else if (!isFromCash && isToCash && t.toAccount) {
        const name = t.toAccount.name
        if (!flowByAccount[name]) flowByAccount[name] = { inflow: 0, outflow: 0 }
        flowByAccount[name].inflow += t.amount.toNumber()
      }
    }
  })

  return flowByAccount
}

function buildSankeyData(
  transactions: TransactionWithIncludes[],
  cashAccountIds: string[],
): { nodes: Array<{ name: string; category: string }>; links: Array<{ source: string; target: string; value: number }> } {
  const incomeCategoryNodes: Map<string, number> = new Map()
  const nonCashSourceNodes: Map<string, number> = new Map()
  const expenseCategoryNodes: Map<string, number> = new Map()
  const nonCashTargetNodes: Map<string, number> = new Map()
  const cashAccountFlows: Map<string, number> = new Map()

  const sourceToCashLinks: Map<string, Map<string, number>> = new Map()
  const cashToTargetLinks: Map<string, Map<string, number>> = new Map()

  transactions.forEach(t => {
    const isFromCash = cashAccountIds.includes(t.accountId)
    const isToCash = t.toAccountId && cashAccountIds.includes(t.toAccountId)
    const amount = t.amount.toNumber()

    if (t.type === 'income' && isFromCash) {
      const categoryName = t.category?.name || '其他收入'
      const cashAccountName = t.account?.name || '现金账户'

      incomeCategoryNodes.set(categoryName, (incomeCategoryNodes.get(categoryName) || 0) + amount)
      cashAccountFlows.set(cashAccountName, (cashAccountFlows.get(cashAccountName) || 0) + amount)

      if (!sourceToCashLinks.has(categoryName)) sourceToCashLinks.set(categoryName, new Map())
      sourceToCashLinks.get(categoryName)!.set(
        cashAccountName,
        (sourceToCashLinks.get(categoryName)!.get(cashAccountName) || 0) + amount,
      )
    } else if (t.type === 'expense' && isFromCash) {
      const categoryName = t.category?.name || '其他支出'
      const cashAccountName = t.account?.name || '现金账户'

      expenseCategoryNodes.set(categoryName, (expenseCategoryNodes.get(categoryName) || 0) + amount)
      cashAccountFlows.set(cashAccountName, (cashAccountFlows.get(cashAccountName) || 0) + amount)

      if (!cashToTargetLinks.has(cashAccountName)) cashToTargetLinks.set(cashAccountName, new Map())
      cashToTargetLinks.get(cashAccountName)!.set(
        categoryName,
        (cashToTargetLinks.get(cashAccountName)!.get(categoryName) || 0) + amount,
      )
    } else if (t.type === 'transfer') {
      if (!isFromCash && isToCash && t.toAccount && t.account) {
        const fromAccountName = t.account.name
        const toCashAccountName = t.toAccount.name

        nonCashSourceNodes.set(fromAccountName, (nonCashSourceNodes.get(fromAccountName) || 0) + amount)
        cashAccountFlows.set(toCashAccountName, (cashAccountFlows.get(toCashAccountName) || 0) + amount)

        if (!sourceToCashLinks.has(fromAccountName)) sourceToCashLinks.set(fromAccountName, new Map())
        sourceToCashLinks.get(fromAccountName)!.set(
          toCashAccountName,
          (sourceToCashLinks.get(fromAccountName)!.get(toCashAccountName) || 0) + amount,
        )
      } else if (isFromCash && !isToCash && t.account && t.toAccount) {
        const fromCashAccountName = t.account.name
        const toAccountName = t.toAccount.name

        nonCashTargetNodes.set(toAccountName, (nonCashTargetNodes.get(toAccountName) || 0) + amount)
        cashAccountFlows.set(fromCashAccountName, (cashAccountFlows.get(fromCashAccountName) || 0) + amount)

        if (!cashToTargetLinks.has(fromCashAccountName)) cashToTargetLinks.set(fromCashAccountName, new Map())
        cashToTargetLinks.get(fromCashAccountName)!.set(
          toAccountName,
          (cashToTargetLinks.get(fromCashAccountName)!.get(toAccountName) || 0) + amount,
        )
      }
    }
  })

  // 构建桑基图节点（使用唯一后缀避免名称冲突）
  const sankeyNodes: Array<{ name: string; category: string }> = []
  const sankeyLinks: Array<{ source: string; target: string; value: number }> = []
  const nodeNameMap: Map<string, string> = new Map()

  // 左侧：非现金来源 + 收入分类
  for (const [name] of Array.from(nonCashSourceNodes.entries()).sort((a, b) => b[1] - a[1])) {
    const uniqueName = `${name}_ncs`
    nodeNameMap.set(`ncs_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'non_cash_source' })
  }
  for (const [name] of Array.from(incomeCategoryNodes.entries()).sort((a, b) => b[1] - a[1])) {
    const uniqueName = `${name}_income`
    nodeNameMap.set(`income_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'income_category' })
  }

  // 中间：现金账户
  for (const [name] of Array.from(cashAccountFlows.entries()).sort((a, b) => b[1] - a[1])) {
    const uniqueName = `${name}_cash`
    nodeNameMap.set(`cash_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'cash' })
  }

  // 右侧：非现金去向 + 支出分类
  for (const [name] of Array.from(nonCashTargetNodes.entries()).sort((a, b) => b[1] - a[1])) {
    const uniqueName = `${name}_nct`
    nodeNameMap.set(`nct_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'non_cash_target' })
  }
  for (const [name] of Array.from(expenseCategoryNodes.entries()).sort((a, b) => b[1] - a[1])) {
    const uniqueName = `${name}_expense`
    nodeNameMap.set(`expense_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'expense_category' })
  }

  // 构建链接
  sourceToCashLinks.forEach((cashMap, sourceName) => {
    cashMap.forEach((amount, cashName) => {
      if (amount > 0) {
        const sourceKey = incomeCategoryNodes.has(sourceName) ? `income_${sourceName}` : `ncs_${sourceName}`
        const targetKey = `cash_${cashName}`
        sankeyLinks.push({
          source: nodeNameMap.get(sourceKey) || sourceName,
          target: nodeNameMap.get(targetKey) || cashName,
          value: amount,
        })
      }
    })
  })

  cashToTargetLinks.forEach((targetMap, cashName) => {
    targetMap.forEach((amount, targetName) => {
      if (amount > 0) {
        const sourceKey = `cash_${cashName}`
        const targetKey = expenseCategoryNodes.has(targetName) ? `expense_${targetName}` : `nct_${targetName}`
        sankeyLinks.push({
          source: nodeNameMap.get(sourceKey) || cashName,
          target: nodeNameMap.get(targetKey) || targetName,
          value: amount,
        })
      }
    })
  })

  return { nodes: sankeyNodes, links: sankeyLinks }
}
