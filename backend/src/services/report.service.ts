import { prisma } from '../index.js'
import { calculateBalanceAtDate } from './balance.service.js'
import { Prisma } from '@prisma/client'

// 交易记录包含关联数据的类型
type TransactionWithIncludes = Prisma.TransactionGetPayload<{
  include: { account: true; toAccount: true; category: true }
}>

// 类型定义
export interface BalanceSheetAccount {
  id: string
  name: string
  type: string
  balance: number
  category: string
}

export interface BalanceSheetResult {
  month: string
  date: string
  assets: number
  liabilities: number
  netWorth: number
  assetsByCategory: Record<string, number>
  liabilitiesByCategory: Record<string, number>
  accounts: BalanceSheetAccount[]
}

export interface CategoryBreakdownItem {
  name: string
  value: number
  categoryId: string
  hasChildren: boolean
}

export interface IncomeExpenseResult {
  startDate: string
  endDate: string
  income: number
  expense: number
  balance: number
  incomeByCategory: Record<string, number>
  expenseByCategory: Record<string, number>
  incomeCategoryDetails: CategoryBreakdownItem[]
  expenseCategoryDetails: CategoryBreakdownItem[]
  startAssets: number
  startLiabilities: number
  startNetWorth: number
  endAssets: number
  endLiabilities: number
  endNetWorth: number
  assetChange: number
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

/**
 * 生成资产负债表
 * 
 * @param month 月份，格式为 YYYY-MM
 * @returns 资产负债表数据
 */
export async function generateBalanceSheet(month: string): Promise<BalanceSheetResult> {
  // 使用本地时间解析月份开始日期，避免时区偏移问题
  const monthStart = new Date(`${month}-01T00:00:00`)

  const accounts = await prisma.account.findMany({
    include: { category: true },
  })

  const accountBalances = await Promise.all(
    accounts.map(async (account) => {
      const balance = await calculateBalanceAtDate(account.id, monthStart)
      
      return {
        ...account,
        balance,
      }
    })
  )

  const assets = accountBalances
    .filter(a => a.type === 'asset')
    .reduce((sum, a) => sum + a.balance, 0)
  
  const liabilities = accountBalances
    .filter(a => a.type === 'liability')
    .reduce((sum, a) => sum + a.balance, 0)
  
  const netWorth = assets + liabilities

  const assetsByCategory: Record<string, number> = {}
  const liabilitiesByCategory: Record<string, number> = {}

  accountBalances.forEach(account => {
    const categoryName = account.category?.name || '未分类'
    if (account.type === 'asset') {
      assetsByCategory[categoryName] = (assetsByCategory[categoryName] || 0) + account.balance
    } else {
      liabilitiesByCategory[categoryName] = (liabilitiesByCategory[categoryName] || 0) + Math.abs(account.balance)
    }
  })

  return {
    month,
    date: `${month}-01`,
    assets,
    liabilities,
    netWorth,
    assetsByCategory,
    liabilitiesByCategory,
    accounts: accountBalances.map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      balance: a.balance,
      category: a.category?.name || '未分类',
    })),
  }
}

/**
 * 生成收支表
 * 
 * @param startDate 开始日期，格式为 YYYY-MM-DD
 * @param endDate 结束日期，格式为 YYYY-MM-DD
 * @returns 收支表数据
 */
export async function generateIncomeExpense(startDate: string, endDate: string): Promise<IncomeExpenseResult> {
  // 使用本地时间解析日期，避免时区偏移问题
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T23:59:59.999`)

  const transactions = await prisma.transaction.findMany({
    where: {
      date: {
        gte: start,
        lte: end,
      },
      isAdjustment: false,
      type: { in: ['income', 'expense'] },
    },
    include: { category: true, account: true },
  })

  const income = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount.toNumber(), 0)
  const expense = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount.toNumber(), 0)
  const balance = income - expense

  const incomeByCategory: Record<string, number> = {}
  const expenseByCategory: Record<string, number> = {}

  // 获取所有父分类
  const allCategories = await prisma.transactionCategory.findMany()
  const parentCategories = allCategories.filter(c => c.parentId === null)
  const parentCategoryMap = new Map(parentCategories.map(c => [c.id, c.name]))

  // 获取子分类的父分类映射
  const childCategoryIds = transactions
    .filter(t => t.category?.parentId)
    .map(t => t.category!.parentId)
  
  const uniqueParentIds = [...new Set(childCategoryIds)] as string[]
  
  let parentMap: Record<string, string> = {}
  if (uniqueParentIds.length > 0) {
    const parentCats = await prisma.transactionCategory.findMany({
      where: { id: { in: uniqueParentIds } }
    })
    parentMap = Object.fromEntries(parentCats.map(p => [p.id, p.name]))
  }

  // 按父分类汇总，同时记录分类ID
  const incomeCategoryData: Record<string, { value: number; categoryId: string }> = {}
  const expenseCategoryData: Record<string, { value: number; categoryId: string }> = {}

  transactions.forEach(t => {
    let categoryName = '未分类'
    let parentId = ''
    
    if (t.category) {
      if (t.category.parentId) {
        categoryName = parentMap[t.category.parentId] || t.category.name
        parentId = t.category.parentId
      } else {
        categoryName = t.category.name
        parentId = t.category.id
      }
    }
    
    if (t.type === 'income') {
      incomeByCategory[categoryName] = (incomeByCategory[categoryName] || 0) + t.amount.toNumber()
      if (!incomeCategoryData[categoryName]) {
        incomeCategoryData[categoryName] = { value: 0, categoryId: parentId }
      }
      incomeCategoryData[categoryName].value += t.amount.toNumber()
    } else {
      expenseByCategory[categoryName] = (expenseByCategory[categoryName] || 0) + t.amount.toNumber()
      if (!expenseCategoryData[categoryName]) {
        expenseCategoryData[categoryName] = { value: 0, categoryId: parentId }
      }
      expenseCategoryData[categoryName].value += t.amount.toNumber()
    }
  })

  // 构建分类详情列表
  const incomeCategoryDetails: CategoryBreakdownItem[] = Object.entries(incomeCategoryData)
    .map(([name, data]) => ({
      name,
      value: data.value,
      categoryId: data.categoryId,
      hasChildren: allCategories.some(c => c.parentId === data.categoryId)
    }))
    .sort((a, b) => b.value - a.value)

  const expenseCategoryDetails: CategoryBreakdownItem[] = Object.entries(expenseCategoryData)
    .map(([name, data]) => ({
      name,
      value: data.value,
      categoryId: data.categoryId,
      hasChildren: allCategories.some(c => c.parentId === data.categoryId)
    }))
    .sort((a, b) => b.value - a.value)

  // 计算期初和期末资产
  const accounts = await prisma.account.findMany()
  
  const startBalances = await Promise.all(
    accounts.map(async (account) => {
      return calculateBalanceAtDate(account.id, start)
    })
  )
  
  const endBalances = await Promise.all(
    accounts.map(async (account) => {
      return calculateBalanceAtDate(account.id, new Date(end.getTime() + 86400000))
    })
  )

  const startAssets = accounts.reduce((sum, account, index) => {
    return account.type === 'asset' ? sum + startBalances[index] : sum
  }, 0)
  const startLiabilitiesBalance = accounts.reduce((sum, account, index) => {
    return account.type === 'liability' ? sum + startBalances[index] : sum
  }, 0)
  const startLiabilities = Math.abs(startLiabilitiesBalance)
  const startNetWorth = startAssets + startLiabilitiesBalance

  const endAssets = accounts.reduce((sum, account, index) => {
    return account.type === 'asset' ? sum + endBalances[index] : sum
  }, 0)
  const endLiabilitiesBalance = accounts.reduce((sum, account, index) => {
    return account.type === 'liability' ? sum + endBalances[index] : sum
  }, 0)
  const endLiabilities = Math.abs(endLiabilitiesBalance)
  const endNetWorth = endAssets + endLiabilitiesBalance

  return {
    startDate,
    endDate,
    income,
    expense,
    balance,
    incomeByCategory,
    expenseByCategory,
    incomeCategoryDetails,
    expenseCategoryDetails,
    startAssets,
    startLiabilities,
    startNetWorth,
    endAssets,
    endLiabilities,
    endNetWorth,
    assetChange: endNetWorth - startNetWorth,
  }
}

/**
 * 生成现金流量表
 * 
 * @param startDate 开始日期，格式为 YYYY-MM-DD
 * @param endDate 结束日期，格式为 YYYY-MM-DD
 * @returns 现金流量表数据
 */
export async function generateCashFlow(startDate: string, endDate: string): Promise<CashFlowResult> {
  // 使用本地时间解析日期，确保与数据库中存储的时间戳一致
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T23:59:59.999`)

  // 获取现金等价物账户
  const cashCategories = await prisma.accountCategory.findMany({
    where: { isCashEquivalent: true },
    select: { id: true },
  })
  const cashCategoryIds = cashCategories.map(c => c.id)

  const cashAccounts = await prisma.account.findMany({
    where: {
      categoryId: { in: cashCategoryIds },
    },
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
    include: { 
      account: true, 
      toAccount: true, 
      category: true,
    },
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
  const flowByAccount: Record<string, { inflow: number; outflow: number }> = {}
  
  transactions.forEach(t => {
    const isFromCash = cashAccountIds.includes(t.accountId)
    const isToCash = t.toAccountId && cashAccountIds.includes(t.toAccountId)
    
    if (t.type === 'income' && isFromCash) {
      const accountName = t.account?.name || '未知账户'
      if (!flowByAccount[accountName]) {
        flowByAccount[accountName] = { inflow: 0, outflow: 0 }
      }
      flowByAccount[accountName].inflow += t.amount.toNumber()
    } else if (t.type === 'expense' && isFromCash) {
      const accountName = t.account?.name || '未知账户'
      if (!flowByAccount[accountName]) {
        flowByAccount[accountName] = { inflow: 0, outflow: 0 }
      }
      flowByAccount[accountName].outflow += t.amount.toNumber()
    } else if (t.type === 'transfer') {
      if (isFromCash && !isToCash) {
        const accountName = t.account?.name || '未知账户'
        if (!flowByAccount[accountName]) {
          flowByAccount[accountName] = { inflow: 0, outflow: 0 }
        }
        flowByAccount[accountName].outflow += t.amount.toNumber()
      } else if (!isFromCash && isToCash && t.toAccount) {
        const accountName = t.toAccount.name
        if (!flowByAccount[accountName]) {
          flowByAccount[accountName] = { inflow: 0, outflow: 0 }
        }
        flowByAccount[accountName].inflow += t.amount.toNumber()
      }
    }
  })

  // 计算期初和期末现金余额
  const startCashBalances = await Promise.all(
    cashAccountIds.map(id => calculateBalanceAtDate(id, start))
  )
  const endCashBalances = await Promise.all(
    cashAccountIds.map(id => calculateBalanceAtDate(id, new Date(end.getTime() + 86400000)))
  )

  const startCash = startCashBalances.reduce((sum, b) => sum + b, 0)
  const endCash = endCashBalances.reduce((sum, b) => sum + b, 0)

  // 构建桑基图数据
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

/**
 * 构建桑基图数据
 */
function buildSankeyData(
  transactions: TransactionWithIncludes[],
  cashAccountIds: string[]
): { nodes: Array<{ name: string; category: string }>; links: Array<{ source: string; target: string; value: number }> } {
  // 分离收入分类和非现金账户来源
  const incomeCategoryNodes: Map<string, number> = new Map()
  const nonCashSourceNodes: Map<string, number> = new Map()
  // 分离支出分类和非现金账户去向
  const expenseCategoryNodes: Map<string, number> = new Map()
  const nonCashTargetNodes: Map<string, number> = new Map()
  // 现金账户流量统计
  const cashAccountFlows: Map<string, number> = new Map()
  
  const sourceToCashLinks: Map<string, Map<string, number>> = new Map()
  const cashToTargetLinks: Map<string, Map<string, number>> = new Map()

  transactions.forEach(t => {
    const isFromCash = cashAccountIds.includes(t.accountId)
    const isToCash = t.toAccountId && cashAccountIds.includes(t.toAccountId)
    const amount = t.amount.toNumber()
    
    if (t.type === 'income' && isFromCash) {
      // 收入分类节点
      const categoryName = t.category?.name || '其他收入'
      const cashAccountName = t.account?.name || '现金账户'
      
      incomeCategoryNodes.set(categoryName, (incomeCategoryNodes.get(categoryName) || 0) + amount)
      cashAccountFlows.set(cashAccountName, (cashAccountFlows.get(cashAccountName) || 0) + amount)
      
      if (!sourceToCashLinks.has(categoryName)) {
        sourceToCashLinks.set(categoryName, new Map())
      }
      sourceToCashLinks.get(categoryName)!.set(
        cashAccountName, 
        (sourceToCashLinks.get(categoryName)!.get(cashAccountName) || 0) + amount
      )
    } else if (t.type === 'expense' && isFromCash) {
      // 支出分类节点
      const categoryName = t.category?.name || '其他支出'
      const cashAccountName = t.account?.name || '现金账户'
      
      expenseCategoryNodes.set(categoryName, (expenseCategoryNodes.get(categoryName) || 0) + amount)
      cashAccountFlows.set(cashAccountName, (cashAccountFlows.get(cashAccountName) || 0) + amount)
      
      if (!cashToTargetLinks.has(cashAccountName)) {
        cashToTargetLinks.set(cashAccountName, new Map())
      }
      cashToTargetLinks.get(cashAccountName)!.set(
        categoryName,
        (cashToTargetLinks.get(cashAccountName)!.get(categoryName) || 0) + amount
      )
    } else if (t.type === 'transfer') {
      if (!isFromCash && isToCash && t.toAccount && t.account) {
        // 非现金账户来源节点（转账转入）
        const fromAccountName = t.account.name
        const toCashAccountName = t.toAccount.name
        
        nonCashSourceNodes.set(fromAccountName, (nonCashSourceNodes.get(fromAccountName) || 0) + amount)
        cashAccountFlows.set(toCashAccountName, (cashAccountFlows.get(toCashAccountName) || 0) + amount)
        
        if (!sourceToCashLinks.has(fromAccountName)) {
          sourceToCashLinks.set(fromAccountName, new Map())
        }
        sourceToCashLinks.get(fromAccountName)!.set(
          toCashAccountName,
          (sourceToCashLinks.get(fromAccountName)!.get(toCashAccountName) || 0) + amount
        )
      } else if (isFromCash && !isToCash && t.account && t.toAccount) {
        // 非现金账户去向节点（转账转出）
        const fromCashAccountName = t.account.name
        const toAccountName = t.toAccount.name
        
        nonCashTargetNodes.set(toAccountName, (nonCashTargetNodes.get(toAccountName) || 0) + amount)
        cashAccountFlows.set(fromCashAccountName, (cashAccountFlows.get(fromCashAccountName) || 0) + amount)
        
        if (!cashToTargetLinks.has(fromCashAccountName)) {
          cashToTargetLinks.set(fromCashAccountName, new Map())
        }
        cashToTargetLinks.get(fromCashAccountName)!.set(
          toAccountName,
          (cashToTargetLinks.get(fromCashAccountName)!.get(toAccountName) || 0) + amount
        )
      }
    }
  })

  // 构建桑基图节点
  // 为避免节点名称冲突，添加分类后缀
  const sankeyNodes: Array<{ name: string; category: string }> = []
  const sankeyLinks: Array<{ source: string; target: string; value: number }> = []
  
  // 名称映射：原始名称 -> 带后缀的唯一名称
  const nodeNameMap: Map<string, string> = new Map()

  // 左侧节点：先排序所有非现金账户（来源），再排序所有收入分类，内部按金额降序
  const sortedNonCashSources = Array.from(nonCashSourceNodes.entries())
    .sort((a, b) => b[1] - a[1])
  sortedNonCashSources.forEach(([name]) => {
    const uniqueName = `${name}_ncs`
    nodeNameMap.set(`ncs_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'non_cash_source' })
  })

  const sortedIncomeCategories = Array.from(incomeCategoryNodes.entries())
    .sort((a, b) => b[1] - a[1])
  sortedIncomeCategories.forEach(([name]) => {
    const uniqueName = `${name}_income`
    nodeNameMap.set(`income_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'income_category' })
  })

  // 中间节点：现金账户按金额降序排列
  const sortedCashAccounts = Array.from(cashAccountFlows.entries())
    .sort((a, b) => b[1] - a[1])
  sortedCashAccounts.forEach(([name]) => {
    const uniqueName = `${name}_cash`
    nodeNameMap.set(`cash_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'cash' })
  })

  // 右侧节点：先排序所有非现金账户（去向），再排序所有支出分类，内部按金额降序
  const sortedNonCashTargets = Array.from(nonCashTargetNodes.entries())
    .sort((a, b) => b[1] - a[1])
  sortedNonCashTargets.forEach(([name]) => {
    const uniqueName = `${name}_nct`
    nodeNameMap.set(`nct_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'non_cash_target' })
  })

  const sortedExpenseCategories = Array.from(expenseCategoryNodes.entries())
    .sort((a, b) => b[1] - a[1])
  sortedExpenseCategories.forEach(([name]) => {
    const uniqueName = `${name}_expense`
    nodeNameMap.set(`expense_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'expense_category' })
  })

  // 构建链接，使用唯一名称
  sourceToCashLinks.forEach((cashMap, sourceName) => {
    cashMap.forEach((amount, cashName) => {
      if (amount > 0) {
        // 判断来源是收入分类还是非现金账户
        const sourceKey = incomeCategoryNodes.has(sourceName) ? `income_${sourceName}` : `ncs_${sourceName}`
        const targetKey = `cash_${cashName}`
        sankeyLinks.push({ 
          source: nodeNameMap.get(sourceKey) || sourceName, 
          target: nodeNameMap.get(targetKey) || cashName, 
          value: amount 
        })
      }
    })
  })

  cashToTargetLinks.forEach((targetMap, cashName) => {
    targetMap.forEach((amount, targetName) => {
      if (amount > 0) {
        const sourceKey = `cash_${cashName}`
        // 判断目标是支出分类还是非现金账户
        const targetKey = expenseCategoryNodes.has(targetName) ? `expense_${targetName}` : `nct_${targetName}`
        sankeyLinks.push({ 
          source: nodeNameMap.get(sourceKey) || cashName, 
          target: nodeNameMap.get(targetKey) || targetName, 
          value: amount 
        })
      }
    })
  })

  return { nodes: sankeyNodes, links: sankeyLinks }
}
