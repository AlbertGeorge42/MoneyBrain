/**
 * 演示账本（种子数据）——仅限开发与测试
 *
 * 边界：生产入口（main.tsx → App.tsx → DesignApp）不得静态 import 本模块。
 * 生产构建下数据模式恒为 api；只有 `import.meta.env.DEV && VITE_HF_DATA === 'seed'`
 * 时，DesignApp 才会通过动态 import 取用本模块（见 useApiLedger 的 resolveHfDataMode）。
 * tests/unit/seed-isolation.test.ts 会扫描生产入口依赖图，防止回潮。
 *
 * 对外只暴露一个入口函数 createSeedLedger()，数据常量不导出。
 */
import type {
  Ledger,
  LedgerAccount,
  LedgerAccountCategory,
  LedgerBudget,
  LedgerCategory,
  LedgerTransaction,
} from '@/features/overview/model'

/** 与真实账本同一套一级分类：资产 现金 / 长期 / 投资，负债 短期负债；账户直接挂一级。 */
const SEED_ACCOUNT_CATEGORIES: LedgerAccountCategory[] = [
  { id: 'seed-cash', name: '现金', type: 'asset', parentId: null, sort: 0, isCashEquivalent: true, seeded: true },
  { id: 'seed-long', name: '长期', type: 'asset', parentId: null, sort: 1, seeded: true },
  { id: 'seed-invest', name: '投资', type: 'asset', parentId: null, sort: 2, isInvestment: true, seeded: true },
  { id: 'seed-debt', name: '短期负债', type: 'liability', parentId: null, sort: 3, seeded: true },
]

const SEED_ACCOUNTS: LedgerAccount[] = [
  { id: 'cmb', name: '招商储蓄卡', kind: 'deposit', balance: 4_823_055, categoryId: 'seed-cash' },
  { id: 'wx', name: '微信零钱', kind: 'cash', balance: 128_620, categoryId: 'seed-cash' },
  { id: 'zfb', name: '支付宝', kind: 'cash', balance: 354_000, categoryId: 'seed-cash' },
  { id: 'xyk', name: '交行信用卡', kind: 'credit', balance: -211_840, categoryId: 'seed-debt' },
  { id: 'brk', name: '长桥证券', kind: 'investment', balance: 8_645_000, categoryId: 'seed-invest' },
]

const SEED_CATEGORIES: LedgerCategory[] = [
  { id: 'food', name: '餐饮', type: 'expense' },
  { id: 'food_lunch', name: '午餐', type: 'expense', parentId: 'food' },
  { id: 'food_takeout', name: '外食', type: 'expense', parentId: 'food' },
  { id: 'traffic', name: '交通', type: 'expense' },
  { id: 'home', name: '居住', type: 'expense' },
  { id: 'shop', name: '购物', type: 'expense' },
  { id: 'shop_daily', name: '日用', type: 'expense', parentId: 'shop' },
  { id: 'shop_cloth', name: '服饰', type: 'expense', parentId: 'shop' },
  { id: 'fun', name: '娱乐', type: 'expense' },
  { id: 'health', name: '医疗', type: 'expense' },
  { id: 'edu', name: '教育', type: 'expense' },
  { id: 'other', name: '其他', type: 'expense' },
  { id: 'salary', name: '工资', type: 'income' },
  { id: 'inv', name: '理财收益', type: 'income' },
  { id: 'gift', name: '红包', type: 'income' },
  { id: 'refund', name: '退款', type: 'refund' },
  { id: 'move', name: '账户互转', type: 'transfer' },
]

const SEED_BUDGETS: LedgerBudget[] = [
  { id: 'b_food', name: '餐饮', type: 'expense', period: 'monthly', limit: 150_000, categoryId: 'food', accountId: 'cmb' },
  { id: 'b_home', name: '居住', type: 'expense', period: 'monthly', limit: 560_000, categoryId: 'home', accountId: 'cmb' },
  { id: 'b_shop', name: '购物', type: 'expense', period: 'monthly', limit: 80_000, categoryId: 'shop', accountId: 'cmb' },
  { id: 'b_fun', name: '娱乐', type: 'expense', period: 'monthly', limit: 9_000, categoryId: 'fun', accountId: 'zfb' },
  { id: 'b_traffic', name: '交通', type: 'expense', period: 'weekly', limit: 10_000, categoryId: 'traffic', accountId: 'wx' },
  { id: 'b_edu', name: '教育', type: 'expense', period: 'yearly', limit: 200_000, categoryId: 'edu', accountId: 'zfb' },
  { id: 'b_salary', name: '工资入账', type: 'income', period: 'monthly', limit: 1_850_000, categoryId: 'salary', accountId: 'cmb' },
  { id: 'b_move', name: '账户互转', type: 'transfer', period: 'monthly', limit: 500_000, categoryId: 'move', accountId: 'cmb', toAccountId: 'brk' },
]

const SEED_TRANSACTIONS: LedgerTransaction[] = [
  {
    id: 't1', date: '2026-10-28', type: 'expense', categoryId: 'food_lunch',
    note: '公司食堂', accountId: 'wx', amount: 2_800,
  },
  {
    id: 't2', date: '2026-10-28', type: 'expense', categoryId: 'traffic',
    note: '地铁通勤', accountId: 'wx', amount: 600,
  },
  {
    id: 't3', date: '2026-10-27', type: 'expense', categoryId: 'shop_daily',
    note: '山姆会员商店', accountId: 'cmb', amount: 32_860,
  },
  {
    id: 't4', date: '2026-10-27', type: 'transfer', categoryId: 'move',
    note: '转入证券账户', accountId: 'cmb', toAccountId: 'brk', amount: 500_000, fee: 200,
  },
  {
    id: 't5', date: '2026-10-26', type: 'income', categoryId: 'salary',
    note: '十月工资', accountId: 'cmb', amount: 1_850_000,
  },
  {
    id: 't6', date: '2026-10-25', type: 'expense', categoryId: 'fun',
    note: '电影《沙丘 3》', accountId: 'zfb', amount: 7_900,
  },
  {
    id: 't7', date: '2026-10-24', type: 'refund', categoryId: 'shop_daily',
    note: '退货·保温杯', accountId: 'wx', amount: 12_900,
    relatedTransactionId: 't3', relatedType: 'expense',
  },
  {
    id: 't8', date: '2026-10-23', type: 'expense', categoryId: 'home',
    note: '十月房租', accountId: 'cmb', amount: 560_000,
  },
  {
    id: 't9', date: '2026-10-22', type: 'expense', categoryId: 'health',
    note: '药店·感冒药', accountId: 'zfb', amount: 4_650,
  },
  {
    id: 't10', date: '2026-10-20', type: 'adjustment', categoryId: 'other',
    note: '对账修正', accountId: 'wx', amount: -240,
  },
  {
    id: 't11', date: '2026-10-18', type: 'expense', categoryId: 'food_takeout',
    note: '周末火锅', accountId: 'cmb', amount: 28_600,
  },
  {
    id: 't12', date: '2026-10-15', type: 'expense', categoryId: 'edu',
    note: '得到年度课程', accountId: 'zfb', amount: 19_900,
  },
  {
    id: 't13', date: '2026-10-05', type: 'expense', categoryId: 'shop_daily',
    note: '山姆月度采购', accountId: 'cmb', amount: 92_860,
  },
]

export function createSeedLedger(): Ledger {
  return {
    accounts: SEED_ACCOUNTS.map((account) => ({ ...account })),
    accountCategories: SEED_ACCOUNT_CATEGORIES.map((category) => ({ ...category })),
    categories: SEED_CATEGORIES.map((category) => ({ ...category })),
    budgets: SEED_BUDGETS.map((budget) => ({ ...budget })),
    transactions: SEED_TRANSACTIONS.map((transaction) => ({ ...transaction })),
  }
}
