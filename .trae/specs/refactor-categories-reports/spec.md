# 分类管理与报表重构 Spec

## Why
当前分类管理和账户管理存在功能重复，用户需要在多个页面间切换才能完成设置。希望通过整合到报表页面，通过弹窗方式完成相关设置，提升用户体验。同时增强报表功能：资产负债表支持按月查看和手动校准，现金流量表按活动类型分类。

## What Changes
- 移除独立的"分类管理"页面
- 在三种报表页面卡片右上角添加弹窗设置功能：
  - 资产负债表：弹窗管理账户分类和账户，支持手动校准月度数据
  - 收入支出表：弹窗管理收支分类
  - 现金流量表：弹窗管理现金等价物配置和活动类型
- 资产负债表添加月份选择器
- 现金流量表按经营活动、投资活动、筹资活动分类
- 数据库模型添加现金流活动类型字段和资产负债快照表

## Impact
- Affected specs: 分类管理模块、报表模块
- Affected code:
  - 前端: 移除 CategoriesManage 页面，重构 Reports 页面，修改导航
  - 后端: 修改现金流量表 API，添加活动类型支持，添加资产负债快照 API

## ADDED Requirements

### Requirement: 报表页面弹窗设置
系统应在报表页面卡片右上角提供弹窗设置功能，方便用户快速管理相关数据。

#### Scenario: 资产负债表设置
- **WHEN** 用户在资产负债表卡片右上角点击"设置"按钮
- **THEN** 系统显示弹窗，包含账户分类管理和账户管理两个标签页

#### Scenario: 收入支出表设置
- **WHEN** 用户在收入支出表卡片右上角点击"设置"按钮
- **THEN** 系统显示弹窗，包含收入分类和支出分类管理

#### Scenario: 现金流量表设置
- **WHEN** 用户在现金流量表卡片右上角点击"设置"按钮
- **THEN** 系统显示弹窗，可配置现金等价物和活动类型

### Requirement: 资产负债表按月查看
系统应支持资产负债表按月份查看历史数据。

#### Scenario: 选择月份
- **WHEN** 用户选择某个月份
- **THEN** 系统显示该月最后一天的资产负债状况

### Requirement: 资产负债手动校准
系统应支持用户手动录入每月的资产负债准确数值。

#### Scenario: 手动校准数据
- **WHEN** 用户点击"校准"按钮并输入某月的资产负债数值
- **THEN** 系统保存该月的手动校准数据

#### Scenario: 查看校准数据
- **WHEN** 用户查看已校准的月份
- **THEN** 系统优先显示手动校准的数据，并标记为"已校准"

### Requirement: 现金流量表活动分类
系统应将现金流量按经营活动、投资活动、筹资活动分类展示。

#### Scenario: 查看分类现金流
- **WHEN** 用户查看现金流量表
- **THEN** 系统分别展示经营、投资、筹资三类活动的现金流

#### Scenario: 配置分类活动类型
- **WHEN** 用户为收支分类配置现金流活动类型
- **THEN** 该分类下的交易将归类到对应活动类型

## MODIFIED Requirements

### Requirement: 收支分类模型
Category 模型需新增字段：
- `cashFlowType`: String? - 现金流活动类型 ('operating' | 'investing' | 'financing')

### Requirement: 新增资产负债快照模型
BalanceSnapshot 模型：
- `id`: String
- `month`: String - 月份 (YYYY-MM格式)
- `accountId`: String - 账户ID
- `balance`: Decimal - 手动校准的余额
- `isManual`: Boolean - 是否手动校准
- `createdAt`: DateTime
- `updatedAt`: DateTime

### Requirement: 页面导航
主导航菜单需调整：
- 移除"分类管理"菜单项
- 保留账户管理页面（用于快速查看账户列表和余额）

## REMOVED Requirements

### Requirement: 独立的分类管理页面
**Reason**: 整合到报表页面的弹窗中
**Migration**: 删除 CategoriesManage.tsx 页面
