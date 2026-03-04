# 修复负债计算：初始负债账户填写负值

## 问题描述
当前总负债计算仍然存在错误，用户希望负债账户初始余额填写负值，更直观地表示负债。

## 问题分析

### 当前逻辑问题
1. **初始余额填写正值**：负债账户初始余额填写正值（如 5000），计算时需要特殊处理
2. **计算逻辑复杂**：收入减少负债，支出增加负债，与资产账户相反
3. **容易混淆**：用户难以理解为什么收入会减少账户余额

### 改进方案
**负债账户初始余额填写负值**：
- 信用卡欠款 5000 元 → 初始余额填写 `-5000`
- 这样所有账户的计算逻辑统一：
  - 收入 → 增加余额
  - 支出 → 减少余额

### 计算示例
| 场景 | 资产账户 | 负债账户 |
|------|---------|---------|
| 初始余额 | 10000 | -5000 |
| 收入 1000 | 10000 + 1000 = 11000 | -5000 + 1000 = -4000（负债减少）|
| 支出 1000 | 10000 - 1000 = 9000 | -5000 - 1000 = -6000（负债增加）|

### 报表计算
- **总资产** = 所有资产账户余额之和（正值）
- **总负债** = 所有负债账户余额之和的绝对值（因为负债是负数）
- **净资产** = 总资产 + 总负债（因为负债是负数，加法相当于减法）

## 实施步骤

### Step 1: 修改 calculateBalanceAtDate 函数
统一资产和负债账户的计算逻辑，不再区分

### Step 2: 修改资产负债表计算
- 总负债 = 负债账户余额绝对值之和
- 净资产 = 总资产 + 总负债余额（负债为负数）

### Step 3: 修改收入支出表计算
同样调整负债计算逻辑

### Step 4: 修改现金流量表计算
同样调整负债计算逻辑

### Step 5: 修改交易创建/更新/删除逻辑
统一处理资产和负债账户的余额变化

### Step 6: 前端提示
添加提示说明负债账户初始余额应填写负值

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/routes/report.ts` | 修改 | 统一计算逻辑 |
| `backend/src/routes/transaction.ts` | 修改 | 统一余额更新逻辑 |
| `frontend/src/components/AccountCategoryModal.tsx` | 修改 | 添加提示说明 |

## 详细修改

### 1. calculateBalanceAtDate 函数修改

```typescript
async function calculateBalanceAtDate(accountId: string, targetDate: Date): Promise<number> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
  })
  if (!account) return 0

  if (account.initialBalanceDate && targetDate < account.initialBalanceDate) {
    return 0
  }

  const startDate = account.initialBalanceDate || new Date(0)
  const startBalance = account.initialBalance.toNumber()

  const fromTransactions = await prisma.transaction.findMany({
    where: {
      accountId,
      date: { gte: startDate, lt: targetDate },
    },
  })

  const toTransactions = await prisma.transaction.findMany({
    where: {
      toAccountId: accountId,
      date: { gte: startDate, lt: targetDate },
    },
  })

  let balance = startBalance

  // 统一计算逻辑：收入增加余额，支出减少余额
  fromTransactions.forEach(t => {
    if (t.type === 'income') {
      balance += t.amount.toNumber()
    } else if (t.type === 'expense') {
      balance -= t.amount.toNumber()
    } else if (t.type === 'transfer') {
      balance -= t.amount.toNumber()  // 转出减少余额
    }
  })

  toTransactions.forEach(t => {
    if (t.type === 'transfer') {
      balance += t.amount.toNumber()  // 转入增加余额
    }
  })

  return balance
}
```

### 2. 资产负债表计算修改

```typescript
const assets = accountBalances
  .filter(a => a.type === 'asset')
  .reduce((sum, a) => sum + a.balance, 0)
const liabilities = Math.abs(
  accountBalances
    .filter(a => a.type === 'liability')
    .reduce((sum, a) => sum + a.balance, 0)
)
const netWorth = assets + accountBalances
  .filter(a => a.type === 'liability')
  .reduce((sum, a) => sum + a.balance, 0)  // 负债是负数，加法相当于减法
```

### 3. 交易余额更新逻辑修改

```typescript
// 统一逻辑：收入增加余额，支出减少余额
const balanceChange = type === 'income' 
  ? new Decimal(amount) 
  : new Decimal(amount).neg()
await tx.account.update({
  where: { id: accountId },
  data: { balance: { increment: balanceChange } },
})
```

## 验证清单
- [ ] 负债账户初始余额填写负值
- [ ] 收入增加负债账户余额（负债减少）
- [ ] 支出减少负债账户余额（负债增加）
- [ ] 总负债显示为正数（绝对值）
- [ ] 净资产计算正确
- [ ] 前端提示正确显示
