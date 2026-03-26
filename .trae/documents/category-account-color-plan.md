# 分类与账户颜色标签功能计划

## 目标
1. 将"分类"、"账户"的筛选显示风格统一为"类型"的 Tag 样式
2. 在新增/编辑"分类"、"账户"时提供颜色标签选择，默认采用黑色

## 当前状态分析

### 类型筛选显示样式
在 `TransactionFilter.tsx` 中，类型使用带颜色的 Tag 显示：
- 收入：绿色 `<Tag color="green">收入</Tag>`
- 支出：红色 `<Tag color="red">支出</Tag>`
- 转账：蓝色 `<Tag color="blue">转账</Tag>`
- 退款：橙色 `<Tag color="orange">退款</Tag>`

### 分类/账户当前显示样式
- 分类：使用图标+文字，无颜色标签
- 账户：使用图标+文字，无颜色标签

## 实现步骤

### 步骤1：数据库模型修改

修改 `backend/prisma/schema.prisma`：

1. **Category 表** 添加 `color` 字段：
```prisma
model Category {
  // ... 现有字段
  color String? // 颜色值，如 'red', 'green', '#1890ff' 等
}
```

2. **Account 表** 添加 `color` 字段：
```prisma
model Account {
  // ... 现有字段
  color String? // 颜色值
}
```

3. **AccountCategory 表** 添加 `color` 字段：
```prisma
model AccountCategory {
  // ... 现有字段
  color String? // 颜色值
}
```

### 步骤2：运行数据库迁移

```bash
cd backend
npx prisma migrate dev --name add_color_fields
```

### 步骤3：后端服务更新

1. **category.service.ts**：确保 CRUD 操作支持 color 字段
2. **account.service.ts**：确保 CRUD 操作支持 color 字段
3. **account-category.service.ts**：确保 CRUD 操作支持 color 字段

### 步骤4：前端类型定义更新

更新 `frontend/src/services/api.ts` 中的类型定义，添加 color 字段。

### 步骤5：创建颜色选择器组件

创建 `frontend/src/components/ColorPicker.tsx`：
- 提供预设颜色列表（与 Ant Design Tag 颜色一致）
- 支持自定义颜色输入
- 默认值为黑色

预设颜色列表：
```typescript
const presetColors = [
  'default', // 黑色/灰色
  'red',     // 红色
  'green',   // 绿色
  'blue',    // 蓝色
  'orange',  // 橙色
  'purple',  // 紫色
  'cyan',    // 青色
  'magenta', // 品红
  'gold',    // 金色
  'lime',    // 青柠
  'geekblue', // 极客蓝
  'volcano',  // 火山色
]
```

### 步骤6：更新分类管理弹窗

修改 `TransactionCategoryModal.tsx`：
- 在表单中添加颜色选择器
- 默认颜色为 'default'（黑色）

### 步骤7：更新账户分类管理弹窗

修改 `AccountCategoryModal.tsx`：
- 在分类表单中添加颜色选择器
- 在账户表单中添加颜色选择器
- 默认颜色为 'default'

### 步骤8：更新筛选组件显示样式

修改 `TransactionFilter.tsx`：

1. **账户树形数据**：使用 Tag 样式显示
```tsx
title: (
  <Tag color={account.color || 'default'}>
    <DynamicIcon name={account.icon} size={14} /> {account.name}
  </Tag>
)
```

2. **分类树形数据**：使用 Tag 样式显示
```tsx
title: (
  <Tag color={category.color || 'default'}>
    <DynamicIcon name={category.icon} size={14} /> {category.name}
  </Tag>
)
```

3. **已选筛选标签**：使用对应的颜色

### 步骤9：更新其他显示位置

检查并更新以下位置的颜色显示：
- 交易记录表格中的分类/账户列
- Dashboard 页面
- Reports 页面

## 文件修改清单

### 后端
1. `backend/prisma/schema.prisma` - 添加 color 字段
2. `backend/src/services/category.service.ts` - 支持 color 字段
3. `backend/src/services/account.service.ts` - 支持 color 字段
4. `backend/src/services/account-category.service.ts` - 支持 color 字段

### 前端
1. `frontend/src/services/api.ts` - 类型定义添加 color 字段
2. `frontend/src/components/ColorPicker.tsx` - 新建颜色选择器组件
3. `frontend/src/components/TransactionCategoryModal.tsx` - 添加颜色选择
4. `frontend/src/components/AccountCategoryModal.tsx` - 添加颜色选择
5. `frontend/src/components/transactions/TransactionFilter.tsx` - 更新显示样式
6. `frontend/src/pages/Transactions.tsx` - 更新表格显示样式

## 预期效果

1. 筛选器中分类和账户以彩色 Tag 形式显示，与类型筛选风格一致
2. 新增/编辑分类或账户时可以选择颜色
3. 默认颜色为黑色（default）
4. 颜色在整个应用中保持一致显示
