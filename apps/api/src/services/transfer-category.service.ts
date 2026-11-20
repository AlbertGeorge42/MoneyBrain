/**
 * 转账五类判定的唯一收口。
 *
 * 判定规则来自 domain（classifyTransferCategory / TRANSFER_ACTIVITY），本模块负责
 * 把账户行解析成判定所需的标记、把结果落到对应的 TransactionCategory，并提供
 * 一次性重判入口。手工新建 / 编辑转账都走这里，避免出现第二套判定口径。
 *
 * 导入器在事务内用自带缓存直写分类行，但「账户标记 → 分类名 → 活动归属」仍调用
 * domain 的同一份纯函数；它不经过本模块的仓库写入，是为兼容其事务客户端。
 */
import { NotFoundError } from '../common/index.js'
import * as accountRepo from '../db/repositories/account.repository.js'
import * as accountCategoryRepo from '../db/repositories/account-category.repository.js'
import * as transactionCategoryRepo from '../db/repositories/transaction-category.repository.js'
import * as transactionRepo from '../db/repositories/transaction.repository.js'
import type { TransactionClient } from '../prisma.js'
import {
  classifyTransferCategory,
  resolveAccountCategoryFlags,
  TRANSFER_ACTIVITY,
  TRANSFER_CATEGORY_LEGACY_NAMES,
  type TransferAccountMark,
  type TransferCategoryName,
} from '../../../../packages/domain/src/index.js'

/** 账户行 + 有效投资标记集合 → domain 判定入参。 */
function markOf(
  account: { type: string; categoryId: string | null } | null,
  investmentCategoryIds: ReadonlySet<string>,
): TransferAccountMark | null {
  if (!account) return null
  return {
    type: account.type,
    isInvestment: account.categoryId ? investmentCategoryIds.has(account.categoryId) : false,
  }
}

/** 读取账户分类的有效投资标记（根节点继承，子分类自身字段不参与）。 */
async function loadInvestmentCategoryIds(tx?: TransactionClient): Promise<Set<string>> {
  const rows = await accountCategoryRepo.findMany({
    select: { id: true, parentId: true, isCashEquivalent: true, isInvestment: true },
  }, tx)
  return resolveAccountCategoryFlags(rows).investmentCategoryIds
}

/**
 * 找到（或按需创建）转账内部分类，活动归属由 domain 固定写入。
 * 已存在的同名分类若 cashFlowType 不匹配，一并纠正——这是数据修复的一部分。
 */
export async function ensureTransferCategory(
  name: TransferCategoryName,
  tx?: TransactionClient,
): Promise<string> {
  const cashFlowType = TRANSFER_ACTIVITY[name]
  let category = await transactionCategoryRepo.findFirst({
    where: { name, type: 'transfer', parentId: null },
  }, tx)
  if (!category && TRANSFER_CATEGORY_LEGACY_NAMES[name]) {
    category = await transactionCategoryRepo.findFirst({
      where: { name: TRANSFER_CATEGORY_LEGACY_NAMES[name]!, type: 'transfer', parentId: null },
    }, tx)
  }
  if (category) {
    // 历史别名「借款」原地归一到「借贷」：id 不变，历史交易不断链。
    if (category.name !== name || category.cashFlowType !== cashFlowType) {
      category = await transactionCategoryRepo.update({
        where: { id: category.id },
        data: { name, cashFlowType },
      }, tx)
    }
    return category.id
  }

  const siblings = await transactionCategoryRepo.findMany({
    where: { type: 'transfer', parentId: null },
    orderBy: { sort: 'desc' },
    take: 1,
  }, tx)
  return (await transactionCategoryRepo.create({
    data: {
      name,
      type: 'transfer',
      sort: siblings.length ? siblings[0]!.sort + 1 : 0,
      cashFlowType,
    },
  }, tx)).id
}

/**
 * 按两端账户判定并返回内部分类 id。新建和编辑转账都必须调用它，
 * 由调用方传入合并后的账户（编辑时即改账户后的最终值）。
 */
export async function resolveTransferCategoryId(
  fromAccountId: string,
  toAccountId: string,
  tx?: TransactionClient,
): Promise<string> {
  const [fromAccount, toAccount, investmentIds] = await Promise.all([
    accountRepo.findById(fromAccountId, tx),
    accountRepo.findById(toAccountId, tx),
    loadInvestmentCategoryIds(tx),
  ])
  if (!fromAccount) throw new NotFoundError('转出账户')
  if (!toAccount) throw new NotFoundError('转入账户')

  const name = classifyTransferCategory(markOf(fromAccount, investmentIds), markOf(toAccount, investmentIds))
  return ensureTransferCategory(name, tx)
}

export interface ReclassifyChange {
  id: string
  from: string | null
  to: string
}

/**
 * 重判所有已有转账的分类（dry-run 默认不写库）。
 * 只改分类不匹配的差异行，金额、账户、日期、审计历史一律不动。
 */
export async function reclassifyTransferCategories(
  apply = false,
): Promise<{ scanned: number; updated: number; changes: ReclassifyChange[] }> {
  const transfers = await transactionRepo.findActive(
    { type: 'transfer' },
    { select: { id: true, accountId: true, toAccountId: true, categoryId: true } },
  )
  const investmentIds = await loadInvestmentCategoryIds()
  const cache = new Map<string, string>()
  const changes: ReclassifyChange[] = []

  for (const transfer of transfers) {
    if (!transfer.toAccountId) continue
    const fromAccount = await accountRepo.findById(transfer.accountId)
    const toAccount = await accountRepo.findById(transfer.toAccountId)
    const name = classifyTransferCategory(
      markOf(fromAccount, investmentIds),
      markOf(toAccount, investmentIds),
    )
    let categoryId = cache.get(name)
    if (!categoryId) {
      if (apply) {
        categoryId = await ensureTransferCategory(name)
      } else {
        const existing = await transactionCategoryRepo.findFirst({
          where: { name, type: 'transfer', parentId: null },
        })
        if (!existing && TRANSFER_CATEGORY_LEGACY_NAMES[name]) {
          categoryId = (await transactionCategoryRepo.findFirst({
            where: { name: TRANSFER_CATEGORY_LEGACY_NAMES[name]!, type: 'transfer', parentId: null },
          }))?.id
        } else {
          categoryId = existing?.id
        }
        // dry-run 下分类尚不存在时用名字占位，不创建任何行。
        if (!categoryId) categoryId = `（待创建：${name}）`
      }
      cache.set(name, categoryId)
    }
    if (transfer.categoryId === categoryId) continue
    changes.push({ id: transfer.id, from: transfer.categoryId, to: categoryId })
    if (apply) await transactionRepo.updateFields(transfer.id, { categoryId })
  }

  return { scanned: transfers.length, updated: changes.length, changes }
}
