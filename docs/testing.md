# MoneyBrain 测试

> 本文回答**测试放在哪、怎么跑、覆盖到什么程度**。编码要求见 [dev-guide.md](dev-guide.md) §9，不变量定义见 [requirements.md](requirements.md) §3.8。
> **不维护精确用例数**：数字随代码变化，以命令实际输出为准；本文只记层级、目录、命令与覆盖情况。

## 1. 层级

| 层级 | 工具 | 目录 | 说明 |
|---|---|---|---|
| 领域 | Node Test Runner + tsx | `packages/domain/tests/` | 金额、日期、分录、汇总不变量 |
| 同步 | Node Test Runner + tsx | `packages/sync/tests/` | 版本向量、记录级合并、冲突与引用（固定向量） |
| 后端单元 | Vitest | `apps/api/tests/unit/` | service 纯逻辑、Mock Prisma |
| 后端集成 | Vitest + Supertest | `apps/api/tests/integration/` | 路由 + 测试 SQLite |
| 前端单元 | Vitest + Testing Library | `apps/web/tests/unit/` | 组件、页面、错误态、文档口径守卫 |
| 端到端 | Playwright | `e2e/tests/` | 主旅程与响应式 |

## 2. 命令

```bash
npm run test:domain                    # 领域测试
npm run test:sync                      # 同步合并（固定向量）
npm run test:api                       # 后端全部
npm run test:web                       # 前端
npm run test:e2e                       # E2E（自动启动服务）
npm run db:verify                      # 数据自检：离线复核整本账
npm run db:drill                       # 恢复演练：导出 → 导入临时库 → 对比余额

# 只跑后端某一层 / 单个文件
npm run test:unit -w @moneybrain/api
npm run test:integration -w @moneybrain/api
cd apps/api && npx vitest run tests/unit/http.test.ts
cd apps/web && npx vitest run tests/unit/ErrorBoundary.test.tsx
```

集成测试在系统临时目录建本次运行独占的库：`tests/global-setup.ts` 用版本化迁移重建模板库，各测试文件复制独立副本，跑完自动删除。

## 3. 数据自检与恢复演练（不是单元测试）

`npm run db:verify` 用领域层重算整本账，核对：

1. 期末净资产 = 期初净资产 + 净收入 − 净支出 + 其他（不计收支、手续费、平账、开户前交易）；
2. 每笔转账满足 `Δ转出 + Δ转入 == −手续费`；
3. 可退余额 = `max(原额 − Σ退款, 0)` 仅为录入参考；超退与跨账户退款合法，只做信息性提示。

`npm run db:drill` 验证**备份能不能还原出同样的钱**：导出 → 导入临时库 → 用领域层重算两边账户余额 → 逐项对比。两者都只碰只读数据或临时库；改动导出/导入/余额/口径逻辑后必须跑。

### 3.1 真实库备份规范（SQLite WAL）

真实库 `apps/api/prisma/dev.db` 以 WAL 模式运行：提交先写 `dev.db-wal`，主文件不一定是全量最新数据。**只复制 `dev.db` 会漏掉未 checkpoint 的写入。**

- 备份一律用 `VACUUM INTO`（对源库只读，输出自包含普通库文件；目标文件必须不存在）：

  ```powershell
  sqlite3 "file:C:/.../dev.db" "VACUUM INTO 'C:/.../dev.db.vacuum-YYYYMMDD-HHMMSS.db'"
  ```

- 备份后必须校验：`PRAGMA integrity_check`、账户/流水/平帐条数、指定日末净资产，并对比现库与备份的流水行摘要（排序后 SHA256）。四项全等才算可用。
- `dev.db-wal` 非空即说明主文件落后；主文件头 `page_count` 是否追上 WAL 最后提交的 `dbsize` 才是「确实写回了」的硬指标，不能只看 `integrity_check = ok`。
- checkpoint（`PRAGMA wal_checkpoint(TRUNCATE)`）必须在停服窗口做：按 PID 树确认无 `with-database-url` / `tsx watch` / `src/index.ts` 进程后执行；端口空着不代表进程停了。返回 `(busy=0, ...)` 且 `-wal` 归零才算成功，前后核对条数与日末净资产不变再重启。
- 恢复同理：停服 → 移走 `dev.db-wal` / `dev.db-shm` → 用备份替换 `dev.db` → 校验 → 启动。**存在 `-wal` 时直接覆盖主文件会让 WAL 与主文件错配。**
- 含真实账目的快照放 `apps/api/prisma/rollback-points/`（已 gitignore，绝不入库）。

## 4. Mock 策略

| 层级 | 数据来源 |
|---|---|
| 领域 | 纯内存对象，无 mock |
| 同步 | 纯内存记录 + `test-vectors/merge-vectors.json` 固定向量，无 mock |
| 后端单元 | 各用例内 `vi.mock('../../src/prisma.js')` 内联 mock，不依赖共享 mock 文件 |
| 后端集成 | 系统临时目录下按运行唯一的 SQLite 库（见 §2） |
| 前端 | `apps/web/tests/setup.ts` 统一 mock matchMedia / ResizeObserver / IntersectionObserver / scrollTo；图表为纯 SVG 自绘，不涉及图表库 mock；页面测试 `vi.mock('../../../src/services/api')` 或注入 feature store 状态；无 AntD mock |
| E2E | `%TEMP%\moneybrain-e2e-<PID>` 独占临时库，**不读写 `dev.db`**；3001/3002 不复用已有服务，端口被占时明确报错 |

前端 `budget-progress.test.tsx` 会读 [ui-design.md](ui-design.md) 校验进度条 token 与口径未回退——改 UI 规范时该测试会提醒你同步实现。

## 5. 回归清单

### 5.1 记账不变量覆盖

定义见 [requirements.md](requirements.md) §3.8，下表是**覆盖情况的唯一来源**。

| 不变量 | 覆盖 | 位置 |
|---|---|---|
| 任意交易 `Σ postings.amount == 0` | ✅ | `packages/domain/tests/ledger.test.ts` |
| 退款：全额退款后余额回到原交易前 | ✅ | 同上 |
| 可退余额按 max(原额 − Σ退款, 0) 计算（超退合法，不判错） | ✅ | 同上 |
| 转账：`Δ转出 + Δ转入 == −fee` | ✅ | 同上 |
| 期初余额当天交易计入 | ✅ | 同上 |
| 期间半开 `[start, endExclusive)` | ✅ | `packages/domain/tests/date.test.ts` |
| 预算：退款冲减、跨期退款下限 0、未分类不计入、转账只算绑定账户对 | ✅ | `packages/domain/tests/budget.test.ts`、`packages/domain/tests/ledger.test.ts`、`apps/api/tests/unit/budget.service.test.ts`、`apps/web/tests/unit/budget-page-model.test.ts` |
| 资产负债表：分类树逐级小计、负债按欠款正数列示、顶层负债先求和再 abs、按 sort 稳定排序、预测变化量符号口径 | ✅ | `packages/domain/tests/balance-sheet.test.ts`（6 例固定输入 + 迁移前输出快照）；迁移前后 5 组 `generateBalanceSheet` DTO 逐字段对照差异 0（一次性脚本，不入库） |
| 收入支出表：退款冲减、分类净额、未分类节点、不计收支口径、对账条差额、预测半开窗口过滤 | ✅ | `apps/api/tests/unit/income-expense.service.test.ts`、`packages/domain/tests/income-expense.test.ts`（10 例固定输入 + 迁移前输出快照）；迁移前后 7 组收支表 / 投影 DTO 逐字段对照差异 0（一次性脚本，不入库） |
| 三来源投影：planned=null 语义、逐桶汇总、分类树子树聚合、hasBudget / hasFuture、两份 buildTree 合并为一份骨架 | ✅ | `packages/domain/tests/income-expense.test.ts`、`apps/api/tests/integration/projection-detail.route.test.ts` |
| 现金流量表：支出退款算流入、收入退款算出流 | ✅ | `apps/api/tests/unit/cash-flow-aggregate.test.ts` |
| 口径版本：旧交易按写入版本解释、未知版本失败、已登记版本不可覆盖、SQL 与明细路径数字一致 | ✅ | `packages/domain/tests/ledger.test.ts`、`packages/domain/tests/budget.test.ts` |
| 投影推演：四粒度桶与未来上限、三来源合成（`planned=null`）、occurrence 互斥、资产 / 现金流推演与期间计划 | ✅ | `packages/domain/tests/projection.test.ts`（19 例固定输入 + 迁移前输出快照）、`apps/api/tests/integration/projection.route.test.ts`、`projection-detail.route.test.ts` |
| 已有退款的交易不能改类型 | ✅ | `apps/api/tests/unit/transaction.service.test.ts` |
| 破坏性操作必须带确认值 | ✅ | `apps/api/tests/unit/validators.test.ts` |
| 备份格式带 schemaVersion，新版备份不被旧应用导入 | ✅ | `apps/api/tests/unit/backup.service.test.ts` |
| 对账恒等式（含「其他」四项） | ✅ | `apps/api/tests/unit/income-expense.service.test.ts` |
| 预算用量在周期最后一天计入 | 🔄 实现已用 `periodOf` 半开区间，缺专门断言 | — |
| `Σ 所有账户余额 == 净资产` | 🔄 单账户余额已测，聚合恒等式未断言 | — |

### 5.2 其他回归项

同一 CSV 重复导入不产生重复交易（`importKey`）；报表合计与分类明细一致（含未分类）；投资快照前链在增删改后重排且无自引用；失败时页面显示错误而不是 0。

### 5.3 同步不变量（7–11）

| 不变量 | 覆盖 | 位置 |
|---|---|---|
| 7 同步可重放 | 🔄 记录层已覆盖（固定向量、任意顺序、墓碑/悬空引用）；整库余额与报表级重放未断言 | `packages/sync/tests/merge.test.ts` |
| 8 冲突不静默 | ✅ 输的一版落库且不重复；解决后保留、不再待处理 | `apps/api/tests/integration/sync-conflict.test.ts`、`packages/sync/tests/merge.test.ts` |
| 9 密文出端 | ✅ 明文 JSON 不出现在容器中、恢复码/密钥不写文件 | `packages/sync/tests/container.test.ts` |
| 10 合并与传输解耦 | ✅ 记录层合并结果与到达顺序无关 | `packages/sync/tests/merge.test.ts` |
| 11 加密不降级 | ✅ 备份容器与同步容器共用加密格式 | `packages/sync/tests/container.test.ts`、`apps/api/tests/unit/backup.service.test.ts` |

### 5.4 尚未覆盖（列入计划）

整库级同步重放（不变量 7 的余额/报表断言）、同步输出经真实传输介质端到端验证。见 [roadmap.md](roadmap.md) §7。

## 6. 验证顺序

`domain → lint → typecheck → test`。提交前至少跑：

```bash
npm run test:domain
npm run lint
npm run typecheck
npm test
npm run build
```

改动涉及后端 schema 时额外跑 `npm run test:integration -w @moneybrain/api`；动金额/口径/导入导出/余额逻辑再加 `npm run db:verify` 与 `npm run db:drill`。
