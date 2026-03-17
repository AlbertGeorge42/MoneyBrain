# 设置页面进一步优化规格说明

## 一、优化目标

1. 统一三个 Modal 组件的布局逻辑
2. 表格内使用图标按钮替代文字按钮
3. 修复日期选择框使用 antd DatePicker

---

## 二、现状分析

### 2.1 布局对比

| 组件 | 主弹窗宽度 | Tab结构 | 新增按钮位置 |
|------|-----------|---------|-------------|
| TransactionCategoryModal | 700px | 收入/支出/转账 | Tab内容顶部 |
| AccountCategoryModal | 800px | 资产/负债 | Tab内容顶部 |
| CashFlowConfigModal | 700px | 现金等价物/活动类型 | 无（配置页面） |

### 2.2 表格操作按钮对比

| 组件 | 分类操作 | 账户/子项操作 |
|------|----------|---------------|
| TransactionCategoryModal | 文字按钮 + Dropdown | 文字按钮 + Dropdown |
| AccountCategoryModal | 文字按钮 + Dropdown | 文字按钮 + Popconfirm |
| CashFlowConfigModal | Switch/Select | 无 |

### 2.3 日期选择框问题

- AccountCategoryModal 账户表单使用 `<Input type="date">`
- 应该使用 antd 的 `<DatePicker>` 组件保持风格一致

---

## 三、优化方案

### 3.1 统一布局逻辑

#### 统一弹窗宽度
- 所有 Modal 宽度统一为 700px

#### 统一 Tab 结构
- 每个 Tab 内容包含：
  1. 顶部操作栏（新增按钮）
  2. 说明文字（可选）
  3. 表格

#### 统一新增按钮样式
```tsx
<Button type="primary" size="small" icon={<PlusOutlined />}>
  新增分类
</Button>
```

### 3.2 表格图标按钮

#### 操作按钮图标定义
| 操作 | 图标 | Tooltip |
|------|------|---------|
| 添加子分类 | FolderAddOutlined | 添加子分类 |
| 添加账户 | WalletOutlined / PlusCircleOutlined | 添加账户 |
| 编辑 | EditOutlined | 编辑 |
| 删除 | DeleteOutlined | 删除 |
| 更多 | MoreOutlined | 更多操作 |

#### 按钮样式
```tsx
<Button 
  type="text" 
  size="small" 
  icon={<IconComponent />} 
  title="提示文字"
/>
```

#### 使用 Tooltip 包裹
```tsx
<Tooltip title="添加子分类">
  <Button type="text" size="small" icon={<FolderAddOutlined />} />
</Tooltip>
```

### 3.3 日期选择框修复

#### 修改前
```tsx
<Form.Item name="initialBalanceDate" label="初始余额日期">
  <Input type="date" style={{ width: '100%' }} />
</Form.Item>
```

#### 修改后
```tsx
import { DatePicker } from 'antd'
import dayjs from 'dayjs'

<Form.Item name="initialBalanceDate" label="初始余额日期">
  <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
</Form.Item>
```

---

## 四、详细修改内容

### 4.1 TransactionCategoryModal

#### 操作列修改
```tsx
{
  title: '操作',
  key: 'action',
  width: 100,
  render: (_: unknown, record: Category) => (
    <Space size={4}>
      {!record.parentId && (
        <Tooltip title="添加子分类">
          <Button 
            type="text" 
            size="small" 
            icon={<FolderAddOutlined />} 
            onClick={() => handleAdd(record.id)}
          />
        </Tooltip>
      )}
      <Tooltip title="编辑">
        <Button 
          type="text" 
          size="small" 
          icon={<EditOutlined />} 
          onClick={() => handleEdit(record)}
        />
      </Tooltip>
      <Popconfirm
        title="确定要删除此分类吗？"
        onConfirm={() => handleDelete(record.id)}
        okText="确定"
        cancelText="取消"
      >
        <Tooltip title="删除">
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Tooltip>
      </Popconfirm>
    </Space>
  ),
}
```

### 4.2 AccountCategoryModal

#### 操作列修改
```tsx
{
  title: '操作',
  key: 'action',
  width: 120,
  render: (_: unknown, record: any) => (
    <Space size={4}>
      {record.type === 'category' ? (
        <>
          <Tooltip title="添加子分类">
            <Button type="text" size="small" icon={<FolderAddOutlined />} onClick={() => handleAddCategory(record.id)} />
          </Tooltip>
          <Tooltip title="添加账户">
            <Button type="text" size="small" icon={<WalletOutlined />} onClick={() => handleAddAccount(record.id)} />
          </Tooltip>
          <Tooltip title="编辑">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEditCategory(record)} />
          </Tooltip>
          <Popconfirm title="确定删除？" onConfirm={() => handleDeleteCategory(record.id)}>
            <Tooltip title="删除">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </>
      ) : (
        <>
          <Tooltip title="编辑">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEditAccount(record)} />
          </Tooltip>
          <Popconfirm title="确定删除？" onConfirm={() => handleDeleteAccount(record.id)}>
            <Tooltip title="删除">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </>
      )}
    </Space>
  ),
}
```

#### 日期选择框修改
```tsx
import { DatePicker } from 'antd'

// 表单中
<Form.Item 
  name="initialBalanceDate" 
  label="初始余额日期" 
  rules={[{ required: true, message: '请选择初始余额日期' }]}
>
  <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" placeholder="选择日期" />
</Form.Item>

// 初始化值
accountForm.setFieldsValue({ 
  initialBalanceDate: dayjs(),
})

// 编辑时
accountForm.setFieldsValue({
  initialBalanceDate: record.initialBalanceDate ? dayjs(record.initialBalanceDate) : dayjs(),
})

// 提交时
initialBalanceDate: values.initialBalanceDate ? values.initialBalanceDate.format('YYYY-MM-DD') : undefined,
```

### 4.3 CashFlowConfigModal

#### 保持现有布局
- 无需添加操作按钮（配置页面）
- 保持 Switch 和 Select 的使用

---

## 五、任务分解

### 任务 1: TransactionCategoryModal 优化
- [ ] 移除 Dropdown，改用 Tooltip + 图标按钮
- [ ] 统一按钮样式为 type="text"
- [ ] 调整操作列宽度

### 任务 2: AccountCategoryModal 优化
- [ ] 移除 Dropdown，改用 Tooltip + 图标按钮
- [ ] 统一按钮样式为 type="text"
- [ ] 修复日期选择框使用 DatePicker
- [ ] 调整操作列宽度
- [ ] 统一弹窗宽度为 700px

### 任务 3: CashFlowConfigModal 优化
- [ ] 统一弹窗宽度为 700px
- [ ] 保持现有功能

### 任务 4: 验证
- [ ] 运行 typecheck
- [ ] 测试所有功能

---

## 六、验证清单

### 布局验证
- [ ] 三个 Modal 弹窗宽度一致
- [ ] Tab 结构统一
- [ ] 新增按钮位置统一

### 按钮验证
- [ ] 所有操作按钮使用图标
- [ ] Tooltip 提示正确显示
- [ ] 按钮间距合理

### 日期选择验证
- [ ] DatePicker 样式与其他组件一致
- [ ] 日期格式正确
- [ ] 初始值设置正确

### 代码质量
- [ ] TypeScript 类型检查通过
- [ ] 无未使用的导入
