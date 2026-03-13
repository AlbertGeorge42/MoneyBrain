# 修改账户类型后数据显示更新计划

## 问题分析

### 当前问题
用户手动修改账户类型后，数据显示不会对应正确更新。

### 原因分析
账户类型只影响**显示逻辑**，不影响**余额计算**：
- 余额计算：所有账户类型使用相同的计算逻辑（收入增加、支出减少）
- 显示逻辑：根据账户类型决定如何显示余额

### 核心公式
```
总资产 = ∑(type === 'asset' 的账户余额)
总负债 = |∑(type === 'liability' 的账户余额)|
净资产 = ∑(所有账户余额) = 总资产 + 负债账户余额之和
```

**关键点**：净资产 = 所有账户余额之和，与账户类型无关。

### 当前代码流程
1. `AccountCategoryModal` 调用 `updateAccount()` 更新账户
2. `updateAccount()` 调用 `fetchAccounts()` 重新获取账户列表
3. Dashboard 使用 `accounts` 计算总资产、总负债、净资产

### 可能的问题
1. Dashboard 没有响应 `accounts` 的变化
2. Reports 页面使用后端 API，需要重新请求
3. 显示逻辑中 `nodeType` 没有正确传递

## 实施步骤

### 第一步：检查 Dashboard 响应式更新
文件：`frontend/src/pages/Dashboard.tsx`

检查 `accounts` 是否正确响应式更新：
- 使用 `useStore` 获取 `accounts`
- 计算逻辑应该在组件渲染时重新执行

### 第二步：检查 Reports 页面刷新
文件：`frontend/src/pages/Reports.tsx`

Reports 使用后端 API `reportApi.getBalanceSheet()`：
- 确保账户更新后重新请求报表数据
- 或者添加刷新机制

### 第三步：检查 AccountCategoryModal 刷新逻辑
文件：`frontend/src/components/AccountCategoryModal.tsx`

确保账户更新后：
1. 调用 `fetchAccounts()` 刷新账户列表
2. 如果在 Reports 页面，触发报表数据刷新

### 第四步：检查余额显示逻辑
文件：`frontend/src/utils/formatBalance.ts`

确保 `formatBalance` 函数正确接收账户类型参数。

### 第五步：检查后端报表 API
文件：`backend/src/routes/report.ts`

确保报表 API 正确根据账户类型计算。

## 文件变更清单

| 文件 | 操作 |
|------|------|
| `frontend/src/pages/Dashboard.tsx` | 检查响应式更新 |
| `frontend/src/pages/Reports.tsx` | 添加刷新机制 |
| `frontend/src/components/AccountCategoryModal.tsx` | 确保刷新逻辑正确 |

## 验证方法

1. 创建一个资产账户，余额 1000
2. 在 Dashboard 查看总资产、总负债、净资产
3. 修改账户类型为负债
4. 验证：
   - 总资产减少 1000
   - 总负债增加 1000（显示为正数）
   - 净资产不变
5. 在 Reports 页面验证资产负债表正确更新
