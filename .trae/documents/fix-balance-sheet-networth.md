# 修复资产负债表净资产计算逻辑问题

## 问题分析

### 当前代码

```typescript
// 资产 = 资产账户余额之和
const assets = accountBalances
  .filter(a => a.type === 'asset')
  .reduce((sum, a) => sum + a.balance, 0)

// 负债 = 负债账户余额之和的绝对值（负债账户余额为负数）
const liabilitiesBalance = accountBalances
  .filter(a => a.type === 'liability')
  .reduce((sum, a) => sum + a.balance, 0)
const liabilities = Math.abs(liabilitiesBalance)

// 净资产 = 资产 + 负债余额（负债为负数，加法相当于减法）
const netWorth = assets + liabilitiesBalance  // ❌ 错误
```

### 问题

1. **净资产计算错误**
   - 当前逻辑：`净资产 = 资产 + 负债余额`
   - 问题：假设负债余额为负数，但如果负债余额为正数，计算就会出错
   - 正确逻辑：`净资产 = 资产 - 负债绝对值`

2. **注释误导**
   - 注释说"负债账户余额为负数"，但这不是必然的
   - 负债账户的余额取决于初始余额和交易记录

### 示例

假设：
- 资产账户余额：10000
- 负债账户余额：-5000（信用卡欠款）

当前计算：
- `assets = 10000`
- `liabilitiesBalance = -5000`
- `liabilities = 5000`
- `netWorth = 10000 + (-5000) = 5000` ✅ 看似正确

但如果负债账户余额为正数（用户输入错误或数据问题）：
- `liabilitiesBalance = 5000`
- `liabilities = 5000`
- `netWorth = 10000 + 5000 = 15000` ❌ 错误！

正确计算：
- `netWorth = assets - liabilities = 10000 - 5000 = 5000` ✅ 正确

## 解决方案

修改净资产计算逻辑：

```typescript
// 净资产 = 资产 - 负债
const netWorth = assets - liabilities
```

## 文件变更

| 文件 | 操作 |
|------|------|
| `backend/src/routes/report.ts` | 修改资产负债表净资产计算 |
