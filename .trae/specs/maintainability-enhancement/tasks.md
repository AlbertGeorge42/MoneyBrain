# Tasks

## 前端组件拆分

- [x] Task 1: 拆分 Transactions.tsx 模态框组件
  - [x] SubTask 1.1: 创建 `frontend/src/components/transactions/TransactionModal.tsx` 收支记录模态框
  - [x] SubTask 1.2: 创建 `frontend/src/components/transactions/TransferModal.tsx` 转账模态框
  - [x] SubTask 1.3: 创建 `frontend/src/components/transactions/RefundModal.tsx` 退款模态框
  - [x] SubTask 1.4: 创建 `frontend/src/components/transactions/index.ts` 统一导出
  - [x] SubTask 1.5: 更新 `Transactions.tsx` 使用拆分后的组件

- [x] Task 2: 拆分 Reports.tsx 报表组件
  - [x] SubTask 2.1: 创建 `frontend/src/components/reports/BalanceSheet.tsx` 资产负债表组件
  - [x] SubTask 2.2: 创建 `frontend/src/components/reports/IncomeExpenseReport.tsx` 收支表组件
  - [x] SubTask 2.3: 创建 `frontend/src/components/reports/CashFlowReport.tsx` 现金流量表组件
  - [x] SubTask 2.4: 创建 `frontend/src/components/reports/index.ts` 统一导出
  - [x] SubTask 2.5: 更新 `Reports.tsx` 使用拆分后的组件

## 后端服务拆分

- [x] Task 3: 拆分 transaction.ts 服务逻辑
  - [x] SubTask 3.1: 创建 `backend/src/services/transaction.service.ts`
  - [x] SubTask 3.2: 提取交易创建逻辑到服务层
  - [x] SubTask 3.3: 提取交易更新逻辑到服务层
  - [x] SubTask 3.4: 提取交易删除逻辑到服务层
  - [x] SubTask 3.5: 重构 `transaction.ts` 路由使用服务层

- [x] Task 4: 拆分 report.ts 服务逻辑
  - [x] SubTask 4.1: 创建 `backend/src/services/report.service.ts`
  - [x] SubTask 4.2: 提取资产负债表生成逻辑到服务层
  - [x] SubTask 4.3: 提取收支表生成逻辑到服务层
  - [x] SubTask 4.4: 提取现金流量表生成逻辑到服务层
  - [x] SubTask 4.5: 重构 `report.ts` 路由使用服务层

## 代码清理

- [x] Task 5: 清理冗余代码
  - [x] SubTask 5.1: 检查并删除未使用的导入
  - [x] SubTask 5.2: 检查并删除未使用的变量
  - [x] SubTask 5.3: 合并相似的重复代码

## 验证任务

- [x] Task 6: 代码质量验证
  - [x] SubTask 6.1: 前端 `npm run typecheck` 通过
  - [x] SubTask 6.2: 后端 `npm run typecheck` 通过
  - [x] SubTask 6.3: 验证前端功能正常
  - [x] SubTask 6.4: 验证后端 API 正常

# Task Dependencies
- Task 2 依赖 Task 1（前端拆分模式一致）
- Task 4 依赖 Task 3（后端拆分模式一致）
- Task 5 可与 Task 1-4 并行执行
- Task 6 依赖 Task 1-5（所有拆分完成后验证）
