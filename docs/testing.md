# MoneyBrain 测试

> 本文回答**测试放在哪、怎么跑、覆盖到什么程度**。编码要求见 [dev-guide.md](dev-guide.md) 第 9 节。
> 什么时候看：新增测试、判断某条不变量有没有覆盖、或改测试基础设施时。基线命令与当前实测数字见 §1–§3。

## 1. 层级

| 层级 | 工具 | 目录 | 说明 |
|---|---|---|---|
| 领域 | Node Test Runner + tsx | `packages/domain/tests/` | 金额、日期、分录、汇总不变量 |
| 同步 | Node Test Runner + tsx | `packages/sync/tests/` | 版本向量、记录级合并、冲突与引用（固定向量） |
| 后端单元 | Vitest | `apps/api/tests/unit/` | service 纯逻辑、Mock Prisma |
| 后端集成 | Vitest + Supertest | `apps/api/tests/integration/` | 路由 + 测试 SQLite |
| 前端单元 | Vitest + Testing Library | `apps/web/tests/unit/` | 组件、页面、错误态 |
| 端到端 | Playwright | `e2e/tests/` | 主旅程与响应式 |

## 2. 命令

```bash
npm run test:domain                    # 领域测试
npm run test:sync                      # 同步合并（固定向量）
npm run test:api                       # 后端全部
npm run test:web                       # 前端
npm run test:e2e                       # E2E（自动启动服务）
npm run db:drill                       # 恢复演练：导出 → 导入临时库 → 对比余额

# 只跑后端某一层
npm run test:unit -w @moneybrain/api
npm run test:integration -w @moneybrain/api

# 只跑单个文件
cd apps/api && npx vitest run tests/unit/http.test.ts
cd apps/web && npx vitest run tests/unit/components/ErrorBoundary.test.tsx
```

集成测试在系统临时目录建本次运行独占的库：`tests/global-setup.ts` 用版本化迁移重建模板库，各测试文件复制独立副本，跑完自动删除。

## 3. 当前规模

| 范围 | 文件 | 用例 |
|---|---|---|
| 领域 | 5 | 42 |
| 同步 | 4 | 21 |
| 后端 | 58 | 489 |
| 前端 | 51 | 355 |
| E2E | 6 个 spec | prod-loop、prod-w1、hf-overview、hf-reports、settings、responsive |

> 2026-11-08 实测：`npm run test:domain` 42 通过；`npm run test:sync` 21 通过；`npm run test:api` 489 通过（58 文件）；`npm run test:web` 355 通过（51 文件）。E2E 为 spec 文件数。

## 3.1 数据自检与恢复演练（不是单元测试）

`npm run db:verify` 用领域层重算整本账，核对这些等式：

1. 期末净资产 = 期初净资产 + 净收入 − 净支出 + 其他（不计收支、手续费、平账、开户前交易）；
2. 每笔转账满足 Δ转出 + Δ转入 == −手续费；
3. 可退余额 = max(原额 − Σ退款, 0)，仅为录入参考；超退与跨账户退款合法，只做信息性提示（决策见 requirements §3）。

`npm run db:drill` 验证**备份能不能还原出同样的钱**：导出 → 导入临时库 → 用领域层重算两边的账户余额 → 逐项对比。
两者都只碰只读数据或临时库；改动导出/导入/余额/口径逻辑后必须跑。

### 3.2 真实库备份规范（SQLite WAL）

真实库 `apps/api/prisma/dev.db` 以 WAL 模式运行：提交先写 `dev.db-wal`，主文件不一定是全量最新数据。**只复制 `dev.db` 会漏掉未 checkpoint 的写入**（已踩过：裸拷贝出的备份流水/余额比现库少）。

- 备份一律用 `VACUUM INTO`（对源库是只读快照，输出一个自包含的普通库文件；目标文件必须不存在）：

  ```powershell
  sqlite3 "file:C:/.../dev.db" "VACUUM INTO 'C:/.../dev.db.vacuum-YYYYMMDD-HHMMSS.db'"
  # 没有 sqlite3 CLI 时等价写法
  python -c "import sqlite3; sqlite3.connect(r'C:/.../dev.db').execute(\"VACUUM INTO 'C:/.../backup.db'\")"
  ```

- 备份后必须校验：`PRAGMA integrity_check`、账户/流水/平帐条数、指定日末净资产，并对比现库与备份的流水行摘要（`id|type|amount|date|accountId|...` 排序后 SHA256）。四项数字全等、行摘要相同才算备份可用。
- `dev.db-wal` 非空即说明主文件落后。WAL 帧数 = `(文件大小 − 32) / (24 + page_size)`；帧头 `dbsize != 0` 表示该帧有提交。主文件头 `page_count` 小于 WAL 最后提交的 `dbsize` 时，差值就是尚未 checkpoint 的页数。
- checkpoint（`PRAGMA wal_checkpoint(TRUNCATE)`）必须在停服窗口做：停掉全部持有连接的 API 进程（`src/index.ts` 的 tsx watch 链），确认无连接后执行；返回 `(busy=0, log, checkpointed)` 且 `dev.db-wal` 归零为成功。执行前后核对条数与日末净资产，数字不变再重启服务。
- **实证（2026-11-08）：** checkpoint 后主文件头 `page_count` 从 414 → 418，正好等于 checkpoint 前 WAL 最后提交声明的 `dbsize`（418）；`dev.db-wal` 从 626,272 B 归零并删除。`page_count` 是否追上 `dbsize` 才是「确实写回了」的硬指标，不能只看 `integrity_check = ok`。
- **实证（2026-11-08）：** 端口空着不代表进程停了——3001/3002 无监听时仍有 3 条 `dev:api` 链在运行。必须按 PID 树复核 `with-database-url` / `tsx watch` / `src/index.ts` 并用 `taskkill /PID <顶层PID> /T /F` 清掉，才算真正停服。
- **实证（2026-11-08）：** VACUUM 备份连接正常关闭会先自动 checkpoint（本次备份完成后 `page_count` 已是 418、WAL 归零）；随后显式 `PRAGMA wal_checkpoint(TRUNCATE)` 返回 `(0, 0, 0)` 属正常，不代表没写回。
- 恢复同理：停服 → 移走 `dev.db-wal` / `dev.db-shm` → 用备份替换 `dev.db` → 校验 → 启动。**存在 `-wal` 时直接覆盖主文件，会让 WAL 与主文件错配。**
- `*db.vacuum-*`、预算/数据清理清单等含真实账目的快照放 `apps/api/prisma/rollback-points/`（已 gitignore，绝不入库）。

## 4. Mock 策略

| 层级 | 数据来源 |
|---|---|
| 领域 | 纯内存对象，无 mock |
| 同步 | 纯内存记录 + `test-vectors/merge-vectors.json` 固定向量，无 mock |
| 后端单元 | `createMockPrisma()`（`apps/api/tests/mocks/prisma.ts`） |
| 后端集成 | 系统临时目录下按运行唯一的 SQLite 库；`tests/global-setup.ts` 用版本化迁移重建模板，各测试文件复制独占副本，跑完删除 |
| 前端 | `apps/web/tests/setup.ts` 统一 mock matchMedia / ResizeObserver / IntersectionObserver / scrollTo；图表为纯 SVG 自绘，不涉及图表库 mock；页面测试用 `vi.mock('../../../src/services/api')` 或注入 feature store 状态；无 AntD mock |
| E2E | 开发数据库；`clearAllTestData()` 清理。**运行前先备份 `apps/api/prisma/dev.db`，E2E 会清空全部数据。** |

## 5. 回归清单

### 5.1 记账不变量覆盖

不变量的定义见 [rewrite-blueprint.md](rewrite-blueprint.md) §4（内核 1–6 条、同步 7–11 条、界面 12 条）；
下表是**覆盖情况的唯一来源**。

| 不变量 | 覆盖 | 位置 |
|---|---|---|
| 任意交易 `Σ postings.amount == 0` | ✅ | `packages/domain/tests/ledger.test.ts` |
| 退款：全额退款后余额回到原交易前 | ✅ | 同上 |
| 可退余额按 max(原额 − Σ退款, 0) 计算（超退合法，不判错） | ✅ | 同上 |
| 转账：`Δ转出 + Δ转入 == −fee` | ✅ | 同上 |
| 期初余额当天交易计入 | ✅ | 同上 |
| 期间半开 `[start, endExclusive)` | ✅ | `packages/domain/tests/date.test.ts`（`periodOf` 各周期边界） |
| 预算：退款冲减、跨期退款下限为 0、未分类不计入、转账只算绑定的那一对账户、月度头部不并入周/年 | ✅ | `packages/domain/tests/ledger.test.ts`、`apps/api/tests/unit/budget.service.test.ts`、`apps/web/tests/unit/budget-page-model.test.ts` |
| 收入支出表：退款冲减、分类净额、未分类节点、不计收支口径、对账条差额 | ✅ | `apps/api/tests/unit/income-expense.service.test.ts` |
| 现金流量表：支出退款算流入、收入退款算出流、原类型不明的退款不计入 | ✅ | `apps/api/tests/unit/cash-flow-aggregate.test.ts` |
| 口径版本：旧交易按写入时的版本解释，新增版本不改历史数字 | ✅ | `packages/domain/tests/ledger.test.ts`（「新增口径版本后，旧交易的余额与报表数字保持不变」） |
| 口径版本：未知版本直接失败，不被当前规则静默解释 | ✅ | 同上（「未知口径版本的交易直接失败」） |
| 口径版本：已登记版本不可覆盖 | ✅ | 同上（「已登记的口径版本不能被覆盖」） |
| 口径版本：SQL 聚合路径与明细路径数字一致 | ✅ | 同上（「聚合行汇总与明细汇总结果一致」） |
| 已有退款的交易不能改类型 | ✅ | `apps/api/tests/unit/transaction.service.test.ts` |
| 破坏性操作必须带确认值 | ✅ | `apps/api/tests/unit/validators.test.ts` |
| 备份格式带 schemaVersion，新版备份不被旧应用导入 | ✅ | `apps/api/tests/unit/backup.service.test.ts` |
| 预算用量在周期最后一天计入 | 🔄 实现已用 `periodOf` 半开区间，缺专门断言 | — |
| `Σ 所有账户余额 == 净资产` | 🔄 单账户余额已测，聚合恒等式未断言 | — |
| 对账恒等式：`期末净资产 − 期初净资产 == 净收入 − 净支出 + 其他`（其他 = 不计收支 + 手续费 + 平账 − 期初前流水） | ✅ | `apps/api/tests/unit/income-expense.service.test.ts`（「对账条在数字自洽时差额为 0」） |

### 5.2 其他回归项

- [x] 同一 CSV 重复导入不产生重复交易（`importKey`）。
- [x] 报表合计与分类明细一致（含未分类）。
- [x] 投资快照前链在增删改后重排且无自引用。
- [x] 失败时页面显示错误而不是 0（前端错误态）。

### 5.3 同步不变量（7–11）

| 不变量 | 覆盖 | 位置 |
|---|---|---|
| 7 同步可重放 | 🔄 记录层已覆盖（固定向量、任意顺序、墓碑/悬空引用）；整库余额与报表级重放未断言 | `packages/sync/tests/merge.test.ts` |
| 8 冲突不静默 | ✅ 输的一版落库且不重复；解决后保留、不再待处理 | `apps/api/tests/integration/sync-conflict.test.ts`、`packages/sync/tests/merge.test.ts` |
| 9 密文出端 | ✅ 容器层覆盖（明文 JSON 不出现在容器中、恢复码/密钥不写文件） | `packages/sync/tests/container.test.ts` |
| 10 合并与传输解耦 | ✅ 记录层合并结果与到达顺序无关 | `packages/sync/tests/merge.test.ts`（「任意顺序应用两次…」） |
| 11 加密不降级 | ✅ 备份容器与同步容器共用加密格式 | `packages/sync/tests/container.test.ts`、`apps/api/tests/unit/backup.service.test.ts` |

### 5.4 尚未覆盖（列入计划）

- [ ] 整库级同步重放（不变量 7 的余额/报表断言）。
- [ ] 同步输出版本经真实传输介质端到端验证（G 批未开始）。

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
