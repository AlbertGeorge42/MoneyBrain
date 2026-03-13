# 修改账户类型后余额变为0的问题修复计划

## 问题分析

### 现象
修改账户类型后，表格中账户类型发生变化但数额变为0。

### 根本原因

**前端表单提交逻辑** (`AccountCategoryModal.tsx` 第280-286行)：
```typescript
const values = await accountForm.validateFields()
const submitData = {
  ...values,  // 包含 initialBalance 字段（可能是表单初始值 0）
  initialBalanceDate: values.initialBalanceDate ? values.initialBalanceDate.format('YYYY-MM-DD') : undefined,
}
```

**后端更新逻辑** (`account.ts` 第127-131行)：
```typescript
// 如果更新了初始余额，允许任意正负数
if (initialBalance !== undefined) {
  updateData.initialBalance = initialBalance
  updateData.balance = initialBalance  // 问题：这会重置余额！
}
```

**问题**：
1. 前端每次编辑账户都会提交 `initialBalance` 字段
2. 后端收到 `initialBalance` 后会重置 `balance`
3. 如果用户只是修改账户类型，不修改初始余额，余额会被错误地重置为表单中的初始值

## 解决方案

### 方案2：前端只提交修改的字段

前端在提交时，比较表单值与原始账户数据，只提交实际修改过的字段。

## 实施步骤

### 第一步：修改前端提交逻辑
文件：`frontend/src/components/AccountCategoryModal.tsx`

修改 `handleAccountSubmit` 函数：
1. 比较表单值与原始账户数据
2. 只提交实际修改的字段
3. 如果 `initialBalance` 未修改，不提交该字段

### 第二步：验证修复
1. 创建一个资产账户，初始余额 1000
2. 进行一些交易，使余额变为 1500
3. 修改账户类型为负债
4. 验证余额保持 1500 不变

## 文件变更清单

| 文件 | 操作 |
|------|------|
| `frontend/src/components/AccountCategoryModal.tsx` | 修改提交逻辑，只提交修改过的字段 |
