# 统一账户余额显示逻辑计划

## 问题分析

### 当前显示逻辑问题

当前代码中余额显示逻辑不一致：
1. `AccountCategoryModal.tsx:378`: `balance >= 0 ? '#3f8600' : '#cf1322'`
2. `Transactions.tsx:646`: 直接显示 `a.balance.toFixed(2)`
3. `Reports.tsx:749`: 直接显示 `account.calculatedBalance?.toFixed(2)`

### 新的显示逻辑

| 账户类型 | 余额 | 显示 | 颜色 | 含义 |
|---------|------|------|------|------|
| 资产账户 | 10000 | ¥10000 | 绿色 | 正常（有钱） |
| 资产账户 | -1000 | ¥-1000 | 红色 | 透支 |
| 负债账户 | -5000 | ¥5000 | 红色 | 正常欠款 |
| 负债账户 | 1000 | ¥-1000 | 绿色 | 多还款（债权人欠你） |

### 显示逻辑规则

1. **资产账户**：
   - 余额 >= 0：绿色，显示正数
   - 余额 < 0：红色，显示负数（透支）

2. **负债账户**：
   - 余额 <= 0：红色，显示绝对值（正常欠款）
   - 余额 > 0：绿色，显示负数（多还款）

## 实施步骤

### 第一阶段：创建统一格式化函数

1. 在 `frontend/src/utils/` 创建 `formatBalance.ts`
2. 实现统一的余额显示逻辑

### 第二阶段：修改各处显示代码

1. `AccountCategoryModal.tsx` - 账户编辑弹窗
2. `Transactions.tsx` - 交易页面账户选择
3. `Reports.tsx` - 报表页面
4. `Dashboard.tsx` - 仪表盘页面

### 第三阶段：修改后端账户创建逻辑

1. 移除负债账户自动转负数的逻辑
2. 允许资产和负债账户输入任意正负数

## 文件变更

| 文件 | 操作 |
|------|------|
| `frontend/src/utils/formatBalance.ts` | 新建：统一格式化函数 |
| `frontend/src/components/AccountCategoryModal.tsx` | 修改：使用统一格式化 |
| `frontend/src/pages/Transactions.tsx` | 修改：使用统一格式化 |
| `frontend/src/pages/Reports.tsx` | 修改：使用统一格式化 |
| `frontend/src/pages/Dashboard.tsx` | 修改：使用统一格式化 |
| `backend/src/routes/account.ts` | 修改：移除自动转负数逻辑 |
