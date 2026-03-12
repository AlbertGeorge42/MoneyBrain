# 修复账户类型切换后所属类别无法切换问题

## 问题分析

### 问题描述
修改账户类型后，所属类别下拉框无法切换到新类型的备选分类。

### 代码分析

当前代码：
```tsx
<Form.Item name="categoryId" label="所属分类">
  <TreeSelect
    placeholder="请选择账户分类"
    allowClear
    treeData={getCategoryTree(accountForm.getFieldValue('type'))}  // ❌ 只在初始渲染时获取值
    fieldNames={{ label: 'name', value: 'id', children: 'children' }}
  />
</Form.Item>
```

### 问题原因

1. `getCategoryTree(accountForm.getFieldValue('type'))` 只在组件渲染时执行一次
2. 当用户切换账户类型时，`treeData` 不会自动更新
3. React 不会重新渲染，因为 `accountForm.getFieldValue('type')` 不是响应式的

### 解决方案

使用 `Form.Item` 的 `shouldUpdate` 属性监听 `type` 字段变化，动态渲染 `categoryId` 字段：

```tsx
<Form.Item shouldUpdate={(prevValues, currentValues) => prevValues.type !== currentValues.type}>
  {({ getFieldValue }) => (
    <Form.Item name="categoryId" label="所属分类">
      <TreeSelect
        placeholder="请选择账户分类"
        allowClear
        treeData={getCategoryTree(getFieldValue('type'))}  // ✅ 响应式获取值
        fieldNames={{ label: 'name', value: 'id', children: 'children' }}
      />
    </Form.Item>
  )}
</Form.Item>
```

## 文件变更

| 文件 | 操作 |
|------|------|
| `frontend/src/components/AccountCategoryModal.tsx` | 修改 `categoryId` Form.Item 使用 `shouldUpdate` |
