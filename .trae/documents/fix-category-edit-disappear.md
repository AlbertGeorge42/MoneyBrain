# 修复资产负债表编辑类别图标后类别消失问题

## 问题分析

### 问题描述
在资产负债表编辑类别图标时，保存后，编辑界面列表中的类别消失。账户图标编辑正常。

### 代码分析

#### 分类编辑流程
```typescript
// handleCategorySubmit
const handleCategorySubmit = async () => {
  const values = await categoryForm.validateFields()
  if (editingCategory) {
    await accountCategoryApi.update(editingCategory.id, values)
    message.success('更新成功')
  }
  setCategoryFormVisible(false)
  fetchAccountCategories()  // 异步调用，没有等待
}
```

#### 账户编辑流程
```typescript
// handleAccountSubmit
const handleAccountSubmit = async () => {
  const values = await accountForm.validateFields()
  if (editingAccount) {
    await updateAccount(editingAccount.id, submitData)  // 内部会调用 fetchAccounts
    message.success('更新成功')
  }
  setAccountFormVisible(false)
  accountForm.resetFields()  // 有重置表单
}
```

### 问题原因

1. **异步调用未等待**：`handleCategorySubmit` 中 `fetchAccountCategories()` 是异步调用，但没有 `await`
2. **表单未重置**：分类编辑成功后没有调用 `categoryForm.resetFields()`
3. **状态更新顺序**：`setCategoryFormVisible(false)` 在 `fetchAccountCategories()` 之前执行，可能导致状态更新问题

### 对比分析

| 操作 | 分类编辑 | 账户编辑 |
|------|---------|---------|
| API调用 | `accountCategoryApi.update` | `updateAccount` (store方法) |
| 数据刷新 | `fetchAccountCategories()` | `fetchAccounts()` (在store内部) |
| 表单重置 | ❌ 无 | ✅ `accountForm.resetFields()` |
| await刷新 | ❌ 无 | ✅ 在store内部等待 |

## 解决方案

修改 `handleCategorySubmit` 函数：
1. 使用 `await` 等待 `fetchAccountCategories()` 完成
2. 添加 `categoryForm.resetFields()` 重置表单
3. 确保状态更新顺序正确

## 文件变更

| 文件 | 操作 |
|------|------|
| `frontend/src/components/AccountCategoryModal.tsx` | 修改 `handleCategorySubmit` 函数 |
