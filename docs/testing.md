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
npm run db:drill                       # 恢复演练：导出 → 导入临时库 → 对比余额

# 只跑后端某一层
npm run test:unit -w @moneybrain/api
npm run test:integration -w @moneybrain/api

# 只跑单个文件
cd apps/api && npx vitest run tests/unit/http.test.ts
cd apps/web && npx vitest run tests/unit/components/ErrorState.test.tsx
```

集成测试会先自动创建/同步 `apps/api/prisma/test.db`（`tests/global-setup.ts`，用版本化迁移重建）。

## 3. 当前规模

| 范围 | 文件 | 用例 |
|---|---|---|
| 领域 | 2 | 22 |
| 后端 | 26 | 269 |
| 前端 | 10 | 86 |
| E2E | 6 个 spec | onboarding、theme、responsive ×2、settings、example |

## 3.1 数据自检与恢复演练（不是单元测试）

`npm run db:verify` 用领域层重算整本账，核对这些等式：

1. 期末净资产 = 期初净资产 + 净收入 − 净支出 + 其他（不计收支、手续费、平账、开户前交易）；
2. 每笔转账满足 Δ转出 + Δ转入 == −手续费；
3. 每笔退款不超过原交易剩余可退金额。

`npm run db:drill` 验证**备份能不能还原出同样的钱**：导出 → 导入临时库 → 用领域层重算两边的账户余额 → 逐项对比。
两者都只碰只读数据或临时库；改动导出/导入/余额/口径逻辑后必须跑。

## 4. Mock 策略

| 层级 | 数据来源 |
|---|---|
| 领域 | 纯内存对象，无 mock |
| 后端单元 | `createMockPrisma()`（`apps/api/tests/mocks/prisma.ts`） |
| 后端集成 | `apps/api/prisma/test.db`（测试前由 `tests/global-setup.ts` 用版本化迁移重建） |
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
| 预算：退款冲减、跨期退款下限为 0、未分类不计入、转账只算绑定的那一对账户 | ✅ | `packages/domain/tests/ledger.test.ts`、`apps/api/tests/unit/budget.service.test.ts` |
| 收入支出表：退款冲减、分类净额、未分类节点、不计收支口径、对账条差额 | ✅ | `apps/api/tests/unit/income-expense.service.test.ts` |
| 现金流量表：支出退款算流入、收入退款算出流、原类型不明的退款不计入 | ✅ | `apps/api/tests/unit/cash-flow-aggregate.test.ts` |
| 已有退款的交易不能改类型 | ✅ | `apps/api/tests/unit/transaction.service.test.ts` |
| 破坏性操作必须带确认值 | ✅ | `apps/api/tests/unit/validators.test.ts` |
| 备份格式带 schemaVersion，新版备份不被旧应用导入 | ✅ | `apps/api/tests/unit/backup.service.test.ts` |
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
| 投资分析 | `apps/api/src/services/report/investment-analysis-*` | 收益分层、外部现金流与本金分离 |
| 备份与恢复 | `apps/api/src/services/backup.service.ts` | 往返一致、`schemaVersion` 写入 |
| 清库 | `apps/api/src/services/clear-data.service.ts` | 按范围清空、不误删范围外数据 |

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
