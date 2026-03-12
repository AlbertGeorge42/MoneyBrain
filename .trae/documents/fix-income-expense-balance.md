# 修复收入支出表期初期末计算逻辑问题

## 问题分析

### 已确认的问题

1. **退款交易未处理**
   - `calculateBalanceAtDate` 函数没有处理 `refund` 类型交易
   - 退款应该增加余额（类似收入）

2. **手续费和优惠券未处理**
   - 交易有 `fee` 和 `coupon` 字段
   - 计算余额时没有考虑这些字段的影响

3. **净资产计算错误**
   - 当前逻辑：`净资产 = 资产 + 负债余额`
   - 问题：负债账户余额为负值时，计算正确；但负债账户余额为正值时（如信用卡欠款），计算错误
   - 正确逻辑：`净资产 = 资产 - 负债绝对值`

### 当前计算逻辑

#### calculateBalanceAtDate 函数
```typescript
fromTransactions.forEach(t => {
  if (t.type === 'income') {
    balance += t.amount.toNumber()  // 收入增加余额
  } else if (t.type === 'expense') {
    balance -= t.amount.toNumber()  // 支出减少余额
  } else if (t.type === 'transfer') {
    balance -= t.amount.toNumber()  // 转出减少余额
  }
  // ❌ 缺少 refund 处理
  // ❌ 缺少 fee 和 coupon 处理
})
```

#### 净资产计算
```typescript
// 当前逻辑
const startNetWorth = startAssets + startLiabilitiesBalance  // ❌ 错误
const endNetWorth = endAssets + endLiabilitiesBalance        // ❌ 错误

// 正确逻辑
const startNetWorth = startAssets - startLiabilities         // ✅ 正确
const endNetWorth = endAssets - endLiabilities               // ✅ 正确
```

## 解决方案

### 1. 修改 calculateBalanceAtDate 函数

```typescript
fromTransactions.forEach(t => {
  const amount = t.amount.toNumber()
  const fee = t.fee?.toNumber() || 0
  const coupon = t.coupon?.toNumber() || 0
  
  if (t.type === 'income') {
    // 收入：余额 += 金额 - 手续费 + 优惠券
    balance += amount - fee + coupon
  } else if (t.type === 'expense') {
    // 支出：余额 -= 金额 + 手续费 - 优惠券
    balance -= amount + fee - coupon
  } else if (t.type === 'transfer') {
    // 转出：余额 -= 金额 + 手续费 - 优惠券
    balance -= amount + fee - coupon
  } else if (t.type === 'refund') {
    // 退款：余额 += 金额 - 手续费
    balance += amount - fee
  }
})

// 处理转入方交易
toTransactions.forEach(t => {
  const amount = t.amount.toNumber()
  const fee = t.fee?.toNumber() || 0
  const coupon = t.coupon?.toNumber() || 0
  
  if (t.type === 'transfer') {
    // 转入：余额 += 金额 - 手续费 + 优惠券
    balance += amount - fee + coupon
  }
})
```

### 2. 修改净资产计算

```typescript
// 期初净资产 = 资产 - 负债
const startNetWorth = startAssets - startLiabilities

// 期末净资产 = 资产 - 负债
const endNetWorth = endAssets - endLiabilities
```

## 文件变更

| 文件 | 操作 |
|------|------|
| `backend/src/routes/report.ts` | 修改 `calculateBalanceAtDate` 函数和净资产计算 |
