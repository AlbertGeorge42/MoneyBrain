# 修复排序功能与报表子账户展示

## 问题描述
1. 当前排序功能无法生效
2. 报表页面没有展示子账户具体信息

## 问题分析

### 1. 排序功能问题
**当前实现**：
- 使用 @dnd-kit 实现拖拽排序
- `SortableRow` 组件实现有问题，没有正确传递拖拽属性
- `handleDragEnd` 调用了 `accountCategoryApi.updateSort`，但 API 路径可能不正确

**问题原因**：
1. `SortableRow` 组件的拖拽属性应用位置错误
2. 缺少 `accountCategoryApi` 的导入
3. 后端 API 路径是 `/account-categories/sort/batch`，前端调用路径不匹配

### 2. 报表子账户展示问题
**当前实现**：
- 资产负债表只显示分类汇总数据
- 没有显示每个分类下的具体账户

**问题原因**：
- `balanceSheetData.accounts` 包含了所有账户信息，但前端没有展示

## 实施步骤

### Step 1: 修复排序功能
1. 修复 `SortableRow` 组件，正确应用拖拽属性
2. 添加 `accountCategoryApi` 导入
3. 确保 API 调用路径正确

### Step 2: 修复报表子账户展示
1. 修改资产负债表展示，添加账户明细表格
2. 显示每个分类下的具体账户信息

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/AccountCategoryModal.tsx` | 修复 | 修复排序功能 |
| `frontend/src/pages/Reports.tsx` | 修改 | 添加账户明细展示 |
| `frontend/src/services/api.ts` | 检查 | 确认 API 路径正确 |

## 详细修改

### 1. SortableRow 组件修复

```tsx
const SortableRow: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <tr ref={setNodeRef} style={style} {...attributes}>
      {React.Children.map(children, (child, index) => {
        if (index === 0) {
          // 将拖拽属性应用到第一列（拖拽手柄列）
          return React.cloneElement(child as React.ReactElement, {
            ...listeners,
          })
        }
        return child
      })}
    </tr>
  )
}
```

### 2. 报表账户明细展示

在资产负债表中添加账户明细表格：

```tsx
<Card title="账户明细" size="small">
  <Table
    dataSource={balanceSheetData?.accounts || []}
    columns={[
      { title: '账户', dataIndex: 'name', key: 'name' },
      { title: '分类', dataIndex: 'category', key: 'category' },
      { 
        title: '余额', 
        dataIndex: 'balance', 
        key: 'balance',
        render: (v: number) => `¥${v.toFixed(2)}`
      },
    ]}
    rowKey="id"
    size="small"
    pagination={false}
  />
</Card>
```

## 验证清单
- [ ] 排序功能正常工作
- [ ] 拖拽后排序正确保存
- [ ] 报表页面显示账户明细
- [ ] 账户按分类正确分组显示
