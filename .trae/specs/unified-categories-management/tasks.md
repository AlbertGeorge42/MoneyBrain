# Tasks

- [x] Task 1: 修改数据库模型支持现金等价物配置
  - [x] SubTask 1.1: 在 AccountCategory 模型添加 isCashEquivalent 字段
  - [x] SubTask 1.2: 执行数据库迁移
  - [x] SubTask 1.3: 更新后端 API 支持该字段

- [x] Task 2: 创建统一分类管理页面
  - [x] SubTask 2.1: 创建 CategoriesManage.tsx 页面组件
  - [x] SubTask 2.2: 实现分类类型切换（资产/负债/收入/支出）
  - [x] SubTask 2.3: 实现一级分类列表展示和操作
  - [x] SubTask 2.4: 实现二级分类列表展示和操作
  - [x] SubTask 2.5: 实现分类新增/编辑表单
  - [x] SubTask 2.6: 实现分类删除功能

- [x] Task 3: 实现现金等价物配置功能
  - [x] SubTask 3.1: 在资产分类列表添加"现金等价物"标记开关
  - [x] SubTask 3.2: 更新现金流量表计算逻辑使用配置
  - [x] SubTask 3.3: 更新现金流量表前端展示

- [x] Task 4: 调整现有页面
  - [x] SubTask 4.1: 在主导航添加"分类管理"菜单项
  - [x] SubTask 4.2: 移除设置页面的分类管理标签页
  - [x] SubTask 4.3: 简化账户管理页面的分类管理功能
  - [x] SubTask 4.4: 更新路由配置

- [x] Task 5: 测试验证
  - [x] SubTask 5.1: 测试分类 CRUD 功能
  - [x] SubTask 5.2: 测试现金等价物配置
  - [x] SubTask 5.3: 测试现金流量表计算正确性

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]
- [Task 5] depends on [Task 2, Task 3, Task 4]
