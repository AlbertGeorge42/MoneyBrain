# 修复总负债计算问题

## 问题描述
当前无法正确计算总负债，需要诊断并修复问题。

## 问题分析

### 发现的问题

#### 核心问题：负债账户余额计算逻辑错误

在 `calculateBalanceAtDate` 函数中，对负债账户的处理逻辑有误：

**当前逻辑（对所有账户统一处理）**：
- 收入 → 增加余额
- 支出 → 减少余额

**正确逻辑**：
- **资产账户**：
  - 收入 → 增加余额 ✅
  - 支出 → 减少余额 ✅
- **负债账户**：
  - 收入（如还款）→ 减少负债余额
  - 支出（如借款）→ 增加负债余额

#### 具体场景示例
1. 信用卡（负债账户）还款：
   - 从银行账户支出 1000 元 → 银行余额减少 1000
   - 信用卡账户收入 1000 元 → 信用卡负债应减少 1000（而非增加）

2. 借款（负债账户）：
   - 收到借款 → 负债账户余额应增加

## 实施步骤

### Step 1: 修复 calculateBalanceAtDate 函数
根据账户类型区分处理逻辑：
- 资产账户：收入增加，支出减少
- 负债账户：收入减少，支出增加

### Step 2: 修复转账交易处理
转账交易也需要根据账户类型处理：
- 资产账户转出 → 减少余额
- 负债账户转出 → 增加负债余额
- 资产账户转入 → 增加余额
- 负债账户转入 → 减少负债余额

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/routes/report.ts` | 修复 | 修复负债账户余额计算逻辑 |

## 详细修改

### calculateBalanceAtDate 函数修改

```typescript
async function calculateBalanceAtDate(accountId: string, targetDate: Date): Promise<number> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
  })
  if (!account) return 0

  // 如果目标日期在初始余额日期之前，返回0
  if (account.initialBalanceDate && targetDate < account.initialBalanceDate) {
    return 0
  }

  const startDate = account.initialBalanceDate || new Date(0)
  const startBalance = account.initialBalance.toNumber()
  const isLiability = account.type === 'liability'

  // 查询交易
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

  // 处理转出方交易
  fromTransactions.forEach(t => {
    if (isLiability) {
      // 负债账户：收入减少负债，支出增加负债
      if (t.type === 'income') {
        balance -= t.amount.toNumber()
      } else if (t.type === 'expense') {
        balance += t.amount.toNumber()
      } else if (t.type === 'transfer') {
        balance += t.amount.toNumber()  // 转出增加负债
      }
    } else {
      // 资产账户：收入增加，支出减少
      if (t.type === 'income') {
        balance += t.amount.toNumber()
      } else if (t.type === 'expense') {
        balance -= t.amount.toNumber()
      } else if (t.type === 'transfer') {
        balance -= t.amount.toNumber()  // 转出减少资产
      }
    }
  })

  // 处理转入方交易
  toTransactions.forEach(t => {
    if (t.type === 'transfer') {
      if (isLiability) {
        balance -= t.amount.toNumber()  // 转入减少负债
      } else {
        balance += t.amount.toNumber()  // 转入增加资产
      }
    }
  })

  return balance
}
```

## 验证清单
- [ ] 负债账户余额计算正确
- [ ] 资产账户余额计算正确
- [ ] 转账交易对双方账户影响正确
- [ ] 总负债显示正确
- [ ] 净资产计算正确
