# 修复资产负债表编辑类别图标后类别消失问题（深入分析）

## 问题分析

### 问题描述
在资产负债表编辑类别图标时，保存后，**仅编辑界面列表中的类别消失**，外部数据仍然正确显示。

### 关键线索
1. 数据库中的数据是正确的
2. 外部页面（如 Reports.tsx）显示正确
3. 只有 AccountCategoryModal 内的列表消失

### 代码分析

#### handleEditCategory 函数
```typescript
const handleEditCategory = (record: AccountCategory) => {
  setEditingCategory(record)
  categoryForm.setFieldsValue({
    name: record.name,
    type: record.type,      // 问题在这里！
    icon: record.icon,
    parentId: record.parentId,
    isCashEquivalent: record.isCashEquivalent,
  })
  setCategoryFormVisible(true)
}
```

#### 表格操作列
```typescript
<Button onClick={() => handleEditCategory(record)}>
  编辑
</Button>
```

这里的 `record` 实际上是 `TreeNode` 类型，而不是 `AccountCategory`！

#### TreeNode 类型定义
```typescript
interface TreeNode {
  id?: string
  key: string
  name: string
  icon: string
  type: 'category' | 'account'    // ❌ 这是 'category' 或 'account'
  nodeType?: 'asset' | 'liability' // ✅ 这才是 'asset' 或 'liability'
  // ...
}
```

#### AccountCategory 类型定义
```typescript
interface AccountCategory {
  id: string
  name: string
  type: string  // 'asset' | 'liability'
  // ...
}
```

### 根本原因

`TreeNode.type` 是 `'category' | 'account'`，而 `AccountCategory.type` 是 `'asset' | 'liability'`！

当编辑分类时：
1. `handleEditCategory` 接收 `TreeNode` 类型的 `record`
2. `record.type` = `'category'`（而不是 `'asset'` 或 `'liability'`）
3. 表单提交时，`type` 被设置为 `'category'`
4. 后端保存了 `type = 'category'`
5. `buildTreeData` 过滤时：
   ```typescript
   const assetCategories = accountCategories.filter(c => c.type === 'asset')
   const liabilityCategories = accountCategories.filter(c => c.type === 'liability')
   ```
6. 由于 `type = 'category'`，分类被过滤掉了！

### 为什么账户编辑正常？

账户编辑时：
```typescript
const handleEditAccount = (record: Account) => {
  // record 是 TreeNode，但 Account.type 也是 'asset' | 'liability'
  // TreeNode.nodeType 才是 'asset' | 'liability'
}
```

实际上账户编辑可能也有问题，但用户可能没注意到。

## 解决方案

修改 `handleEditCategory` 函数，使用 `record.nodeType` 而不是 `record.type`：

```typescript
const handleEditCategory = (record: any) => {
  setEditingCategory(record)
  categoryForm.setFieldsValue({
    name: record.name,
    type: record.nodeType,  // ✅ 使用 nodeType
    icon: record.icon,
    parentId: record.parentId,
    isCashEquivalent: record.isCashEquivalent,
  })
  setCategoryFormVisible(true)
}
```

同样修改 `handleEditAccount`：
```typescript
const handleEditAccount = (record: any) => {
  setEditingAccount(record)
  accountForm.setFieldsValue({
    name: record.name,
    type: record.nodeType,  // ✅ 使用 nodeType
    // ...
  })
  setAccountFormVisible(true)
}
```

## 文件变更

| 文件 | 操作 |
|------|------|
| `frontend/src/components/AccountCategoryModal.tsx` | 修改 `handleEditCategory` 和 `handleEditAccount` |
