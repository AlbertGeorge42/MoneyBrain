# 蓝图推进状态

> 差距条目完成状态的**唯一来源**。领条目、销条目都在这里登记。
> 已完成条目一行收口：`✅ <提交> · 一句话结论`；细节回查 git 历史，不再复述。
> 未完成条目只在所属阶段文档定义（[stage-0](stage-0-foundation.md)–[stage-4](stage-4-expansion.md)）。
> 不变量覆盖状态见 [../testing.md](../testing.md) §5.1（不变量的唯一来源）。
> **并行会话**：多个会话共用工作区时，只改自己条目对应的行；提交前 `git diff --cached -U1` 逐行核对，不得带入他人未提交改动。

## 状态

| 条目 | 阶段 | 完成于 | 结论 |
|---|---|---|---|
| A0 | 阶段 0 · M0 | 2026-11-03 | ✅ `32f2afe` · 清库三场景集成测试；转账转入本金收进领域层 `transferInflow` |
| A1 | 阶段 0 · M0 | （历史） | ✅ · 历史条目，明细见 git 历史 |
| A2 | 阶段 0 · M0 | （历史） | ✅ · 同上 |
| A3 | 阶段 0 · M0 | 2026-11-03 | ✅ `4b318ba` · fast-check 属性测试覆盖内核不变量 1–6 |
| B1 | 阶段 0 · M0 | 2026-10-28 | ✅ `fb87eeb` · 覆盖导入回滚点 + 导入预览 |
| B2 | 阶段 0 · M0 | 2026-11-02 | ✅ `c24b685` · 交易软删除 + 审计事件 + 撤销 + 回收站 |
| B3 | 阶段 0 · M0 | 2026-11-02 | ✅ `e773ff6` · 自动定时备份（24h 到期 + 长任务空闲，用户不设时刻） |
| B4 | 阶段 0 · M0 | 2026-11-03 | ✅ `7196a02` · 退款放开超退/跨账户；`db:verify` 手续费符号修正、超退降为信息提示 |
| C1 | 阶段 0 · M0 | 2026-11-03 | ✅ `4e6878e` · 四张报表共享一个全局期间；余额类指标统一带「期末」 |
| C2 | 阶段 0 · M0 | 2026-11-03 | ✅ `a3f61cd` · 预算下钻与用量同源（`budgetContributionSign`），新增 usage-details API |
| C3 | 阶段 0 · M0 | 2026-11-03 | ✅ `4612b5b` · 预算使用率不截断，超支显示真实百分比 |
| C4 | 阶段 0 · M0 | 2026-11-03 | ✅ `062505d` · 桑基图退款方向改走 `refundOffsetKind`，与活动表同源 |
| D1 | 阶段 0 · M1 | 2026-11-03 | ✅ `662ebb3` · 七个实体收进 repository，service 层 `prisma.<model>.` 归零 |
| D2 | 阶段 0 · M1 | 2026-11-03 | ✅ `048df1e` · 共享类型收敛 contracts（`TransactionType` / `AutoBackupConfig` / `SankeyLink`） |
| D3 | 阶段 0 · M1 | 2026-11-03 | `3161237` API 响应类型收敛 contracts（按决策 #39 最小实现：删内联、单一来源、不写适配层，前端从简）：api.ts 的 22 处 `ApiResponse<{...}>` 内联全部替换为 contracts 新增的 14 个具名响应类型（MessageResult / AccountBalanceAtResult / AccountDeleteResult / TransactionCategoryDeleteResult / TransactionCategoryMoveResult / TransactionStats / EarliestTransactionDateResult / TransactionDeleteResult / AuditEventHistoryResult / RecycleBinResult / DashboardSummaryData / AssetClassDeleteResult / ImportBackupResult / DetectFileResult，其中 DetectFileResult.includes 按后端实际返回收紧为 `BackupDataType[]`、各 Result 的 optional 字段与后端分支返回形状逐一核对）；后端 transaction.service 的 `TransactionStats` interface（number 版重复定义）删除改 import contracts 的 Minor 版——同名类型只剩一个来源；api.ts 既有 re-export 链保持，组件消费者零改动。验收：`rg "ApiResponse<\{" apps/web/src` 0 命中（迁移前 22 处）；typecheck 三包 0 错、lint 0 错、test:web 12 文件 + test:api 33 文件全过 |
| D5 | 阶段 0 · M1 | 2026-11-03 | `41b80bd` 删桶导出、react-refresh 警告归零（按决策 #39 最小实现：删桶、消费者直连具体文件，不留兼容 re-export）：settings/shared.tsx（3 个 `export *` 桶，treeTypes / sortable / moveModalHelpers）删除，4 个消费者（AccountConfigModal / CashFlowConfigModal / TransactionConfigModal / InvestmentAssetClassConfigModal）import 拆直连三个源文件，settings/index.ts 的 `export * from './shared'` 行删除；TransactionItemRow.tsx 的两个非组件导出（getCategoryName / getAccountName）移入 utils/transaction.ts 纯函数工具文件，TransactionDetail / RecycleBinSection 改从 utils 取、TransactionItemRow 自身本地改 import。验收：`npm run lint` react-refresh 警告 **0**（总数 10 → 5，剩余 5 条全为 react-hooks/exhaustive-deps 历史遗留——图表组件 useMemo 依赖写法问题，不属本条目）；shared 残留引用 grep 0 命中；typecheck 三包 0 错、test:web 12 文件全过 |
| D6 | 阶段 0 · M1 | 2026-11-03 | `005faff` SQLite WAL + busy_timeout + 写串行化：**基线实测**（dev.db 副本）journal_mode=delete、busy_timeout=5000ms（Prisma 驱动隐式默认）；短写并发三种模式（单客户端 8 路 / 独立连接 8 路 / 双进程 2×4）全部成功、长事务 1.5s 期间 4 路短写各排队 ~1.4s 成功——busy_timeout 在兜底，但 `runExclusiveLongTask` 名为锁实为**计数器**，长任务可并发抢库级写锁（dev-guide 声称的「严格互斥」实现上不存在）。改法两处：① `prisma.ts` 启动时 `$queryRawUnsafe('PRAGMA journal_mode = WAL')` + `PRAGMA busy_timeout = 5000`（WAL 库级持久、幂等；必须 queryRaw 因返回结果行——execute 版实测报 P2010 已修；失败退回默认即改前行为），实测 dev.db 已切 wal；② `runExclusiveLongTask` 计数器改真串行队列（promise 链：秒级长任务不互抢写锁、失败不堵队列；用户写不进队列，Prisma 内部排队 + busy_timeout 足够）。**否掉的方案**：用户写也进长任务锁（毫秒级写排队进秒级锁，无必要）、SQLite 重试层（busy_timeout 已排队，重试是第二套口径）、外部队列（单进程无必要）。改后同压测复跑全部成功。**连带影响结论**：恢复 = ATTACH 逐表复制不替换 db 文件 → 无 `-wal`/`-shm` 残留旧数据问题；`-wal` 最后连接关闭时自动清除（实测 dev.db 关闭后无残留文件）；`.gitignore` 补 `*.db-wal`/`*.db-shm`（`*.db.*` 匹配不到连字符后缀）；db:verify / db:drill 走 Prisma 读 WAL 透明。验收：`tests/integration/concurrent-write.test.ts` 5 用例全过；`npm test` 三域全过（api 34 文件 320 用例）、typecheck / lint 0 错、`db:verify` ✅、`db:drill` ✅（恢复演练通过） |
| D7 | 阶段 0 · M1 | 2026-11-03 | ✅ `fe79d32` · 软删除索引改 `[deletedAt, date]`，列表/统计扫描收敛到期间 |
| D8 | 阶段 0 · M1 | （历史） | ✅ · 历史条目，明细见 git 历史 |
| D9 | 阶段 0 · M1 | 2026-11-04 | ✅ `5ffe91c` · `report.utils` 拆为 period / prediction / cash-flag / account-sum |
| D10 | 阶段 0 · M1 | 2026-11-04 | ✅ `85ac424` · 事务边界统一 `withTransaction`，clear-data / import 残留直调改走 repository |
| D11 | 阶段 0 · M1 | 2026-11-04 | ✅ `777fd70` · 账户分类回填与写入映射、退款 `relatedType` 同步、分页 id 次序键 |
| U0 | 阶段 1 · M2 | 2026-11-03 | ✅ `a60a135` · AntD cssVar 前缀 mb → ant，`--mb-*` 与 `--ant-*` 重叠归零 |
| U1 | 阶段 1 · M2 | 2026-11-04 | ✅ `137af85` · 清除 6 处未定义 `--mb-*` 引用（引用即定义） |
| UX5a | 阶段 1 · M2 | 2026-11-04 | ✅ `855741d` 等 · 九类工作流双端线框概念稿定稿（W1–W9） |

## 待领（按推荐顺序）

- 阶段 0 · M1：D4、A5（A5 = 导出日期取本地日历日）
- 阶段 1 · M2：U1b → U13.1 → UX5b → U13.2 → U13.3 → U13.4 → U13.5 → E / L / K8 → U12（D4 与 U13.1 可对调；硬边与完整顺序见 [stage-1](stage-1-experience.md)「顺序要求」）
- 阶段 2 · M3：F1–F11（见 [stage-2](stage-2-sync.md)）；V5 spike 在 M3 开头做
- 之后见 [../rewrite-blueprint.md](../rewrite-blueprint.md) §3 里程碑表

## 领条目 / 销条目

工作循环（领一条 → 读上下文 → 实现 → 自检 → 销条目 → 清理）见 [AGENTS.md](../../AGENTS.md)；本文件只做登记：领时在「进行中」加一行，销时在「状态」加一行并从阶段文档差距清单删行（保留编号空洞）。

## 进行中

| 条目 | 领取日期 | 范围 |
|---|---|---|
