# 后端接口优化与整理 Spec

## Why
后端接口存在路由顺序错误、代码重复、部分接口缺失等问题，需要修复和整理以提高代码质量和可维护性。

## What Changes
- 修复路由顺序错误（`/sort/batch` 路由需在 `/:id` 之前定义）
- 补充缺失的批量创建余额快照接口
- 提取公共函数 `buildTree` 到工具模块
- 删除未使用的代码

## Impact
- Affected code:
  - `backend/src/routes/account-category.ts` - 修复路由顺序
  - `backend/src/routes/category.ts` - 修复路由顺序
  - `backend/src/routes/balance-snapshot.ts` - 添加批量创建接口
  - `backend/src/utils/tree.ts` - 新建公共函数

## ADDED Requirements

### Requirement: 批量创建余额快照
系统 SHALL 提供批量创建余额快照的接口，支持一次性创建多个账户的余额快照。

#### Scenario: 批量创建
- **WHEN** 前端调用 `POST /balance-snapshots/batch`
- **THEN** 系统批量创建或更新指定月份的余额快照

### Requirement: 公共树形构建函数
系统 SHALL 提供公共的树形数据构建函数，避免代码重复。

## MODIFIED Requirements

### Requirement: 路由定义顺序
系统 SHALL 确保具体路径的路由定义在参数路径之前，- `PUT /sort/batch` 必须在 `PUT /:id` 之前定义

## REMOVED Requirements

### Requirement: 重复的 buildTree 函数
**Reason**: 代码重复，应提取到公共模块
**Migration**: 使用 `utils/tree.ts` 中的公共函数
