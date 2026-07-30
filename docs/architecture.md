# MoneyBrain 架构文档

## 系统架构

```
┌─────────────────────────────────────┐
│         浏览器 (React SPA)           │
│                                     │
│  Pages → Hooks → Components        │
│       ↕ (React Query)              │
│  queries/ → services/api.ts        │
│       ↕ (Axios HTTP)               │
│  /api (Vite proxy → 127.0.0.1:3001)│
└──────────────┬──────────────────────┘
               │
┌──────────────┴──────────────────────┐
│  Express API (Routes, port 3001)    │
│       ↕ asyncHandler + validators   │
│  Services (纯函数业务逻辑)           │
│       ↕                            │
│  Prisma ORM → SQLite               │
│                                     │
│  附加: pino 日志、papaparse 导入     │
│        archiver 导出、xirr 投资计算   │
└─────────────────────────────────────┘
```

## 前端模块

| 层次 | 职责 | 文件 |
|------|------|------|
| **pages/** | 路由级页面，5 个 | `Dashboard.tsx`, `Transactions.tsx`, `Budgets.tsx`, `Reports.tsx`, `Settings.tsx` |
| **components/** | 可复用 UI 组件 | 7 个子目录，均有 `index.ts` 桶导出 |
| **queries/** | React Query 数据层 | `keys.ts`（key 工厂）+ 7 领域文件 |
| **services/api.ts** | HTTP 客户端 | Axios 实例 + 9 个领域 API 对象 |
| **styles/** | CSS + 设计令牌 | BEM 命名，`theme/` 主题系统 |
| **hooks/** | 通用 hooks | `useIsMobile(breakpoint)`, `useNotify()` |
| **layouts/** | 布局 | `MainLayout.tsx`（AppShell + 响应式 → MobileTabBar） |

### 数据流

```
Page → queries/useXxx() → services/api.ts → Axios GET/POST → Express
                                                              ↕
Page ← React Query 缓存  ← ApiResponse <T>          ← Route → Service → Prisma
```

### 关键模式

- **服务端状态**: 全量 React Query（`staleTime: 30s`, `gcTime: 5m`），无 Zustand
- **组件**: React.FC + Props interface + default export
- **主题**: `ThemeContext` → `useTheme()` + AntD ConfigProvider + CSS 变量
- **颜色**: 财务色（income/expense）与信息色（success/danger）语义独立

## 后端模块

| 层次 | 职责 |
|------|------|
| **routes/** | 9 个 Express Router，参数校验 + 委托 Service |
| **services/** | 纯 async 函数业务逻辑（无 class） |
| **services/report/** | 4 张报表计算（balance-sheet, income-expense, cash-flow, investment-analysis） |
| **services/import/** | 数据导入（papaparse CSV 解析，配置/交易/预算/快照导入） |
| **services/export/** | 数据导出（transaction, budget, config, snapshot → 压缩包） |
| **services/investment/** | 投资分析 + 资产配置 |
| **common/** | 7 错误类、HTTP 辅助、验证器、日期工具、pino 日志 |
| **prisma/** | Schema（8 模型）、迁移、种子 |

### 关键模式

- **错误链**: `asyncHandler` → Service 抛出 `AppError` 子类 → `errorHandler` 统一格式化
- **导入路径**: ESM 风格 `import { x } from '../common/index.js'`（含 `.js` 扩展名）
- **tsconfig**: 无 path aliases（`@` 仅定义在 vitest 配置中）
- **日志**: pino + pino-http，环境感知配置

## 数据库实体关系

```
AccountCategory ──< Account ──< Transaction (fromAccount / toAccount)
                                  ↕ (relatedTransaction — 退款关联)
TransactionCategory ──< Transaction
Budget (关联 Account + TransactionCategory)
InvestmentAssetClass (关联 Account)
InvestmentAllocationSnapshot (关联 Account，自关联 SnapshotChain)
InvestmentAllocationItem (关联 Snapshot + AssetClass)
```

8 个 Prisma 模型，SQLite 存储。完整 schema 见 `backend/prisma/schema.prisma`。

## 共享类型

`shared/types/index.ts`（~465 行）定义前后端 API 合约：

| 类型族 | 关键类型 |
|--------|---------|
| 通用 | `ApiResponse<T>`, `PaginatedResponse<T>` |
| 账户 | `Account`, `AccountCategory`, `AccountStats` |
| 交易 | `Transaction`（5 种类型, fee/coupon），`TransactionCategory` |
| 预算 | `Budget`, `BudgetPrediction`, `BudgetStatus` |
| 报表 | `BalanceSheetReportData`, `IncomeExpenseReportData`, `CashFlowReportData`, `SankeyLink`, `InvestmentAnalysisReportData` |
| 投资 | `InvestmentAssetClass`, `InvestmentAllocationSnapshot`, `InvestmentReturnAnalysis`（XIRR/TWR） |
