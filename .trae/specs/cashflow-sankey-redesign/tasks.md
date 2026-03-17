# Tasks

## 第一阶段：后端 API 修改

- [x] Task 1: 修改桑基图节点生成逻辑
  - [x] SubTask 1.1: 区分收入分类节点（income_category）和非现金账户来源节点（non_cash_source）
  - [x] SubTask 1.2: 区分支出分类节点（expense_category）和非现金账户去向节点（non_cash_target）
  - [x] SubTask 1.3: 节点按金额降序排列
  - [x] SubTask 1.4: 确保任意时间段都能正确生成数据

## 第二阶段：前端页面修改

- [x] Task 2: 更新 SankeyChart 组件
  - [x] SubTask 2.1: 更新节点颜色配置，支持5种分类标识
  - [x] SubTask 2.2: 更新 TypeScript 类型定义

## 第三阶段：验证

- [x] Task 3: 验证功能
  - [x] SubTask 3.1: 运行后端类型检查
  - [x] SubTask 3.2: 运行前端类型检查
  - [x] SubTask 3.3: 测试桑基图显示（任意时间段）
  - [x] SubTask 3.4: 验证节点排列顺序正确

# Task Dependencies
- Task 2 依赖 Task 1（后端 API 完成后再修改前端）
- Task 3 依赖 Task 1-2（所有修改完成后验证）
