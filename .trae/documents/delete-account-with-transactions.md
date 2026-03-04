# 支持删除带记录的账户

## 目标
允许用户删除有关联交易记录的账户，通过二次确认机制确保用户知晓将删除的交易记录数量。

## 当前问题
- 账户下有交易记录时无法删除
- 用户必须先手动删除所有关联交易才能删除账户

## 改进方案
1. 添加查询接口，返回账户下的交易记录数量
2. 修改删除接口，支持 `force` 参数强制删除
3. 前端添加二次确认弹窗，显示将删除的交易记录数量

## 实施步骤

### Step 1: 后端 API 修改

#### 1.1 添加查询交易记录数量接口
- GET `/api/accounts/:id/stats` - 返回账户统计信息（交易记录数量等）

#### 1.2 修改删除接口
- DELETE `/api/accounts/:id?force=true` - 支持 force 参数
- force=true 时，先删除关联交易记录，再删除账户
- 使用事务保证数据一致性

### Step 2: 前端修改

#### 2.1 AccountCategoryModal.tsx
- 删除账户前先查询交易记录数量
- 如果有交易记录，显示二次确认弹窗
- 弹窗中显示将删除的交易记录数量

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/routes/account.ts` | 修改 | 添加统计接口，修改删除接口 |
| `frontend/src/components/AccountCategoryModal.tsx` | 修改 | 添加二次确认逻辑 |

## 详细设计

### 1. 后端 API

#### 统计接口
```
GET /api/accounts/:id/stats
Response: {
  success: true,
  data: {
    transactionCount: number,
    totalIncome: number,
    totalExpense: number
  }
}
```

#### 删除接口
```
DELETE /api/accounts/:id?force=true
- force=false 或不传：有交易记录时返回错误
- force=true：删除账户及所有关联交易记录
```

### 2. 前端交互

```
用户点击删除按钮
  ↓
查询账户交易记录数量
  ↓
如果 transactionCount > 0:
  显示确认弹窗:
    "该账户下有 X 条交易记录，删除账户将同时删除这些记录，是否继续？"
    [取消] [确认删除]
  ↓
用户确认后调用 force=true 删除
```

### 3. 数据一致性

使用 Prisma 事务：
```typescript
await prisma.$transaction([
  prisma.transaction.deleteMany({ where: { accountId } }),
  prisma.balanceSnapshot.deleteMany({ where: { accountId } }),
  prisma.account.delete({ where: { id } }),
])
```

## 验证清单
- [ ] 统计接口返回正确的交易记录数量
- [ ] force=false 时，有交易记录返回错误
- [ ] force=true 时，成功删除账户和关联记录
- [ ] 前端显示正确的二次确认弹窗
- [ ] 删除后数据一致性正确
