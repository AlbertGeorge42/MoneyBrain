# MoneyBrain 测试

> 本文回答**测试放在哪、怎么跑、覆盖到什么程度**。编码要求见 [dev-guide.md](dev-guide.md) 第 9 节。

## 1. 层级

| 层级 | 工具 | 目录 | 说明 |
|---|---|---|---|
| 领域 | Node Test Runner + tsx | `packages/domain/tests/` | 金额、日期、分录、汇总不变量 |
| 后端单元 | Vitest | `apps/api/tests/unit/` | service 纯逻辑、Mock Prisma |
| 后端集成 | Vitest + Supertest | `apps/api/tests/integration/` | 路由 + 测试 SQLite |
| 前端单元 | Vitest + Testing Library | `apps/web/tests/unit/` | 组件、页面、错误态 |
| 端到端 | Playwright | `e2e/tests/` | 主旅程与响应式 |

## 2. 命令

```bash
npm run test:domain                    # 领域测试
npm run test:api                       # 后端全部
npm run test:web                       # 前端
npm run test:e2e                       # E2E（自动启动服务）

# 只跑后端某一层
npm run test:unit -w @moneybrain/api
npm run test:integration -w @moneybrain/api

# 只跑单个文件
cd apps/api && npx vitest run tests/unit/http.test.ts
cd apps/web && npx vitest run tests/unit/components/ErrorState.test.tsx
```

集成测试会先自动创建/同步 `apps/api/prisma/test.db`（`tests/global-setup.ts`）。

## 3. 当前规模

| 范围 | 文件 | 用例 |
|---|---|---|
| 领域 | 2 | 18 |
| 后端 | 21 | 242 |
| 前端 | 10 | 86 |
| E2E | 6 个 spec | onboarding、theme、responsive ×2、settings、example |

## 4. Mock 策略

| 层级 | 数据来源 |
|---|---|
| 领域 | 纯内存对象，无 mock |
| 后端单元 | `createMockPrisma()`（`apps/api/tests/mocks/prisma.ts`） |
| 后端集成 | `apps/api/prisma/test.db`（测试前自动 `db push`） |
| 前端 | `apps/web/tests/setup.ts` 统一 mock AntD / ECharts / matchMedia / ResizeObserver；页面测试用 `vi.mock('../../../src/queries/xxx')` 注入查询状态 |
| E2E | 开发数据库；`clearAllTestData()` 清理。**运行前先备份 `apps/api/prisma/dev.db`，E2E 会清空全部数据。** |

## 5. 回归清单

### 5.1 记账不变量覆盖

6 条不变量的定义见 [rewrite-blueprint.md](rewrite-blueprint.md) §2；下表是**覆盖情况的唯一来源**。

| 不变量 | 覆盖 | 位置 |
|---|---|---|
| 任意交易 `Σ postings.amount == 0` | ✅ | `packages/domain/tests/ledger.test.ts` |
| 退款：全额退款后余额回到原交易前 | ✅ | 同上 |
| 退款：退款额 ≤ 可退余额 | ✅ | 同上 |
| 转账：`Δ转出 + Δ转入 == −fee` | ✅ | 同上 |
| 期初余额当天交易计入 | ✅ | 同上 |
| 期间半开 `[start, endExclusive)` | ✅ | `packages/domain/tests/date.test.ts`（`periodOf` 各周期边界） |
| 预算用量在周期最后一天计入 | 🔄 实现已用 `periodOf` 半开区间，缺专门断言 | — |
| `Σ 所有账户余额 == 净资产` | 🔄 单账户余额已测，聚合恒等式未断言 | — |
| `期末净资产 − 期初净资产 == 净收入 − 净支出` | ⬜ 未覆盖（报表无对账条） | — |

### 5.2 其他回归项

- [x] 同一 CSV 重复导入不产生重复交易（`importKey`）。
- [x] 报表合计与分类明细一致（含未分类）。
- [x] 投资快照前链在增删改后重排且无自引用。
- [x] 失败时页面显示错误而不是 0（前端错误态）。

### 5.3 完全没有测试的模块

这些模块决定用户看到的数字或数据安全，目前**一行单测都没有**——是蓝图批次 A5 的第一批对象。

| 模块 | 位置 | 该测什么 |
|---|---|---|
| 预算用量与状态 | `apps/api/src/services/budget.service.ts` | 正常值、退款冲减、跨期退款（用量下限 0）、转账预算的账户侧、周期末日 |
| 收入支出表 | `apps/api/src/services/report/income-expense.service.ts` | 净收入/净支出、退款冲减、未分类、期初期末自洽 |
| 现金流量表 | `apps/api/src/services/report/cash-flow-*` | 三活动 + 未分类合计 == 总流入/流出、手续费单列 |
| 投资分析 | `apps/api/src/services/report/investment-analysis-*` | 收益分层、外部现金流与本金分离 |
| 备份与恢复 | `apps/api/src/services/backup.service.ts` | 往返一致、`schemaVersion` 写入 |
| 清库 | `apps/api/src/services/clear-data.service.ts` | 按范围清空、不误删范围外数据 |
| 交易列表统计 | `apps/api/src/services/transaction.service.ts` | 统计口径与报表口径一致 |

### 5.4 尚未覆盖（列入计划）

- [ ] 导入中断后的回滚点。
- [ ] 旧数据迁移的 v1 → v2 对账报告。
- [ ] 报表对账条：`期初 + 净收入 − 净支出 = 期末`。

## 6. 验证顺序

`domain → lint → typecheck → test`。提交前至少跑：

```bash
npm run test:domain
npm run lint
npm run typecheck
npm test
npm run build
```

改动涉及后端 schema 时额外跑 `npm run test:integration -w @moneybrain/api`。
