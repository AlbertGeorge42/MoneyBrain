import type { Account, Category, Transaction } from './types'

/** 设计预览用固定“今天”，让分组标签与线框走查一致。 */
export const PREVIEW_TODAY = '2026-11-04'

export const ACCOUNTS: Account[] = [
  { id: 'cmb', name: '招商储蓄卡', group: '存款', lastUsed: true },
  { id: 'wx', name: '微信零钱', group: '现金及等价物', lastUsed: true },
  { id: 'alipay', name: '支付宝', group: '现金及等价物', lastUsed: true },
  { id: 'cash', name: '现金', group: '现金及等价物' },
  { id: 'credit', name: '招行信用卡', group: '负债' },
]

export const CATEGORIES: Category[] = [
  { id: 'food', name: '餐饮', types: ['expense', 'refund'], colorIndex: 1, icon: 'utensils' },
  { id: 'transport', name: '交通', types: ['expense', 'refund'], colorIndex: 2, icon: 'train' },
  { id: 'shopping', name: '购物', types: ['expense', 'refund'], colorIndex: 3, icon: 'shopping' },
  { id: 'home', name: '居住', types: ['expense', 'refund'], colorIndex: 4, icon: 'house' },
  { id: 'fun', name: '娱乐', types: ['expense', 'refund'], colorIndex: 5, icon: 'gamepad' },
  { id: 'health', name: '医疗', types: ['expense', 'refund'], colorIndex: 6, icon: 'heart' },
  { id: 'education', name: '教育', types: ['expense', 'refund'], colorIndex: 1, icon: 'graduation' },
  { id: 'other', name: '其他', types: ['expense', 'refund'], colorIndex: 6, icon: 'more' },
  { id: 'salary', name: '工资', types: ['income'], colorIndex: 1, icon: 'wallet' },
  { id: 'bonus', name: '奖金', types: ['income'], colorIndex: 3, icon: 'gift' },
  { id: 'invest', name: '理财', types: ['income'], colorIndex: 2, icon: 'chart' },
  { id: 'reimburse', name: '报销', types: ['income'], colorIndex: 5, icon: 'receipt' },
  { id: 'transfer', name: '转账', types: ['transfer'], colorIndex: 3, icon: 'transfer' },
  { id: 'repay', name: '还款', types: ['transfer'], colorIndex: 6, icon: 'credit' },
  { id: 'topup', name: '充值', types: ['transfer'], colorIndex: 2, icon: 'plus' },
  { id: 'withdraw', name: '提现', types: ['transfer'], colorIndex: 4, icon: 'banknote' },
  { id: 'refund', name: '退款', types: ['refund'], colorIndex: 5, icon: 'rotate' },
  { id: 'adjust', name: '调整', types: ['adjust'], colorIndex: 4, icon: 'sliders' },
  { id: 'correction', name: '修正', types: ['adjust'], colorIndex: 2, icon: 'wrench' },
]

export const TRANSACTIONS: Transaction[] = [
  { id: 't1', type: 'expense', amount: -28, categoryId: 'food', subcategory: '午餐·公司食堂', accountId: 'wx', date: '2026-11-04', note: '午餐·公司食堂' },
  { id: 't2', type: 'expense', amount: -6, categoryId: 'transport', subcategory: '地铁通勤', accountId: 'wx', date: '2026-11-04', note: '地铁通勤' },
  { id: 't3', type: 'expense', amount: -56, categoryId: 'food', subcategory: '早餐', accountId: 'alipay', date: '2026-11-03', note: '早餐' },
  { id: 't4', type: 'expense', amount: -328.6, categoryId: 'shopping', subcategory: '山姆会员店', accountId: 'cmb', date: '2026-11-03', note: '山姆会员店' },
  { id: 't5', type: 'expense', amount: -79, categoryId: 'fun', subcategory: '电影', accountId: 'alipay', date: '2026-11-03', note: '电影票' },
  { id: 't6', type: 'transfer', amount: -2000, categoryId: 'transfer', subcategory: '转入支付宝', accountId: 'cmb', toAccountId: 'alipay', date: '2026-11-03', note: '转入支付宝' },
  { id: 't7', type: 'expense', amount: -120, categoryId: 'health', subcategory: '药品', accountId: 'credit', date: '2026-11-03', note: '药品' },
  { id: 't8', type: 'refund', amount: 68, categoryId: 'shopping', subcategory: '退货退款', accountId: 'wx', date: '2026-11-03', note: '退货退款' },
  { id: 't9', type: 'expense', amount: -3200, categoryId: 'home', subcategory: '房租', accountId: 'cmb', date: '2026-11-02', note: '11 月房租' },
  { id: 't10', type: 'expense', amount: -25, categoryId: 'transport', subcategory: '打车', accountId: 'alipay', date: '2026-11-02', note: '打车' },
  { id: 't11', type: 'expense', amount: -42, categoryId: 'food', subcategory: '晚餐', accountId: 'wx', date: '2026-11-02', note: '晚餐' },
  { id: 't12', type: 'adjust', amount: -12.5, categoryId: 'correction', subcategory: '余额修正', accountId: 'cash', date: '2026-11-02', note: '现金余额修正' },
  { id: 't13', type: 'income', amount: 18000, categoryId: 'salary', subcategory: '10 月工资', accountId: 'cmb', date: '2026-11-01', note: '10 月工资' },
  { id: 't14', type: 'income', amount: 320, categoryId: 'reimburse', subcategory: '差旅报销', accountId: 'wx', date: '2026-11-01', note: '差旅报销' },
  { id: 't15', type: 'expense', amount: -199, categoryId: 'education', subcategory: '在线课程', accountId: 'alipay', date: '2026-11-01', note: '在线课程' },
  { id: 't16', type: 'transfer', amount: -500, categoryId: 'withdraw', subcategory: '取现', accountId: 'cmb', toAccountId: 'cash', date: '2026-11-01', note: 'ATM 取现' },
]

export const MONTH_SUMMARY = {
  expense: 5432.6,
  income: 18320,
  streakDays: 12,
}

export function findAccount(accounts: Account[], id: string | undefined): Account | undefined {
  return accounts.find((account) => account.id === id)
}

export function findCategory(categories: Category[], id: string): Category | undefined {
  return categories.find((category) => category.id === id)
}
