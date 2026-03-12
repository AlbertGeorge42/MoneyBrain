# Tasks

## 第一阶段：数据库模型修改

- [x] Task 1: 修改 Prisma schema
  - [x] SubTask 1.1: 添加 `fee` 字段（手续费）
  - [x] SubTask 1.2: 添加 `coupon` 字段（优惠券）
  - [x] SubTask 1.3: 运行数据库迁移

## 第二阶段：后端 API 修改

- [x] Task 2: 修改交易路由
  - [x] SubTask 2.1: 修改创建交易逻辑，支持退款类型
  - [x] SubTask 2.2: 修改余额计算逻辑，考虑手续费和优惠券
  - [x] SubTask 2.3: 修改更新交易逻辑
  - [x] SubTask 2.4: 修改删除交易逻辑

## 第三阶段：前端页面修改

- [x] Task 3: 修改交易页面
  - [x] SubTask 3.1: 添加"记退款"按钮
  - [x] SubTask 3.2: 修改表单，支持退款类型
  - [x] SubTask 3.3: 添加手续费和优惠券输入字段
  - [x] SubTask 3.4: 修改交易列表显示

## 第四阶段：导入导出修改

- [x] Task 4: 修改数据导入导出
  - [x] SubTask 4.1: 修改导入逻辑，支持手续费和优惠券字段
  - [x] SubTask 4.2: 修改导出逻辑，导出手续费和优惠券字段

## 第五阶段：验证

- [x] Task 5: 验证功能
  - [x] SubTask 5.1: 运行后端类型检查
  - [x] SubTask 5.2: 运行前端类型检查
  - [x] SubTask 5.3: 测试退款功能
  - [x] SubTask 5.4: 测试手续费和优惠券计算

# Task Dependencies
- Task 2 依赖 Task 1（先修改数据库模型）
- Task 3 依赖 Task 2（后端 API 完成后再修改前端）
- Task 4 依赖 Task 1（数据库模型修改后）
- Task 5 依赖 Task 1-4（所有修改完成后验证）
