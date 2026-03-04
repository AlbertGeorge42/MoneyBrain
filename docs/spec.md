# MoneyBrain 个人记账软件 - 项目规格说明

## 1. 项目概述

### 1.1 项目名称
MoneyBrain - 个人记账软件

### 1.2 项目目标
参考钱迹app功能，开发一款支持资产与负债管理、收支记录、财务报表生成与分析的个人记账软件。

### 1.3 核心原则
- **AI友好架构**: 代码结构清晰，模块化设计，便于AI理解和维护
- **渐进式开发**: 每个功能模块独立，可逐步迭代
- **简单可靠**: 避免过度复杂的架构，确保稳定性

---

## 2. 技术选型

### 2.1 前端技术栈
- **框架**: React 18 + TypeScript
- **状态管理**: Zustand (轻量级，易于理解)
- **UI组件**: Ant Design 5.x
- **图表库**: ECharts
- **构建工具**: Vite

### 2.2 后端技术栈
- **运行时**: Node.js 18+
- **框架**: Express.js
- **数据库**: SQLite (轻量级，单文件，便于备份)
- **ORM**: Prisma (类型安全，易于理解)

### 2.3 数据存储
- **本地存储**: SQLite 数据库文件
- **数据备份**: JSON导出功能

---

## 3. 功能模块设计

### 3.1 模块概览

```
MoneyBrain/
├── frontend/                 # 前端应用
│   ├── src/
│   │   ├── components/       # 通用组件
│   │   ├── pages/            # 页面组件
│   │   ├── stores/           # 状态管理
│   │   ├── services/         # API服务
│   │   └── utils/            # 工具函数
│   └── package.json
├── backend/                  # 后端应用
│   ├── src/
│   │   ├── routes/           # API路由
│   │   ├── services/         # 业务逻辑
│   │   ├── models/           # 数据模型
│   │   └── utils/            # 工具函数
│   ├── prisma/
│   │   └── schema.prisma     # 数据库模型
│   └── package.json
└── docs/                     # 文档
    └── api.md
```

### 3.2 核心功能模块

#### 模块1: 资产负债管理 (Assets & Liabilities)
- **功能描述**: 管理个人资产和负债账户
- **数据实体**:
  - Account (账户): id, name, type(资产/负债), balance, icon, createdAt, updatedAt
  - AccountCategory (账户分类): id, name, type, icon
- **API端点**:
  - GET /api/accounts - 获取所有账户
  - POST /api/accounts - 创建账户
  - PUT /api/accounts/:id - 更新账户
  - DELETE /api/accounts/:id - 删除账户

#### 模块2: 收支记录 (Transactions)
- **功能描述**: 记录收入和支出
- **数据实体**:
  - Transaction (交易): id, type(收入/支出), amount, accountId, categoryId, date, note, createdAt
  - Category (分类): id, name, type(收入/支出), icon, parentId
- **API端点**:
  - GET /api/transactions - 获取交易列表(支持筛选)
  - POST /api/transactions - 创建交易
  - PUT /api/transactions/:id - 更新交易
  - DELETE /api/transactions/:id - 删除交易

#### 模块3: 财务报表 (Reports)
- **功能描述**: 自动生成三大财务报表
- **报表类型**:
  1. **资产负债表**: 某一时点的资产、负债、净资产
  2. **收入支出表**: 某一时期的收入、支出、结余
  3. **现金流量表**: 某一时期的现金流入流出
- **API端点**:
  - GET /api/reports/balance-sheet?date=YYYY-MM-DD
  - GET /api/reports/income-expense?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
  - GET /api/reports/cash-flow?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD

#### 模块4: 统计分析 (Analytics)
- **功能描述**: 对财务数据进行可视化分析
- **分析维度**:
  - 收支趋势图(按月/季/年)
  - 分类占比饼图
  - 资产负债变化趋势
  - 预算执行情况
- **API端点**:
  - GET /api/analytics/trends?type=income|expense&period=month|quarter|year
  - GET /api/analytics/category-breakdown?type=income|expense
  - GET /api/analytics/asset-trend

#### 模块5: 预算管理 (Budget)
- **功能描述**: 设置预算并跟踪执行情况
- **数据实体**:
  - Budget (预算): id, name, amount, period(月度/年度), categoryId, startDate, endDate
  - BudgetAlert (预算提醒): id, budgetId, threshold(百分比), isNotified
- **API端点**:
  - GET /api/budgets - 获取预算列表
  - POST /api/budgets - 创建预算
  - PUT /api/budgets/:id - 更新预算
  - DELETE /api/budgets/:id - 删除预算
  - GET /api/budgets/:id/status - 获取预算执行状态

---

## 4. 数据库设计

### 4.1 ER图概念

```
┌─────────────┐     ┌─────────────────┐
│   Account   │     │ AccountCategory │
├─────────────┤     ├─────────────────┤
│ id          │────▶│ id              │
│ name        │     │ name            │
│ type        │     │ type            │
│ balance     │     │ icon            │
│ categoryId  │     └─────────────────┘
│ icon        │
│ createdAt   │
│ updatedAt   │
└─────────────┘
       │
       │ 1:N
       ▼
┌─────────────┐     ┌─────────────────┐
│ Transaction │     │    Category     │
├─────────────┤     ├─────────────────┤
│ id          │────▶│ id              │
│ type        │     │ name            │
│ amount      │     │ type            │
│ accountId   │     │ icon            │
│ categoryId  │────▶│ parentId        │
│ date        │     └─────────────────┘
│ note        │
│ createdAt   │
└─────────────┘

┌─────────────┐     ┌─────────────────┐
│   Budget    │     │  BudgetAlert    │
├─────────────┤     ├─────────────────┤
│ id          │────▶│ id              │
│ name        │     │ budgetId        │
│ amount      │     │ threshold       │
│ period      │     │ isNotified      │
│ categoryId  │     └─────────────────┘
│ startDate   │
│ endDate     │
└─────────────┘
```

### 4.2 Prisma Schema

```prisma
model AccountCategory {
  id        String   @id @default(uuid())
  name      String
  type      String   // 'asset' | 'liability'
  icon      String?
  accounts  Account[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Account {
  id         String          @id @default(uuid())
  name       String
  type       String          // 'asset' | 'liability'
  balance    Decimal         @default(0)
  icon       String?
  categoryId String?
  category   AccountCategory? @relation(fields: [categoryId], references: [id])
  transactions Transaction[]
  createdAt  DateTime        @default(now())
  updatedAt  DateTime        @updatedAt
}

model Category {
  id           String        @id @default(uuid())
  name         String
  type         String        // 'income' | 'expense'
  icon         String?
  parentId     String?
  parent       Category?     @relation("CategoryTree", fields: [parentId], references: [id])
  children     Category[]    @relation("CategoryTree")
  transactions Transaction[]
  budgets      Budget[]
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
}

model Transaction {
  id         String    @id @default(uuid())
  type       String    // 'income' | 'expense'
  amount     Decimal
  date       DateTime
  note       String?
  accountId  String
  account    Account   @relation(fields: [accountId], references: [id])
  categoryId String
  category   Category  @relation(fields: [categoryId], references: [id])
  createdAt  DateTime  @default(now())
}

model Budget {
  id         String        @id @default(uuid())
  name       String
  amount     Decimal
  period     String        // 'monthly' | 'yearly'
  startDate  DateTime
  endDate    DateTime?
  categoryId String?
  category   Category?     @relation(fields: [categoryId], references: [id])
  alerts     BudgetAlert[]
  createdAt  DateTime      @default(now())
  updatedAt  DateTime      @updatedAt
}

model BudgetAlert {
  id         String  @id @default(uuid())
  budgetId   String
  budget     Budget  @relation(fields: [budgetId], references: [id])
  threshold  Int     // 0-100 percentage
  isNotified Boolean @default(false)
  createdAt  DateTime @default(now())
}
```

---

## 5. API设计规范

### 5.1 统一响应格式

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  timestamp: string;
}
```

### 5.2 分页查询参数

```typescript
interface PaginationParams {
  page?: number;      // 默认1
  pageSize?: number;  // 默认20
  sortBy?: string;    // 排序字段
  sortOrder?: 'asc' | 'desc';
}
```

---

## 6. 开发规范

### 6.1 代码风格
- 使用 ESLint + Prettier 统一代码风格
- TypeScript 严格模式
- 组件采用函数式组件 + Hooks

### 6.2 文件命名
- 组件文件: PascalCase (如 `AccountList.tsx`)
- 工具函数: camelCase (如 `formatCurrency.ts`)
- 样式文件: 与组件同名 (如 `AccountList.css`)

### 6.3 注释规范
- 每个模块顶部添加功能说明注释
- 复杂逻辑添加行内注释
- API接口添加JSDoc注释

---

## 7. 项目里程碑

### 阶段1: 基础架构 (Phase 1)
- 项目初始化
- 数据库设计与迁移
- 基础API框架

### 阶段2: 核心功能 (Phase 2)
- 资产负债管理模块
- 收支记录模块

### 阶段3: 报表与分析 (Phase 3)
- 财务报表生成
- 统计分析功能

### 阶段4: 预算管理 (Phase 4)
- 预算设置
- 预算提醒

### 阶段5: 优化完善 (Phase 5)
- 性能优化
- 用户体验改进
- 数据导入导出

---

## 8. 风险与约束

### 8.1 技术约束
- 单用户本地应用，无需用户认证
- 数据存储在本地SQLite文件
- 不支持多设备同步(初期)

### 8.2 开发约束
- AI主导开发，代码需保持简洁易懂
- 每个功能模块独立可测试
- 避免引入过多第三方依赖
