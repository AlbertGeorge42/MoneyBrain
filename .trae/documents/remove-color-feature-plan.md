# 移除颜色标签功能计划

## 目标
移除分类和账户设置中的颜色标签设置功能，包括：
1. 数据库中的 color 字段
2. 后端 API 和服务中的 color 字段处理
3. 前端颜色选择器组件和相关表单

## 实现步骤

### 步骤1：数据库模型修改

修改 `backend/prisma/schema.prisma`：
- 从 `Category` 表移除 `color` 字段
- 从 `Account` 表移除 `color` 字段
- 从 `AccountCategory` 表移除 `color` 字段

### 步骤2：运行数据库迁移

```bash
cd backend
npx prisma migrate dev --name remove_color_fields
```

### 步骤3：前端类型定义更新

修改 `frontend/src/services/api.ts`：
- 从 `Category` 接口移除 `color` 字段
- 从 `Account` 接口移除 `color` 字段
- 从 `AccountCategory` 接口移除 `color` 字段

### 步骤4：删除颜色选择器组件

删除 `frontend/src/components/ColorPicker.tsx`

### 步骤5：更新分类管理弹窗

修改 `frontend/src/components/TransactionCategoryModal.tsx`：
- 移除 ColorPicker 导入
- 移除表单中的颜色选择字段
- 移除编辑时的 color 字段回显

### 步骤6：更新账户分类管理弹窗

修改 `frontend/src/components/AccountCategoryModal.tsx`：
- 移除 ColorPicker 导入
- 移除分类表单中的颜色选择字段
- 移除账户表单中的颜色选择字段
- 移除编辑时的 color 字段回显

### 步骤7：更新筛选组件

修改 `frontend/src/components/transactions/TransactionFilter.tsx`：
- 移除 Tag 组件中的 color 属性（使用默认样式）
- 或使用类型/分类类型决定颜色

### 步骤8：更新交易记录页面

修改 `frontend/src/pages/Transactions.tsx`：
- 分类列：使用默认 Tag 样式或根据分类类型决定颜色
- 账户列：使用默认 Tag 样式

## 文件修改清单

### 后端
1. `backend/prisma/schema.prisma` - 移除 color 字段
2. 数据库迁移文件（自动生成）

### 前端
1. `frontend/src/services/api.ts` - 移除 color 字段
2. `frontend/src/components/ColorPicker.tsx` - 删除文件
3. `frontend/src/components/TransactionCategoryModal.tsx` - 移除颜色选择
4. `frontend/src/components/AccountCategoryModal.tsx` - 移除颜色选择
5. `frontend/src/components/transactions/TransactionFilter.tsx` - 更新显示样式
6. `frontend/src/pages/Transactions.tsx` - 更新表格显示样式

## 预期效果

1. 分类和账户不再支持自定义颜色
2. 筛选器和表格中使用默认 Tag 样式
3. 代码更简洁，减少不必要的复杂度
