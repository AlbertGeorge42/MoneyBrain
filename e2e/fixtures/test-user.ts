/**
 * E2E 测试用户夹具
 * 定义测试场景中使用的标准用户数据
 */

export const testUser = {
  accountCategories: [
    { name: '现金账户', type: 'asset' },
    { name: '投资账户', type: 'asset' },
    { name: '负债账户', type: 'liability' },
  ],
  accounts: [
    { name: '工资卡', type: 'asset', balance: 10000 },
    { name: '支付宝', type: 'asset', balance: 5000 },
    { name: '信用卡', type: 'liability', balance: -2000 },
  ],
  transactionCategories: [
    { name: '餐饮', type: 'expense' },
    { name: '交通', type: 'expense' },
    { name: '工资', type: 'income' },
    { name: '理财收益', type: 'income' },
  ],
  transactions: [
    { type: 'income', amount: 15000, note: '月工资' },
    { type: 'expense', amount: 50, note: '早餐' },
    { type: 'expense', amount: 30, note: '地铁' },
  ],
}
