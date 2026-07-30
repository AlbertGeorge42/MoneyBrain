# MoneyBrain 开发规范

基于项目实际代码分析（2026-07），所有规范与当前代码库一致。

---

## 一、技术栈

| 层 | 技术 | 版本 |
|---|------|------|
| 前端框架 | React | 18.x |
| 构建工具 | Vite | 5.x |
| UI 库 | Ant Design | 6.x |
| 图表 | ECharts + echarts-for-react | — |
| 状态管理 | TanStack React Query | 5.x |
| HTTP 客户端 | Axios | — |
| 拖拽 | @dnd-kit + dnd-kit-sortable-tree | — |
| 日期 | dayjs | — |
| 后端框架 | Express | 4.x |
| ORM | Prisma | 5.x |
| 数据库 | SQLite | — |
| 日志 | pino + pino-http | — |
| 导入/导出 | papaparse, archiver, unzipper | — |
| 测试 | Vitest + React Testing Library + Supertest + Playwright | — |

---

## 二、目录结构

```
MoneyBrain/
├── frontend/
│   ├── src/
│   │   ├── components/         # React 组件
│   │   │   ├── charts/         # 图表（BarChart, PieChart, LineChart, SankeyChart, BaseChart）
│   │   │   ├── common/         # 通用（PageHeader, MobileTabBar, ErrorBoundary, CategorySelect 等）
│   │   │   ├── budgets/        # 预算（BudgetForm, BudgetDetail, BudgetEdit）
│   │   │   ├── reports/        # 报表（4 张报表 + ReportViewSwitcher）
│   │   │   ├── settings/       # 设置（AccountForm, ThemeSection, DataBackupSection 等）
│   │   │   ├── transactions/   # 交易（TransactionForm, TransactionTable, TransactionFilter 等）
│   │   │   └── investment/     # 投资（SnapshotModal, AssetClassConfig, Timeline 等）
│   │   ├── pages/              # 5 页面（Dashboard, Transactions, Budgets, Reports, Settings）
│   │   ├── layouts/            # MainLayout（AppShell + MobileTabBar + Outlet）
│   │   ├── hooks/              # useIsMobile, useNotify
│   │   ├── constants/          # transactionType.ts（TRANSACTION_TYPE_CONFIG + useAmountColors）
│   │   ├── queries/            # React Query hooks（keys.ts + 7 领域文件 + index.ts 桶导出）
│   │   ├── services/           # api.ts（Axios 实例 + 9 个领域 API 对象）
│   │   ├── styles/             # 样式
│   │   │   ├── base/           # reset.css
│   │   │   ├── layout/         # appShell.css, pageShell.css, grids.css
│   │   │   ├── components/     # cards.css, mobileTabBar.css, pagination.css, picker.css
│   │   │   ├── pages/          # dashboard.css, settings.css, transactions.css
│   │   │   └── theme/          # config.ts, variables.css, mode.ts, chart-tokens.ts, financial-tokens.ts
│   │   ├── utils/              # format.ts, formatAmount.ts, color.ts, download.ts 等
│   │   └── App.tsx + main.tsx  # 入口
│   └── tests/
│       ├── setup.ts            # 全局 mock（antd, echarts, matchMedia, ResizeObserver 等）
│       ├── mocks/api.ts        # API mock
│       └── unit/               # 组件测试 + 页面测试
├── backend/
│   ├── src/
│   │   ├── common/             # error.ts, http.ts, utils.ts, validators.ts, date.ts, tree.ts, logger/
│   │   ├── routes/             # 9 个 route.ts 文件（kebab-case）
│   │   ├── services/           # 业务逻辑（纯函数，无类）
│   │   │   ├── report/         # 4 张报表计算 + report.utils.ts
│   │   │   ├── import/         # CSV/配置导入（papaparse）
│   │   │   ├── export/         # 数据导出
│   │   │   └── investment/     # 投资分析
│   │   └── index.ts            # Express 入口（middleware → routes → errorHandler）
│   ├── prisma/                 # schema.prisma（8 模型）+ 迁移 + seed.ts
│   └── tests/
│       ├── mocks/prisma.ts     # createMockPrisma
│       ├── factories/          # 测试数据工厂
│       ├── unit/               # 13 个单元测试
│       └── integration/        # 2 个集成测试
├── shared/
│   ├── types/index.ts          # 465 行 API 类型定义
│   └── utils/tree.ts           # buildTree, buildSortedTree
├── e2e/
│   ├── tests/                  # 6 个 spec（onboarding, theme, responsive, settings, example）
│   └── helpers/test-data.ts    # 数据清理辅助函数
├── docs/                       # 项目文档
├── AGENTS.md                   # OpenCode Agent 指南
├── CLAUDE.md                   # Claude Code 指南
├── playwright.config.ts        # Playwright 配置（5 项目、自动启动服务器）
└── package.json                # 根协调
```

---

## 三、代码规范

### 3.1 命名

| 类别 | 约定 | 示例 |
|------|------|------|
| 前端组件文件 | `PascalCase.tsx` | `AccountSelect.tsx` |
| 前端页面文件 | `PascalCase.tsx` | `Transactions.tsx` |
| 前端 hooks | `useCamelCase.ts` | `useIsMobile.ts` |
| 后端路由文件 | `kebab-case.route.ts` | `account-category.route.ts` |
| 后端服务文件 | `kebab-case.service.ts` | `transaction-list.service.ts` |
| API 路径 | kebab-case | `/api/account-categories` |
| API 对象（前端） | camelCase | `transactionApi`, `reportApi` |
| React Query hooks | `useXxx()` | `useAccounts()`, `useCreateTransaction()` |
| CSS 类名 | BEM-like kebab-case | `.app-shell__brand` |
| 错误类 | PascalCase | `NotFoundError` |
| 错误代码 | UPPER_SNAKE | `NOT_FOUND` |
| 共享类型 | PascalCase interface | `ApiResponse<T>` |

### 3.2 注释

- 代码注释用中文
- 变量/函数/类型命名用英文

### 3.3 前端组件结构

```tsx
import React from 'react'

interface AccountSelectProps {
  value?: string
  onChange?: (value: string) => void
}

const AccountSelect: React.FC<AccountSelectProps> = ({ value, onChange }) => {
  // hooks
  // handlers
  // render
  return <Select value={value} onChange={onChange} />
}

export default AccountSelect
```

每个组件目录下有 `index.ts` 桶导出文件（同时包含 named exports + default exports）。

### 3.4 后端结构

- 路由层：提取参数 + 校验，委托 Service
- Service 层：纯业务逻辑（async 函数，非 class）
- 错误处理：`asyncHandler` → Service 抛出 `AppError` 子类 → `errorHandler` 统一捕获
- 使用 `.js` 扩展名导入（ESM 要求）：`import { prisma } from '../index.js'`

### 3.5 前端数据流

```
Page → useQuery hook (queries/) → domainApi (services/api.ts) → Axios → Express
```

- `queries/keys.ts`: 查询 key 工厂（`queryKeys.accounts.all`, `queryKeys.budgets.status(id)`）
- `queries/`: 领域 hooks，内部调用 `services/api.ts` 的 API 对象
- `services/api.ts`: 单文件，Axios 实例 + `accountCategoryApi`, `accountApi`, `transactionApi`, `budgetApi`, `reportApi`, `analyticsApi`, `dataApi`, `investmentApi`
- 状态管理：无 Zustand/Redux — 仅 React Query + 组件本地 hooks

---

## 四、样式规范

### 4.1 设计令牌系统

**分层结构**：
- **结构 token**（间距、字体、圆角、动效、Z-index）：`variables.css` 静态定义，主题无关
- **颜色 token**（信息色 + 财务色）：`syncCssVars()` 从 AntD 算法派生，自动适配浅色/深色

**信息色 vs 财务色**（语义独立）：
- 信息色：success/danger/warning → AntD Seed Token → Algorithm
- 财务色：income/expense/transfer/refund/adjustment/positive/negative/neutral → `@ant-design/colors` `generate()`

**消费方式**：
- CSS: `var(--mb-color-*)` / `var(--mb-space-*)` / `var(--mb-font-size-*)` / `var(--mb-radius-*)` / `var(--mb-shadow-*)` / `var(--mb-motion-*)` / `var(--mb-z-*)`
- React: `theme.useToken()` 获取 AntD token
- ECharts: `getTokenValue()` 从 DOM 读取 CSS 变量

### 4.2 主题

`styles/ThemeContext.tsx` 提供 `useTheme()` hook → `{ mode, isDark, setThemeMode, toggleTheme }`。支持 `light | dark | system` 三种模式，持久化到 localStorage。

---

## 五、API 规范

### 5.1 响应格式

```typescript
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: { code: string; message: string }
  timestamp: string
}

interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: { page: number; pageSize: number; total: number }
}
```

### 5.2 路由

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/resources` | 列表 |
| GET | `/api/resources/:id` | 详情 |
| POST | `/api/resources` | 创建 |
| PUT | `/api/resources/:id` | 更新 |
| DELETE | `/api/resources/:id` | 删除 |

### 5.3 HTTP 辅助（`backend/src/common/http.ts`）

`asyncHandler` → `validateRequest` → `success(res, data)` → `error(res, msg, code, status)` → `notFound(res, msg)` → `errorHandler(err, req, res, next)`

### 5.4 错误类（`backend/src/common/error.ts`）

| 类 | 状态码 | 错误码 |
|----|--------|--------|
| `AppError` | 400 | — |
| `NotFoundError` | 404 | `NOT_FOUND` |
| `ValidationError` | 400 | `VALIDATION_ERROR` |
| `BusinessError` | 400 | `BUSINESS_ERROR` |
| `InsufficientBalanceError` | 400 | `INSUFFICIENT_BALANCE` |
| `DuplicateError` | 409 | `DUPLICATE_ERROR` |
| `ForeignKeyError` | 400 | `FOREIGN_KEY_ERROR` |

errorHandler 额外映射 Prisma 错误：P2002→409, P2003→400, P2011→400, P2025→404

### 5.5 验证器（`backend/src/common/validators.ts`）

`validateIdParam`, `validateBatchSort`, `validateDateRange`, `validateDateQuery`, `validateTypeQuery`

---

## 六、数据库

### 6.1 模型

| 模型 | 说明 | 关键字段 |
|------|------|---------|
| AccountCategory | 账户分类 | type, parentId, isCashEquivalent, isInvestment |
| Account | 账户 | type, initialBalance, categoryId |
| TransactionCategory | 交易分类 | type(income/expense/transfer), parentId, cashFlowType |
| Transaction | 交易记录 | type, amount, fee, coupon, accountId, categoryId |
| Budget | 预算 | type, amount, period, accountId, categoryId |
| InvestmentAssetClass | 投资资产类别 | accountId, targetRatio |
| InvestmentAllocationSnapshot | 投资快照 | accountId, date, accountBalance, previousSnapshotId |
| InvestmentAllocationItem | 快照条目 | snapshotId, assetClassId, marketValue, periodNetFlow |

### 6.2 约定

- UUID 主键，Decimal 金额字段（Prisma → number 序列化）
- 迁移文件提交到版本控制
- 所有 Prisma Decimal 在 response 层 `convertDecimals()` 转换为 number

---

## 七、测试

### 7.1 层级

| 层级 | 工具 | 目录 |
|------|------|------|
| 后端单元 | Vitest | `backend/tests/unit/` |
| 后端集成 | Vitest + Supertest | `backend/tests/integration/` |
| 前端单元 | Vitest + RTL | `frontend/tests/unit/` |
| E2E | Playwright | `e2e/tests/` |

### 7.2 配置

- 后端 3 个 vitest 配置文件：`vitest.config.ts`, `vitest.unit.config.ts`, `vitest.integration.config.ts`
- `fileParallelism: false`（后端测试顺序执行）
- 测试超时 10s
- Vitest `@` 别名仅在 vitest 配置中定义，生产代码使用相对 `.js` 导入

### 7.3 Mock

- 后端：`createMockPrisma()`（`backend/tests/mocks/prisma.ts`）
- 前端：`tests/setup.ts` 自动 mock antd message/notification/modal, echarts-for-react, matchMedia, ResizeObserver, IntersectionObserver
- E2E：`clearAllTestData()`（DELETE `/api/data/all`）

### 7.4 验证顺序

`lint → typecheck → test`（分别在前端/后端目录执行）

---

## 八、Git

- 禁止自动 git commit/push，除非用户明确要求
- 本项目无 CI/CD 配置

---

## 九、端口

| 服务 | 端口 | 说明 |
|------|------|------|
| 后端 | 3001 | Express API |
| 前端 | 3002 | Vite dev（代理 `/api` → `127.0.0.1:3001`） |
| E2E | — | Playwright 自动启动服务器，baseURL = `localhost:3002` |

---

## 十、AI 开发原则

1. 保持代码简洁，避免过度抽象
2. 每个模块职责清晰，功能单一
3. 重要逻辑添加中文注释
4. 避免复杂类型体操
5. 数据存储在本地 SQLite，单用户无认证
6. 支持浅色/深色主题 + 响应式（桌面/平板/移动）
