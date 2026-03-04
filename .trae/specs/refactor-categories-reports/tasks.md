# Tasks

- [x] Task 1: 修改数据库模型
  - [x] SubTask 1.1: 在 Category 模型添加 cashFlowType 字段
  - [x] SubTask 1.2: 创建 BalanceSnapshot 模型
  - [x] SubTask 1.3: 执行数据库迁移
  - [x] SubTask 1.4: 更新后端 API 支持新字段

- [x] Task 2: 创建设置弹窗组件
  - [x] SubTask 2.1: 创建 AccountCategoryModal 组件（账户分类管理）
  - [x] SubTask 2.2: 创建 TransactionCategoryModal 组件（收支分类管理）
  - [x] SubTask 2.3: 创建 CashFlowConfigModal 组件（现金流量配置）

- [x] Task 3: 重构资产负债表
  - [x] SubTask 3.1: 添加月份选择器
  - [x] SubTask 3.2: 卡片右上角添加设置按钮
  - [x] SubTask 3.3: 实现手动校准功能
  - [x] SubTask 3.4: 后端 API 支持按月查询

- [x] Task 4: 重构收入支出表
  - [x] SubTask 4.1: 卡片右上角添加设置按钮
  - [x] SubTask 4.2: 集成收支分类管理弹窗

- [x] Task 5: 重构现金流量表
  - [x] SubTask 5.1: 按活动类型分类展示（经营/投资/筹资）
  - [x] SubTask 5.2: 卡片右上角添加设置按钮
  - [x] SubTask 5.3: 后端 API 支持活动类型分类

- [x] Task 6: 清理旧代码
  - [x] SubTask 6.1: 移除 CategoriesManage.tsx 页面
  - [x] SubTask 6.2: 更新路由配置
  - [x] SubTask 6.3: 更新导航菜单

- [ ] Task 7: 测试验证
  - [ ] SubTask 7.1: 测试报表弹窗设置功能
  - [ ] SubTask 7.2: 测试资产负债表按月查看和校准
  - [ ] SubTask 7.3: 测试现金流量表活动分类

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1, Task 2]
- [Task 4] depends on [Task 2]
- [Task 5] depends on [Task 1, Task 2]
- [Task 6] depends on [Task 3, Task 4, Task 5]
- [Task 7] depends on [Task 3, Task 4, Task 5, Task 6]
