# 明细表格图标显示修复计划

## 问题分析

在明细表格中，部分位置仍然直接渲染 emoji 图标，未使用 DynamicIcon 组件。

### 需要修改的位置

| 文件 | 行号 | 问题 |
|------|------|------|
| Reports.tsx | 243 | 资产明细表格使用 emoji：`📁` 和 `💰` |
| Reports.tsx | 280 | 负债明细表格使用 emoji：`📁` 和 `💳` |
| AccountCategoryModal.tsx | 104 | 默认值使用 emoji：`💰` |
| AccountCategoryModal.tsx | 116 | 默认值使用 emoji：`📁` |

## 修改方案

### 1. Reports.tsx 修改

**资产明细表格（第 243 行）**：
```tsx
// 修改前
{record.type === 'category' ? '📁' : '💰'} {text}

// 修改后
<DynamicIcon name={record.type === 'category' ? 'folder' : 'wallet'} size={16} /> {text}
```

**负债明细表格（第 280 行）**：
```tsx
// 修改前
{record.type === 'category' ? '📁' : '💳'} {text}

// 修改后
<DynamicIcon name={record.type === 'category' ? 'folder' : 'credit-card'} size={16} /> {text}
```

### 2. AccountCategoryModal.tsx 修改

**账户默认图标（第 104 行）**：
```tsx
// 修改前
icon: a.icon || '💰',

// 修改后
icon: a.icon || 'wallet',
```

**分类默认图标（第 116 行）**：
```tsx
// 修改前
icon: category.icon || '📁',

// 修改后
icon: category.icon || 'folder',
```

## 实施步骤

1. 修改 Reports.tsx 中的两处 emoji 渲染
2. 修改 AccountCategoryModal.tsx 中的两处默认值
3. 验证类型检查通过
