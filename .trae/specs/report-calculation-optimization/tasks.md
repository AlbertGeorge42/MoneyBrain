# Tasks

- [ ] Task 1: 数据库模型修改
  - [ ] SubTask 1.1: Account 模型添加 cashFlowType 字段
  - [ ] SubTask 1.2: Transaction 模型添加 isAdjustment 字段
  - [ ] SubTask 1.3: 执行数据库迁移
  - [ ] SubTask 1.4: 创建系统分类"平账调整"

- [ ] Task 2: 后端 API 重构
  - [ ] SubTask 2.1: 重构资产负债表 API，计算月初数据
  - [ ] SubTask 2.2: 收入支出表 API 添加期初/期末资产
  - [ ] SubTask 2.3: 现金流量表 API 添加期初/期末现金
  - [ ] SubTask 2.4: 创建平账 API，自动生成平账记录
  - [ ] SubTask 2.5: 更新账户 API 支持 cashFlowType

- [ ] Task 3: 前端页面修改
  - [ ] SubTask 3.1: 更新 API 类型定义
  - [ ] SubTask 3.2: Reports.tsx 添加期初/期末展示
  - [ ] SubTask 3.3: AccountCategoryModal.tsx 账户支持活动类型
  - [ ] SubTask 3.4: 平账功能前端实现

- [ ] Task 4: 测试验证
  - [ ] SubTask 4.1: 测试资产负债表月初计算
  - [ ] SubTask 4.2: 测试平账记录生成
  - [ ] SubTask 4.3: 测试期初/期末展示

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 2]
- [Task 4] depends on [Task 3]
