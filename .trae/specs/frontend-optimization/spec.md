# 前端页面优化与图表可视化 Spec

## Why
当前 Reports 页面的三个报表仅使用表格和统计卡片展示数据，缺乏直观的可视化图表。需要优化页面布局并添加图表展示，提升用户体验和数据洞察力。

## What Changes
- 优化 Reports.tsx 页面布局，添加图表展示区域
- 为资产负债表添加资产结构环形图和净资产折线图
- 为收入支出表添加收支对比柱状图和分类环形图
- 为现金流量表添加三类现金流柱状图和桑基图
- 抽取公共图表组件，提高代码复用性

## Impact
- Affected code:
  - `frontend/src/pages/Reports.tsx` - 主要修改
  - `frontend/src/components/charts/` - 新建图表组件目录

## ADDED Requirements

### Requirement: 资产负债表图表
系统 SHALL 为资产负债表提供以下图表展示：

#### Scenario: 资产结构环形图
- **WHEN** 用户查看资产负债表
- **THEN** 显示资产分类占比的环形图

#### Scenario: 净资产折线图
- **WHEN** 用户查看资产负债表
- **THEN** 显示近6个月净资产变化趋势

### Requirement: 收入支出表图表
系统 SHALL 为收入支出表提供以下图表展示：

#### Scenario: 收入vs支出柱状图
- **WHEN** 用户查看收入支出表
- **THEN** 显示收入与支出的对比柱状图

#### Scenario: 分类环形图
- **WHEN** 用户查看收入支出表
- **THEN** 分别显示收入和支出的分类占比环形图

### Requirement: 现金流量表图表
系统 SHALL 为现金流量表提供以下图表展示：

#### Scenario: 三类现金流柱状图
- **WHEN** 用户查看现金流量表
- **THEN** 显示经营/投资/筹资三类现金流的对比柱状图

#### Scenario: 现金流量桑基图
- **WHEN** 用户查看现金流量表
- **THEN** 显示现金流入流出的桑基图

## MODIFIED Requirements

### Requirement: 页面布局优化
系统 SHALL 优化报表页面布局，采用"上图表下表格"或"左图表右表格"的双栏布局，提升数据可视化效果。
