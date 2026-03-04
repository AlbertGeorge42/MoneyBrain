# 账户初始余额时间点与报表计算优化

## 目标
1. 添加账户初始余额对应的时间点
2. 支持回溯计算历史余额
3. 修复三种报表的计算错误（特别是转账交易的处理）

## 问题分析

### 1. 账户初始余额问题
**当前问题**：
- Account 模型只有 `balance` 字段，没有记录初始余额的时间点
- 计算历史余额时，假设当前余额是"最终余额"，然后减去后续交易推算
- 用户无法指定初始余额对应的时间点

**改进方案**：
- 添加 `initialBalance` 字段（初始余额）
- 添加 `initialBalanceDate` 字段（初始余额日期）
- 计算逻辑：从初始余额日期开始，累加该日期之后的交易

### 2. 转账交易计算问题
**当前问题**：
- `calculateBalanceAtDate` 只查询 `accountId`，没有考虑 `toAccountId`
- 转账交易对转入账户的影响被忽略

**改进方案**：
- 查询账户余额时，同时考虑作为转出方和转入方的交易
- 转出：减少余额
- 转入：增加余额

### 3. 现金流量表问题
**当前问题**：
- 只考虑了现金账户作为交易发起方的记录
- 转账到现金账户的记录被忽略

**改进方案**：
- 同时查询现金账户作为 `accountId` 和 `toAccountId` 的交易

## 实施步骤

### Step 1: 数据库模型修改
- Account 模型添加 `initialBalance` 字段
- Account 模型添加 `initialBalanceDate` 字段

### Step 2: 后端计算逻辑重构
- 重写 `calculateBalanceAtDate` 函数
- 正确处理转账交易
- 支持从初始余额日期开始计算

### Step 3: 前端账户管理修改
- 添加账户时填写初始余额和日期
- 编辑账户时可以修改初始余额和日期

### Step 4: 数据迁移
- 现有账户的初始余额设为当前余额
- 初始余额日期设为创建日期

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/prisma/schema.prisma` | 修改 | 添加 initialBalance、initialBalanceDate 字段 |
| `backend/src/routes/report.ts` | 重构 | 修复计算逻辑 |
| `backend/src/routes/account.ts` | 修改 | 支持新字段 |
| `frontend/src/services/api.ts` | 修改 | 更新类型定义 |
| `frontend/src/components/AccountCategoryModal.tsx` | 修改 | 添加初始余额日期输入 |

## 详细设计

### 1. 数据库模型修改

```prisma
model Account {
  id                  String            @id @default(uuid())
  name                String
  type                String
  balance             Decimal           @default(0)  // 当前余额（实时更新）
  initialBalance      Decimal           @default(0)  // 初始余额
  initialBalanceDate  DateTime?         // 初始余额日期
  icon                String?
  cashFlowType        String?
  categoryId          String?
  // ... 其他字段
}
```

### 2. 余额计算逻辑

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

  // 获取初始余额和日期
  const startDate = account.initialBalanceDate || new Date(0)
  const startBalance = account.initialBalance.toNumber()

  // 查询该账户作为转出方的交易（收入、支出、转账转出）
  const fromTransactions = await prisma.transaction.findMany({
    where: {
      accountId,
      date: { gte: startDate, lt: targetDate },
    },
  })

  // 查询该账户作为转入方的交易（转账转入）
  const toTransactions = await prisma.transaction.findMany({
    where: {
      toAccountId: accountId,
      date: { gte: startDate, lt: targetDate },
    },
  })

  let balance = startBalance

  // 处理转出方交易
  fromTransactions.forEach(t => {
    if (t.type === 'income') {
      balance += t.amount.toNumber()
    } else if (t.type === 'expense') {
      balance -= t.amount.toNumber()
    } else if (t.type === 'transfer') {
      balance -= t.amount.toNumber()  // 转出减少余额
    }
  })

  // 处理转入方交易
  toTransactions.forEach(t => {
    balance += t.amount.toNumber()  // 转入增加余额
  })

  return balance
}
```

### 3. 前端表单字段

```
新增账户表单：
- 账户名称（必填）
- 账户类型（必选：资产/负债）
- 初始余额（必填，默认0）
- 初始余额日期（必选，默认当天）
- 所属分类（可选）
- 现金流量活动类型（可选）
- 图标（可选）
```

### 4. 数据迁移策略

现有账户迁移：
- `initialBalance` = 当前 `balance`
- `initialBalanceDate` = `createdAt`

这样确保现有数据不受影响，计算结果与之前一致。

## 验证清单
- [ ] 数据库模型修改成功
- [ ] 现有数据迁移正确
- [ ] 新账户可以设置初始余额和日期
- [ ] 余额计算正确处理转账交易
- [ ] 资产负债表计算正确
- [ ] 收入支出表计算正确
- [ ] 现金流量表计算正确
- [ ] 回溯计算历史余额正确
- [ ] 前端编译无错误
