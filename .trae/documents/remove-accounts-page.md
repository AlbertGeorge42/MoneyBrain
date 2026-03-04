# 移除账户管理页面，统一管理资产负债类别和账户

## 目标
将独立的"账户管理"页面功能整合到资产负债表设置弹窗中，简化导航结构，提供更统一的用户体验。

## 当前状态分析

### 现有页面
1. **Accounts.tsx** - 独立的账户管理页面
   - 显示总资产/负债/净资产汇总
   - 资产账户列表（带CRUD操作）
   - 负债账户列表（带CRUD操作）

2. **AccountCategoryModal.tsx** - 资产负债表设置弹窗
   - 账户分类标签页（带CRUD操作）
   - 账户列表标签页（仅展示，无CRUD操作）

### 需要整合的功能
- 账户新增/编辑/删除功能
- 账户余额显示
- 总资产/负债/净资产汇总

## 实施步骤

### Step 1: 增强 AccountCategoryModal 组件
在账户列表标签页中添加完整的账户CRUD功能：
- 添加"新增账户"按钮
- 添加账户编辑功能
- 添加账户删除功能
- 在弹窗顶部显示总资产/负债/净资产汇总

### Step 2: 移除 Accounts 页面
- 删除 `frontend/src/pages/Accounts.tsx` 文件

### Step 3: 更新路由配置
- 从 `App.tsx` 中移除 `/accounts` 路由

### Step 4: 更新导航菜单
- 从 `MainLayout.tsx` 中移除"账户管理"菜单项

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/AccountCategoryModal.tsx` | 修改 | 增强账户管理功能 |
| `frontend/src/pages/Accounts.tsx` | 删除 | 移除独立页面 |
| `frontend/src/App.tsx` | 修改 | 移除路由 |
| `frontend/src/layouts/MainLayout.tsx` | 修改 | 移除菜单项 |

## 详细实现

### 1. 增强 AccountCategoryModal

需要添加的功能：
```tsx
// 状态
const [editingAccount, setEditingAccount] = useState<Account | null>(null)
const [accountFormVisible, setAccountFormVisible] = useState(false)
const [accountForm] = Form.useForm()

// 账户操作函数
- handleAddAccount()
- handleEditAccount(record)
- handleDeleteAccount(id)
- handleAccountSubmit()

// 账户列表表格添加操作列
// 弹窗顶部添加汇总统计
```

### 2. 账户表单字段
- 账户名称（必填）
- 账户类型（资产/负债）
- 初始余额
- 账户分类（树形选择）
- 图标

### 3. 导航菜单变更
```tsx
// 变更前
const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '首页' },
  { key: '/accounts', icon: <WalletOutlined />, label: '账户管理' },
  { key: '/transactions', icon: <TransactionOutlined />, label: '收支记录' },
  { key: '/reports', icon: <BarChartOutlined />, label: '财务报表' },
  { key: '/budgets', icon: <ControlOutlined />, label: '预算管理' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
]

// 变更后
const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '首页' },
  { key: '/transactions', icon: <TransactionOutlined />, label: '收支记录' },
  { key: '/reports', icon: <BarChartOutlined />, label: '财务报表' },
  { key: '/budgets', icon: <ControlOutlined />, label: '预算管理' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
]
```

## 验证清单
- [ ] AccountCategoryModal 可新增账户
- [ ] AccountCategoryModal 可编辑账户
- [ ] AccountCategoryModal 可删除账户
- [ ] AccountCategoryModal 显示汇总统计
- [ ] Accounts.tsx 已删除
- [ ] 路由已更新
- [ ] 导航菜单已更新
- [ ] 前端编译无错误
