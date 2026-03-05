# 后端接口优化检查清单

## 路由顺序修复

- [x] `account-category.ts` 中 `/sort/batch` 路由已移到 `/:id` 之前
- [x] `category.ts` 中 `/sort/batch` 路由已移到 `/:id` 之前

## 接口补充

- [x] `balance-snapshot.ts` 中已添加 `POST /batch` 接口
- [x] 前端 `api.ts` 中的 `batchCreate` 方法可以正常调用

## 代码重构

- [x] 已创建 `utils/tree.ts` 公共模块
- [x] `account-category.ts` 已使用公共的 `buildTree` 函数
- [x] `category.ts` 已使用公共的 `buildTree` 函数

## 验证

- [x] 后端 TypeScript 类型检查通过
- [x] 前端调用 `PUT /account-categories/sort/batch` 正常工作
- [x] 前端调用 `PUT /categories/sort/batch` 正常工作
