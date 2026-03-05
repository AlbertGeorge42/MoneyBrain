# 代码清理优化检查清单

## 后端清理

- [x] `createError` 函数已从 `error.ts` 中删除
- [x] `badRequest` 函数已从 `response.ts` 中删除
- [x] `period` 变量已从 `analytics.ts` 中删除
- [x] `report-cashflow.ts` 冗余文件已删除

## 前端清理

- [x] `WalletOutlined` 未使用导入已从 `AccountCategoryModal.tsx` 中删除
- [x] `Account` 未使用类型导入已从 `Reports.tsx` 中删除
- [x] `addAccountCategory` 未使用函数已从 Store 中删除
- [x] `updateAccountCategory` 未使用函数已从 Store 中删除
- [x] `deleteAccountCategory` 未使用函数已从 Store 中删除
- [x] 未使用的 API 方法已从 `api.ts` 中删除

## 代码重构

- [x] `buildTreeData` 公共函数已创建
- [x] `TransactionCategoryModal.tsx` 已使用公共函数
- [x] `Transactions.tsx` 已使用公共函数
- [x] `updateAccountCategoryCashEquivalent` 方法已添加到 Store
- [x] `AccountCategoryModal.tsx` 已使用 Store 方法
- [x] `CashFlowConfigModal.tsx` 已使用 Store 方法

## 验证

- [x] 后端 `npm run typecheck` 通过
- [x] 前端 `npm run typecheck` 通过（存在预存问题，非本次修改引入）
- [x] 代码已提交并推送到远程仓库
