# 修复导入逻辑：支持二级收支分类

## 问题分析

当前导入逻辑将一级分类和二级分类合并为一个名称：
```typescript
const categoryName = category2 ? `${category1}-${category2}` : category1
```

这导致所有分类都变成了一级分类，如"餐饮-三餐"作为一个分类名，而不是：
- 一级分类：餐饮
- 二级分类：三餐（父分类：餐饮）

## 修改方案

### 修改 `backend/src/routes/data.ts` 导入逻辑

1. **先创建/查找一级分类**（category1）
2. **如果有二级分类**（category2），创建/查找二级分类并设置 parentId
3. **交易记录关联到二级分类**（如果有）或一级分类

### 代码修改

```typescript
// 构建分类名称
const categoryName = category2 ? category2 : category1
const parentCategoryName = category2 ? category1 : null

// 获取或创建一级分类
let parentId: string | null = null
if (parentCategoryName) {
  let parentCategory = await prisma.category.findFirst({
    where: { name: parentCategoryName, parentId: null }
  })
  if (!parentCategory) {
    parentCategory = await prisma.category.create({
      data: {
        name: parentCategoryName,
        type: categoryType,
        icon: 'circle',
      }
    })
  }
  parentId = parentCategory.id
}

// 获取或创建分类（可能是二级分类）
let category = await prisma.category.findFirst({
  where: { 
    name: categoryName,
    parentId: parentId 
  }
})
if (!category) {
  category = await prisma.category.create({
    data: {
      name: categoryName,
      type: categoryType,
      icon: 'circle',
      parentId: parentId,
    }
  })
}
```

## 实施步骤

1. 修改 `backend/src/routes/data.ts` 中的导入逻辑
2. 更新分类缓存逻辑，支持父子关系
3. 验证导入结果
