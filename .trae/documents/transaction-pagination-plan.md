# 交易记录页面分页功能计划

## 问题分析

当前交易记录页面不支持翻页：
1. `fetchTransactions` 只存储了 `list`，没有存储分页信息
2. Table 组件使用前端分页（`pagination={{ pageSize: 20 }}`），而非服务端分页
3. 没有分页状态管理

## 解决方案

### 1. 修改 Store 添加分页状态

```typescript
interface Store {
  // ...
  transactions: Transaction[]
  transactionTotal: number
  transactionPage: number
  transactionPageSize: number
  // ...
}
```

### 2. 修改 fetchTransactions 存储分页信息

```typescript
fetchTransactions: async (params) => {
  const res = await transactionApi.getAll(params)
  if (res.data.success && res.data.data) {
    set({ 
      transactions: res.data.data.list || [],
      transactionTotal: res.data.data.total,
      transactionPage: res.data.data.page,
      transactionPageSize: res.data.data.pageSize,
    })
  }
}
```

### 3. 修改 Transactions 页面支持服务端分页

- 添加分页状态
- 修改 Table pagination 配置
- 添加 onChange 处理函数

## 文件变更

| 文件 | 操作 |
|------|------|
| `frontend/src/stores/index.ts` | 修改：添加分页状态 |
| `frontend/src/pages/Transactions.tsx` | 修改：支持服务端分页 |
