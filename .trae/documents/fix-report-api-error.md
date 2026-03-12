# 修复报表页面获取失败问题

## 问题分析

### 根本原因
数据库缺少 `relatedTransactionId` 字段。错误信息：
```
The column `main.transactions.relatedTransactionId` does not exist in the current database.
```

### 原因
在 schema.prisma 中添加了 `relatedTransactionId` 字段支持退款功能，但没有运行数据库迁移。

## 解决方案

运行 Prisma 数据库迁移：
```bash
cd backend
npx prisma migrate dev --name add_related_transaction
```

## 实施步骤

1. 运行 Prisma 迁移命令
2. 验证 API 正常工作
