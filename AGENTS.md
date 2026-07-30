# MoneyBrain Agent Guide

MoneyBrain 个人记账软件。前后端分离 monorepo。

## 仓库结构

```
MoneyBrain/
├── frontend/       # React + Vite + TypeScript SPA
│   ├── src/pages/      # 5 个页面（Dashboard, Transactions, Budgets, Reports, Settings）
│   ├── src/components/ # charts/, common/, budgets/, reports/, settings/, transactions/, investment/
│   ├── src/queries/    # React Query hooks（account, transaction, budget, report, analytics...）
│   ├── src/services/   # 单文件 api.ts — Axios 实例 + 领域 API 对象
│   ├── src/styles/     # 样式文件 + theme/（设计令牌、CSS 变量）
│   └── src/hooks/      # useIsMobile, useNotify
├── backend/        # Express + Prisma + TypeScript API
│   ├── src/routes/  # 9 个 *.route.ts（kebab-case 命名）
│   ├── src/services/# 业务逻辑（account, transaction, budget, report/, import/, export/, investment/）
│   └── src/common/  # 错误类（7 种）、HTTP 辅助、验证器、日志（pino）
├── shared/         # shared/types/index.ts（API 类型）、shared/utils/tree.ts
├── e2e/            # Playwright 端到端测试（6 个 spec）
└── docs/           # 项目文档
```

各包独立依赖，根 `package.json` 通过 `concurrently` 协调。

## 命令速查

```bash
npm run install:all  # 安装前后端依赖
npm run dev          # 同时启动前后端
npm run build        # 构建前后端
npm run test         # 单元 + 集成测试
npm run test:e2e     # Playwright E2E 测试
npm run lint         # lint 后端 + 前端
```

### 前端 (cd frontend)

```bash
npm run dev         # Vite dev (port 3002)
npm run test        # vitest run
npm run typecheck   # tsc --noEmit
```

### 后端 (cd backend)

```bash
npm run dev         # tsx watch (port 3001)
npm run test        # vitest run
npm run test:unit   # 单元测试
npm run test:integration # 集成测试
npm run db:migrate  # prisma migrate dev
npm run db:seed     # 种子数据
```

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | React 18, TypeScript, Vite, Ant Design 6, ECharts, TanStack React Query, Axios, @dnd-kit |
| 后端 | Express, TypeScript, Prisma ORM (SQLite), pino 日志 |
| 测试 | Vitest, React Testing Library, Supertest, Playwright |

## 核心约定

- 代码注释中文，变量/函数命名英文
- 前端组件: `PascalCase.tsx`, `React.FC<Props>`, `export default`
- 后端路由: `kebab-case.route.ts`，Service: `kebab-case.service.ts`
- API: kebab-case (`/api/account-categories`), 响应统一 `ApiResponse<T>` 包装
- 状态: 无 Zustand — React Query + 本地 hooks
- 测试验证顺序: `lint → typecheck → test`
- **禁止自动 git 提交/推送**，除非用户明确要求

## 详细参考

- [docs/dev-guide.md](docs/dev-guide.md) — 完整开发规范
- [docs/architecture.md](docs/architecture.md) — 架构与数据流
- [docs/testing.md](docs/testing.md) — 测试系统指南
- [docs/README.md](docs/README.md) — 文档索引
