/**
 * 账务口径规则（唯一来源）。
 *
 * 「口径」= 哪些交易参与统计、退款冲减哪一侧、账户与分类如何匹配，
 * 以及一笔交易如何翻译成分录。
 *
 * 交易在写入时记录 `ruleVersion`；解释历史数字时按交易自己的版本取规则，
 * 所以新增口径版本不会改写旧交易的报表数字。
 *
 * 新增版本的做法：复制 `rules.v1.ts` 为 `rules.v2.ts` 并修改行为，
 * 然后在 `RULE_SETS` 登记。**已经发布的版本文件不再修改。**
 */
import type { Minor } from '../money.js'
import { V1_RULES } from './rules.v1.js'
import type { LedgerTransaction, Posting } from './types.js'

/** 收支两侧。 */
export type FlowKind = 'income' | 'expense'

/** 预算类型：收支两侧 + 转账。 */
export type BudgetKind = FlowKind | 'transfer'

/** 参与「不计收支」判断的最小结构。 */
export interface CountableTransaction {
  excludeFromIncomeExpense?: boolean | null
}

/** 参与预算口径判断的最小结构。 */
export interface BudgetTransaction extends CountableTransaction {
  kind: string
  accountId: string
  toAccountId?: string | null
  categoryId?: string | null
}

/** 统计范围：一条口径的适用范围。 */
export interface BudgetScope {
  /** 统计哪一侧：收入 / 支出 / 转账 */
  kind: BudgetKind
  /** 账户口径：收支只认这个账户；转账只认「转出 + 转入」这一对 */
  accountId: string
  /** 转账预算的转入账户 */
  toAccountId?: string | null
  /** 分类口径：分类子树；未分类的交易不计入 */
  categoryIds: ReadonlySet<string>
}

/**
 * SQL 侧需要的口径参数：领域层给出，API 翻译成 where 条件。
 * 这样「统计哪些类型」这件事也只有一处定义。
 */
export interface ScopeQuery {
  /** 参与统计的正向交易类型 */
  type: string
  /** 退款是否参与冲减（转账预算不计退款） */
  countsRefunds: boolean
  /** 退款的 relatedType：冲减哪一侧 */
  refundRelatedType: string
}

/**
 * 一套口径的全部解释规则。
 * 同一笔交易只能用它自己 `ruleVersion` 对应的那一套。
 */
export interface RuleSet {
  readonly version: number
  postingsOf(transaction: LedgerTransaction): Posting[]
  effectiveTransferFee(fee?: Minor, coupon?: Minor): Minor
  transferOutflow(principal: Minor, fee?: Minor, coupon?: Minor): Minor
  refundOffsetKind(relatedType: string | null | undefined): FlowKind | null
  isCountable(transaction: CountableTransaction, includeExcluded?: boolean): boolean
  scopeQuery(scope: BudgetScope): ScopeQuery
  matchesBudgetScope(transaction: BudgetTransaction, scope: BudgetScope): boolean
}

/** 新交易写入时使用的口径版本。 */
export const CURRENT_RULE_VERSION = 1

const RULE_SETS = new Map<number, RuleSet>()

/**
 * 登记一套口径规则。
 *
 * 新增版本：复制 `rules.v1.ts` 为 `rules.v2.ts` 并修改行为，然后调用本函数登记。
 * **已经登记的版本不允许覆盖**——改已发布的口径等于悄悄改写历史数字。
 */
export function registerRuleSet(rules: RuleSet): void {
  if (RULE_SETS.has(rules.version)) {
    throw new Error(`账务口径版本 ${rules.version} 已登记，不能覆盖`)
  }
  RULE_SETS.set(rules.version, rules)
}

registerRuleSet(V1_RULES)

/**
 * 取某一版规则。
 * 未知版本直接失败——用当前规则解释旧交易等于悄悄改写历史。
 */
export function rulesFor(version: number): RuleSet {
  const rules = RULE_SETS.get(version)
  if (!rules) {
    throw new Error(`未知账务口径版本: ${version}（当前 ${CURRENT_RULE_VERSION}）`)
  }
  return rules
}
