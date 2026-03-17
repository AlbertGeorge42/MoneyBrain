# 代码可维护性增强重构 Spec

## Why
当前项目存在部分文件过大、代码重复和命名风格不一致的问题，影响代码可读性和可维护性。通过适度拆分大文件、删除冗余代码和统一命名风格，提升代码质量。

## What Changes
- 拆分前端 `Transactions.tsx`，提取模态框组件到独立文件
- 拆分前端 `Reports.tsx`，提取报表组件到独立文件
- 拆分后端 `transaction.ts`，提取交易服务逻辑
- 拆分后端 `report.ts`，提取报表服务逻辑
- 删除冗余代码，合并相似逻辑
- 统一文件命名风格（kebab-case 用于 API 路由，PascalCase 用于组件）

## Impact
- Affected specs: 无破坏性变更
- Affected code: 
  - `frontend/src/pages/Transactions.tsx`
  - `frontend/src/pages/Reports.tsx`
  - `backend/src/routes/transaction.ts`
  - `backend/src/routes/report.ts`

## ADDED Requirements

### Requirement: 前端组件拆分
系统 SHALL 将大型页面组件拆分为更小的可复用组件，每个组件职责单一。

#### Scenario: 拆分 Transactions.tsx
- **WHEN** Transactions.tsx 包含多个模态框组件
- **THEN** 将收支模态框、转账模态框、退款模态框提取到独立组件文件

#### Scenario: 拆分 Reports.tsx
- **WHEN** Reports.tsx 包含三个报表渲染函数
- **THEN** 将资产负债表、收支表、现金流量表提取到独立组件文件

### Requirement: 后端服务拆分
系统 SHALL 将复杂路由逻辑拆分到服务层，保持路由文件简洁。

#### Scenario: 拆分 transaction.ts
- **WHEN** transaction.ts 包含复杂的交易创建/更新/删除逻辑
- **THEN** 将交易业务逻辑提取到 transaction.service.ts

#### Scenario: 拆分 report.ts
- **WHEN** report.ts 包含复杂的报表生成逻辑
- **THEN** 将报表生成逻辑提取到 report.service.ts

### Requirement: 命名风格统一
系统 SHALL 遵循统一的文件命名规范。

#### Scenario: 前端组件命名
- **WHEN** 创建新的 React 组件文件
- **THEN** 使用 PascalCase 命名（如 `TransactionModal.tsx`）

#### Scenario: 后端路由命名
- **WHEN** 创建新的 API 路由文件
- **THEN** 使用 kebab-case 命名（如 `transaction.ts`）

## MODIFIED Requirements
无

## REMOVED Requirements
无
