# Tasks

## 高优先级任务

- [x] Task 1: 修复路由顺序错误
  - [x] SubTask 1.1: 修复 `account-category.ts` 中 `/sort/batch` 路由顺序
  - [x] SubTask 1.2: 修复 `category.ts` 中 `/sort/batch` 路由顺序

- [x] Task 2: 补充缺失的批量创建接口
  - [x] SubTask 2.1: 在 `balance-snapshot.ts` 中添加 `POST /batch` 接口

## 中优先级任务

- [x] Task 3: 提取公共函数
  - [x] SubTask 3.1: 创建 `backend/src/utils/tree.ts` 文件
  - [x] SubTask 3.2: 在 `account-category.ts` 中使用公共函数
  - [x] SubTask 3.3: 在 `category.ts` 中使用公共函数

## 验证任务

- [x] Task 4: 验证修复结果
  - [x] SubTask 4.1: 运行后端类型检查
  - [x] SubTask 4.2: 测试路由是否正确匹配

# Task Dependencies
- Task 3 依赖 Task 1 完成（先修复路由顺序，再重构代码）
- Task 4 依赖 Task 1-3 全部完成
