# MoneyBrain 测试系统

## 测试层级

| 层级 | 工具 | 范围 | 目录 |
|------|------|------|------|
| 后端单元 | Vitest | Common 模块、Service 纯逻辑 | `backend/tests/unit/` |
| 后端集成 | Vitest + Supertest | API 路由、数据库交互 | `backend/tests/integration/` |
| 前端单元 | Vitest + React Testing Library | 组件渲染与交互 | `frontend/tests/unit/` |
| 端到端 | Playwright | 完整用户流程 | `e2e/tests/` |

## 配置

- 后端 3 个 vitest 配置：`vitest.config.ts`（默认）、`vitest.unit.config.ts`、`vitest.integration.config.ts`
- 后端 `fileParallelism: false` — 测试文件内顺序执行
- 全局测试超时 10s（`tests/setup.ts` 中 `vi.setConfig({ testTimeout: 10000 })`）
- Vitest `@` 别名仅配置在 vitest 配置中（生产代码使用相对 `.js` 导入）
- Playwright 5 项目：chromium-desktop、firefox-desktop、webkit-desktop、tablet、mobile

## 命令

```bash
# 全部
npm test                         # 后端 + 前端单元/集成
npm run test:e2e                 # E2E（自动启动服务器）

# 后端
cd backend && npm run test:unit        # 单元测试
cd backend && npm run test:integration # 集成测试
cd backend && npm test                 # 全部

# 前端
cd frontend && npm test                # 全部
cd frontend && npm run test:coverage   # 覆盖率
```

## Mock 策略

| 测试类型 | 数据库/API |
|----------|-----------|
| 后端单元 | `createMockPrisma()`（`backend/tests/mocks/prisma.ts`）— Mock Prisma Client |
| 后端集成 | `backend/prisma/test.db` — 独立 SQLite 文件 |
| 前端单元 | 测试 setup 自动 mock：antd message/notification/modal、echarts-for-react、matchMedia、ResizeObserver、IntersectionObserver |
| E2E | 开发数据库，`clearAllTestData()`（DELETE `/api/data/all`）清理数据 |

## 后端测试

- 单元测试目录 `backend/tests/unit/`（13 个测试文件）
- 集成测试目录 `backend/tests/integration/`（2 个测试文件）
- 测试数据工厂：`backend/tests/factories/`
- Mock Prisma：`backend/tests/mocks/prisma.ts`

## 前端测试

- 目录 `frontend/tests/unit/`
- 测试 setup 全局配置见 `frontend/tests/setup.ts`
- API mock：`frontend/tests/mocks/api.ts`

## E2E 测试

- 6 个 spec：`onboarding.spec.ts`、`theme.spec.ts`、`responsive-desktop.spec.ts`、`responsive-mobile.spec.ts`、`settings.spec.ts`、`example.spec.ts`
- 辅助函数：`e2e/helpers/test-data.ts`
- Playwright 自动启动前后端服务器（`playwright.config.ts` webServer 配置）
