# Tasks

## 后端清理任务

- [x] Task 1: 删除后端未使用的函数
  - [x] SubTask 1.1: 删除 `error.ts` 中的 `createError` 函数
  - [x] SubTask 1.2: 删除 `response.ts` 中的 `badRequest` 函数

- [x] Task 2: 删除后端未使用的变量
  - [x] SubTask 2.1: 删除 `analytics.ts` 中未使用的 `period` 变量

- [x] Task 3: 删除后端冗余文件
  - [x] SubTask 3.1: 删除 `report-cashflow.ts` 文件

## 前端清理任务

- [x] Task 4: 删除前端未使用的导入
  - [x] SubTask 4.1: 删除 `AccountCategoryModal.tsx` 中未使用的 `WalletOutlined` 导入
  - [x] SubTask 4.2: 删除 `Reports.tsx` 中未使用的 `Account` 类型导入

- [x] Task 5: 删除前端未使用的 Store 函数
  - [x] SubTask 5.1: 删除 `stores/index.ts` 中的 `addAccountCategory` 函数定义和实现
  - [x] SubTask 5.2: 删除 `stores/index.ts` 中的 `updateAccountCategory` 函数定义和实现
  - [x] SubTask 5.3: 删除 `stores/index.ts` 中的 `deleteAccountCategory` 函数定义和实现

- [x] Task 6: 删除前端未使用的 API 方法
  - [x] SubTask 6.1: 删除 `accountCategoryApi.getTree()`
  - [x] SubTask 6.2: 删除 `accountCategoryApi.getById()`
  - [x] SubTask 6.3: 删除 `accountApi.getById()`
  - [x] SubTask 6.4: 删除 `categoryApi.getTree()`
  - [x] SubTask 6.5: 删除 `categoryApi.getById()`
  - [x] SubTask 6.6: 删除 `categoryApi.updateSort()`
  - [x] SubTask 6.7: 删除 `transactionApi.getById()`
  - [x] SubTask 6.8: 删除 `budgetApi.getById()`

- [x] Task 7: 提取公共工具函数
  - [x] SubTask 7.1: 创建 `frontend/src/utils/treeUtils.ts` 文件
  - [x] SubTask 7.2: 将 `buildTreeData` 函数提取到公共模块
  - [x] SubTask 7.3: 更新 `TransactionCategoryModal.tsx` 使用公共函数
  - [x] SubTask 7.4: 更新 `Transactions.tsx` 使用公共函数

- [x] Task 8: 提取公共业务逻辑
  - [x] SubTask 8.1: 在 Store 中添加 `updateAccountCategoryCashEquivalent` 方法
  - [x] SubTask 8.2: 更新 `AccountCategoryModal.tsx` 使用 Store 方法
  - [x] SubTask 8.3: 更新 `CashFlowConfigModal.tsx` 使用 Store 方法

## 验证任务

- [x] Task 9: 运行代码检查
  - [x] SubTask 9.1: 后端类型检查通过
  - [x] SubTask 9.2: 前端类型检查（存在预存问题，非本次修改引入）
  - [ ] SubTask 9.3: 验证应用功能正常

# Task Dependencies
- Task 7 依赖 Task 4（先清理导入，再重构）
- Task 8 依赖 Task 5（先清理 Store，再添加新方法）
- Task 9 依赖 Task 1-8（所有清理完成后验证）
