import { describe, it, expect } from 'vitest'
import {
  buildCategoryPaths,
  compareTotals,
  findDuplicateNames,
  type LedgerTotals,
} from '../../../../scripts/restore-drill-compare.mts'

/** 构造一份「干净库」口径：名称唯一、内容一致。 */
function cleanTotals(): LedgerTotals {
  return {
    accounts: 2,
    accountCategories: 1,
    transactionCategories: 1,
    transactions: 1,
    budgets: 1,
    snapshots: 1,
    balances: { 'acc-a': 100, 'acc-b': -50 },
    accountNames: { 'acc-a': '现金', 'acc-b': '信用卡' },
    accountNamesList: ['现金', '信用卡'],
    accountCategoryKeys: ['asset|流动资产'],
    transactionCategoryKeys: ['expense|餐饮'],
    transactionFingerprints: ['expense|2026-11-01|100|0|0|现金||expense|餐饮|0'],
    netWorth: 50,
    duplicateNames: [],
  }
}

describe('restore-drill-compare', () => {
  it('干净库：identical 为 true，且没有名称重复提示', () => {
    const result = compareTotals(cleanTotals(), cleanTotals())
    expect(result.identical).toBe(true)
    expect(result.problems).toEqual([])
    expect(result.hygieneNotes).toEqual([])
  })

  it('当前库的重复名称只作为提示，不判定失败（16 个「钱包」+ 48 条分类 3 个唯一名）', () => {
    const live: LedgerTotals = {
      ...cleanTotals(),
      accounts: 16,
      accountNames: Object.fromEntries(
        Array.from({ length: 16 }, (_, index) => [`acc-${index}`, '钱包']),
      ),
      accountNamesList: Array.from({ length: 16 }, () => '钱包'),
      balances: Object.fromEntries(Array.from({ length: 16 }, (_, index) => [`acc-${index}`, 0])),
      transactionCategories: 48,
      transactionCategoryKeys: ['餐饮', '交通', '购物'],
      netWorth: 0,
      duplicateNames: findDuplicateNames(
        Array.from({ length: 16 }, (_, index) => ({ id: `acc-${index}`, name: '钱包' })),
        [],
        Array.from({ length: 48 }, (_, index) => ({
          id: `tcat-${index}`,
          name: ['餐饮', '交通', '购物'][index % 3]!,
        })),
      ),
    }
    // 导入按名称去重后：账户只剩 1 个「钱包」，分类只剩 3 个唯一名。
    const restored: LedgerTotals = {
      ...cleanTotals(),
      accounts: 1,
      accountNames: { 'acc-new': '钱包' },
      accountNamesList: ['钱包'],
      balances: { 'acc-new': 0 },
      transactionCategories: 3,
      transactionCategoryKeys: ['餐饮', '交通', '购物'],
      netWorth: 0,
    }

    const result = compareTotals(live, restored)
    expect(result.identical).toBe(true)
    expect(result.hygieneNotes.join('\n')).toContain('「钱包」×16')
    expect(result.hygieneNotes.join('\n')).toContain('交易分类 48 条，仅 3 个唯一名')
  })

  it('唯一名称的账户缺失时判定失败', () => {
    const restored = cleanTotals()
    restored.accountNamesList = ['现金']
    restored.accountNames = { 'acc-a': '现金' }
    restored.balances = { 'acc-a': 100 }
    restored.accounts = 1

    const result = compareTotals(cleanTotals(), restored)
    expect(result.identical).toBe(false)
    expect(result.problems.join('\n')).toContain('账户「信用卡」在恢复库中缺失')
  })

  it('唯一名称账户的余额按库内 id 聚合后比较', () => {
    const restored = cleanTotals()
    restored.balances = { 'acc-a': 100, 'acc-b': -49 }

    const result = compareTotals(cleanTotals(), restored)
    expect(result.identical).toBe(false)
    expect(result.problems.join('\n')).toContain('账户「信用卡」余额: 原库 -50 ≠ 恢复库 -49')
  })

  it('重名账户的余额差异不判失败（导入会按名称去重）', () => {
    const live = cleanTotals()
    live.accountNames = { 'acc-1': '钱包', 'acc-2': '钱包' }
    live.accountNamesList = ['钱包', '钱包']
    live.balances = { 'acc-1': 10, 'acc-2': 20 }
    live.netWorth = 30
    live.duplicateNames = [{ table: '账户', name: '钱包', count: 2 }]

    const restored = cleanTotals()
    restored.accountNames = { 'acc-new': '钱包' }
    restored.accountNamesList = ['钱包']
    restored.balances = { 'acc-new': 10 }
    restored.netWorth = 10

    const result = compareTotals(live, restored)
    // 净资产仍按 id 聚合比较，所以这里会因为净资产不同而失败；
    // 余额本身不因重名而额外报错。
    expect(result.problems.some((problem) => problem.includes('账户「钱包」余额'))).toBe(false)
    expect(result.problems.join('\n')).toContain('净资产')
  })

  it('交易内容指纹缺失/多出都能定位', () => {
    const restored = cleanTotals()
    restored.transactionFingerprints = ['income|2026-11-01|100|0|0|现金||income||0']

    const result = compareTotals(cleanTotals(), restored)
    expect(result.identical).toBe(false)
    expect(result.problems.join('\n')).toContain('交易内容缺失')
    expect(result.problems.join('\n')).toContain('交易内容多出')
  })

  it('分类按 type + 名称路径展开，父子同名也能区分', () => {
    const keys = buildCategoryPaths([
      { id: 'root', name: '生活', type: 'expense', parentId: null },
      { id: 'child', name: '餐饮', type: 'expense', parentId: 'root' },
      { id: 'other', name: '餐饮', type: 'expense', parentId: null },
    ])
    expect(keys).toEqual(['expense|生活', 'expense|生活/餐饮', 'expense|餐饮'])
  })
})
