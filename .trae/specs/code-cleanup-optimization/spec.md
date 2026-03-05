# 代码清理优化 Spec

## Why
项目中存在冗余代码，包括未使用的函数、变量、导入、重复代码逻辑和未使用的文件。这些冗余代码增加了维护成本，降低了代码可读性。

## What Changes
- 删除后端未使用的函数（`createError`, `badRequest`）
- 删除后端未使用的变量（`period`）
- 删除后端冗余文件（`report-cashflow.ts`）
- 删除前端未使用的导入（`WalletOutlined`, `Account`）
- 删除前端未使用的 Store 函数（`addAccountCategory`, `updateAccountCategory`, `deleteAccountCategory`）
- 删除前端未使用的 API 方法（8个）
- 提取公共工具函数（`buildTree`, `buildTreeData`）
- 提取公共业务逻辑（`handleCashEquivalentChange`）

## Impact
- Affected code: 
  - `backend/src/middleware/error.ts`
  - `backend/src/utils/response.ts`
  - `backend/src/routes/analytics.ts`
  - `backend/src/routes/report-cashflow.ts`
  - `backend/src/routes/account-category.ts`
  - `backend/src/routes/category.ts`
  - `frontend/src/components/AccountCategoryModal.tsx`
  - `frontend/src/pages/Reports.tsx`
  - `frontend/src/stores/index.ts`
  - `frontend/src/services/api.ts`
  - `frontend/src/components/TransactionCategoryModal.tsx`
  - `frontend/src/pages/Transactions.tsx`
  - `frontend/src/components/CashFlowConfigModal.tsx`

## ADDED Requirements

### Requirement: 公共工具函数
系统 SHALL 提供公共工具函数以减少代码重复。

#### Scenario: 树形数据构建
- **WHEN** 需要将扁平数据转换为树形结构
- **THEN** 使用公共的 `buildTree` 函数

### Requirement: 公共业务逻辑
系统 SHALL 将重复的业务逻辑提取到公共模块。

#### Scenario: 现金等价物切换
- **WHEN** 需要切换账户分类的现金等价物状态
- **THEN** 使用 Store 中的公共方法

## REMOVED Requirements

### Requirement: 未使用的函数
**Reason**: 从未被调用，增加维护成本
**Migration**: 直接删除

### Requirement: 未使用的变量
**Reason**: 解构后从未使用
**Migration**: 从解构中移除

### Requirement: 未使用的导入
**Reason**: 导入后从未使用
**Migration**: 删除导入语句

### Requirement: 冗余文件
**Reason**: 文件内容不完整且未注册到路由
**Migration**: 删除整个文件
