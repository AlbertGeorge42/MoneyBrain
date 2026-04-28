import { Prisma } from '@prisma/client'
import { prisma } from '../index.js'
import type { TransactionListParams } from './transaction.service.js'

const EMPTY_FILTER_ID = '__no_match__'
const ACCOUNT_CATEGORY_PREFIX = 'category_'

const normalizeStringArray = (value?: string | string[]): string[] => {
  if (!value) {
    return []
  }

  return Array.from(new Set(Array.isArray(value) ? value : [value]))
}

const resolveAccountIds = async (accountId?: string | string[]): Promise<string[] | undefined> => {
  const accountIds = normalizeStringArray(accountId)
  if (accountIds.length === 0) {
    return undefined
  }

  const directAccountIds = accountIds.filter(id => !id.startsWith(ACCOUNT_CATEGORY_PREFIX))
  const categoryIds = accountIds
    .filter(id => id.startsWith(ACCOUNT_CATEGORY_PREFIX))
    .map(id => id.slice(ACCOUNT_CATEGORY_PREFIX.length))

  if (categoryIds.length === 0) {
    return directAccountIds.length > 0 ? directAccountIds : [EMPTY_FILTER_ID]
  }

  const categoryAccounts = await prisma.account.findMany({
    where: { categoryId: { in: categoryIds } },
    select: { id: true },
  })

  const resolvedIds = Array.from(new Set([
    ...directAccountIds,
    ...categoryAccounts.map(account => account.id),
  ]))

  return resolvedIds.length > 0 ? resolvedIds : [EMPTY_FILTER_ID]
}

const buildCategoryChildrenMap = async (): Promise<Map<string | null, string[]>> => {
  const categories = await prisma.transactionCategory.findMany({
    select: { id: true, parentId: true },
  })

  const childrenMap = new Map<string | null, string[]>()

  for (const category of categories) {
    const key = category.parentId ?? null
    const siblings = childrenMap.get(key) ?? []
    siblings.push(category.id)
    childrenMap.set(key, siblings)
  }

  return childrenMap
}

const collectDescendantCategoryIds = (
  parentId: string,
  childrenMap: Map<string | null, string[]>,
): string[] => {
  const directChildren = childrenMap.get(parentId) ?? []
  const descendants: string[] = []

  for (const childId of directChildren) {
    descendants.push(childId, ...collectDescendantCategoryIds(childId, childrenMap))
  }

  return descendants
}

const resolveCategoryIds = async (categoryId?: string | string[]): Promise<string[] | undefined> => {
  const categoryIds = normalizeStringArray(categoryId)
  if (categoryIds.length === 0) {
    return undefined
  }

  const childrenMap = await buildCategoryChildrenMap()
  const resolvedIds = new Set<string>()

  for (const id of categoryIds) {
    resolvedIds.add(id)
    collectDescendantCategoryIds(id, childrenMap).forEach(childId => resolvedIds.add(childId))
  }

  return resolvedIds.size > 0 ? Array.from(resolvedIds) : [EMPTY_FILTER_ID]
}

const applyDateRange = (
  where: Prisma.TransactionWhereInput,
  startDate?: Date,
  endDate?: Date,
) => {
  if (!startDate && !endDate) {
    return
  }

  where.date = {
    ...(startDate ? { gte: startDate } : {}),
    ...(endDate ? { lte: endDate } : {}),
  }
}

export const buildTransactionListWhere = async (
  params: TransactionListParams,
): Promise<Prisma.TransactionWhereInput> => {
  const where: Prisma.TransactionWhereInput = {}

  const [accountIds, categoryIds] = await Promise.all([
    resolveAccountIds(params.accountId),
    resolveCategoryIds(params.categoryId),
  ])

  if (accountIds) {
    where.OR = accountIds.flatMap(id => [{ accountId: id }, { toAccountId: id }])
  }

  if (categoryIds) {
    where.categoryId = { in: categoryIds }
  }

  const types = normalizeStringArray(params.type)
  if (types.length > 0) {
    where.type = { in: types }
  }

  applyDateRange(where, params.startDate, params.endDate)

  return where
}
