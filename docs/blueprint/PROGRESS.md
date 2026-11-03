# 蓝图推进状态

> 差距条目完成状态的**唯一来源**。领条目、销条目都在这里登记。
> 阶段文档只写「还没做到的事」——已完成条目从差距清单删除并留编号空洞（如 A1、A2、D8），明细以本文件与 git 历史为准。
> 不变量覆盖状态见 [../testing.md](../testing.md) §5.1（不变量的唯一来源）。

## 状态

| 条目 | 阶段 | 完成于 | 备注 |
|---|---|---|---|
| A1 | 阶段 0 · M0 | （历史） | 已完成并从清单移除，明细见 git 历史 |
| B1 | 阶段 0 · M0 | 2026-10-28 | `fb87eeb` 覆盖导入回滚点 + 导入预览 |
| A2 | 阶段 0 · M0 | （历史） | 同上 |
| D8 | 阶段 0 · M1 | （历史） | 同上 |
| B2 | 阶段 0 · M0 | 2026-11-02 | `c24b685` 交易软删除 + 审计事件 + 撤销 + 回收站（前端入口与销条目随第二批提交落地）；`deletedAt` 过滤只留在 `db/repositories/transaction.repository.ts`，D1 的交易表部分一并收口 |
| B3 | 阶段 0 · M0 | 2026-11-02 | `e773ff6` 自动定时备份：开关 + 备份目录 + 云同步目录默认拒绝需显式确认；时机由内部策略决定（24h 间隔 + 长任务锁互斥，锁释放后下一轮补跑），用户不设置执行时刻 |
| C1 | 阶段 0 · M0 | 2026-11-03 | `4e6878e` 四张报表共享一个全局期间（区间），切 tab 期间不变；期间报表预设合并为一套；资产负债表 UI 保持时点语义控件（数据取共享区间终点为期末时点，时点 ↔ 所在区间在传参处双向映射），余额类指标名统一带「期末」（期末余额 / 期末净资产 / 期末总资产 / 期末总负债），单组存量值不引入期初。验收：`tests/unit/pages/Reports.test.tsx` + `tests/unit/components/BalanceSheetReport.test.tsx` |
| A0 | 阶段 0 · M0 | 2026-11-03 | 清库补齐三场景集成测试（正常全范围清空无残留 / 边界范围隔离与配置覆盖拒绝 / 空库幂等）；「转账转入 = 本金」收进领域层 `transferInflow` 规则，投资分析与现金流报表（collect / aggregate / build 转入侧）四处直取全部改走 `rulesFor(...)`，不再有第二份「转账本金」实现；dev-guide §3 例外段改为收口后规则 |
| A3 | 阶段 0 · M0 | 2026-11-03 | fast-check 属性测试覆盖蓝图入口 §4 的内核不变量 1–6（`packages/domain/tests/invariants.test.ts`）：对账恒等式、Σ 账户余额 == 净资产、复式平衡、全额退款恢复余额与可退余额上限、转账 Δ转出+Δ转入 == −有效手续费、收支表与分类聚合逐分录同源追溯；每条属性随机 1000 组恒成立。验收：`npm run test:domain`（38 测试全过，含 7 个属性测试） |
| B4 | 阶段 0 · M0 | 2026-11-03 | 退款口径放开 + 数据自检修正，四件事一次收口：① db:verify 对账条手续费改按「− 有效手续费」计入（修复前对 2026-05 实跑误报「净资产对不上，差 −5.46 = −2×手续费 2.73」，修复后不误报）；② 超额退款判定降级为 ℹ 信息性输出（退款可高于原额、退款账户可与原账户不同，均属合法，校验不得判错）；③ 放开写入拦截——transaction.service 不再用 remainingRefundable 拒写（assertRefundable 改名 assertRefundTarget 只校验目标类型与金额为正，连带删 repository findActiveRefundsOf 死代码）；④ 余额正确性测试（refund.route.test.ts 两例：超退按实际金额入账、跨账户退款原账户不恢复）。口径同步进 requirements §3、dev-guide §8/§9、蓝图不变量 4 与 A3 属性测试。验收：`npm run db:verify` 对真实库通过（ℹ 提示超退 2 笔，不判错）；`npm test` 三域全过 |
| C2 | 阶段 0 · M0 | 2026-11-03 | 预算下钻与用量同源：计入判定收进 budget.service 的 `budgetContributionSign`（+1 主类型 / −1 冲减退款 / 0 不计入）与 `buildBudgetPlan`（期间 × 分类子树 × 领域层 scope），`computeBudgetStatus` 与新 `getBudgetUsageDetails` 共用，下钻不得另写过滤条件；新 API `GET /api/budgets/:id/usage-details` 返回 `{ list, count, total, used }`（used 与预算状态同款下限）；前端「查看交易」从跳转交易列表（只带 categoryId，无账户/期间/冲减口径）改为抽屉内明细视图 `BudgetUsageList`。验收：budget.service.test.ts 下钻用例——排除其它账户/不计收支/类型不符后 count == 2、total == 3000 == getBudgetStatusesByIds 的 used；跨期退款负合计夹 0 |
| C3 | 阶段 0 · M0 | 2026-11-03 | 预算使用率去截断（按决策 #39 缩减版）：`computeBudgetStatus` 的 percentage 去掉 `min(…,100)`，contracts `BudgetStatus.percentage` 注明真实使用率语义（超支 >100 不截断），单测覆盖「超支 180% 返回 180、isOverBudget、remaining 夹 0」；前端零改动——`getStatusLabel` 本就按 percentage 直渲染文本（超支显示「超预算: 180%」），Progress 条宽自行封顶；分档视觉（色档/文案档）留给原型落地。操作规则同步进 dev-guide §3.1 预算行 |
| C4 | 阶段 0 · M0 | 2026-11-03 | 桑基图退款方向与活动表同源：`buildSankey` 的 refund 分支删掉「一律按流入直取」的重复判定，改走领域层 `rulesFor(version).refundOffsetKind(relatedType)` 分流——支出退款计入流入侧（分类 → 现金）、收入退款计入流出侧（现金 → 分类）、`relatedType` 无法识别时不计入，与 `aggregate()` 同一判定；`processTransaction` 补 `relatedType` 参数（交易侧传入、预测侧传 null）。验收：cash-flow-build.test.ts 四用例——支出退款 `未分类_income → 现金`、收入退款 `现金 → 未分类_expense`、null 不计入、金额按实际值；操作规则同步进 dev-guide §3.1「退款计入方向」行 |
| D1 | 阶段 0 · M1 | 2026-11-03 | 其余实体收进 repository：account / account-category / transaction-category / budget / investment-asset-class / investment-allocation-snapshot / investment-allocation-item 七个 repository 落进 `db/repositories/`（纯委托 + `tx` 尾参，沿用 transaction.repository 约定；固定关联收成 `BUDGET_RELATIONS` / `SNAPSHOT_ITEMS_RELATIONS` 防漂移，批量排序/重排的数组式 `$transaction` 收进 repository），19 个 service 文件的 `prisma.<model>.` 与事务回调 `tx.<model>.` 全部改走 repository，15 个 mock prisma 的单测零改动全过。验收：`rg "prisma\.(account\|accountCategory\|transactionCategory\|budget\|investmentAssetClass\|investmentAllocationSnapshot\|investmentAllocationItem\|auditEvent)\." apps/api/src/services apps/api/src/routes` 0 命中；`npm test` 三域全过、typecheck / lint 0 错、`db:verify` ✅。操作规则同步进 dev-guide §8（含暂存例外：clear-data 与 import 的事务内直调留待后续条目） |
| D2 | 阶段 0 · M1 | 2026-11-03 | 共享类型收敛到 contracts（按决策 #39 最小实现：删重复定义、单一来源、不写适配层，前端从简）：`TransactionType` 删 3 处重复定义——balance.service 死导出（无消费者，连 `TransactionKind` import 一并删）、transaction.route 内联联合改 import contracts、web utils/transactionType 的 `keyof typeof CONFIG` 推导删除（消费者 TransactionFilter 改从 services/api 取，与其它 transactions 组件同路径）；`AutoBackupConfig` 后端存储形状（含 `lastAttemptAt`）与契约响应形状（含 `defaultDirectory`/`nextWindowAt`/`backupCount`）同名不同构，后端私有类型改名 `AutoBackupConfigFile`（函数名 `getAutoBackupConfig`/`saveAutoBackupConfig` 与路由、测试调用点不动）；web SankeyChart 局部 `SankeyLink`（value: number 与契约 Minor 同构）删除改 `import type { SankeyLink } from '@contracts/types'`。验收：`rg "type TransactionType" apps packages` 仅 contracts 1 处、`AutoBackupConfig`/`SankeyLink` 定义各仅 contracts 1 处（迁移前 8 处定义 → 3 个类型各 1 处唯一来源）；`npm test` 三域全过（api 33 文件 315 用例）、typecheck / lint 0 错、`db:verify` ✅ |
| D3 | 阶段 0 · M1 | 2026-11-03 | `3161237` API 响应类型收敛 contracts（按决策 #39 最小实现：删内联、单一来源、不写适配层，前端从简）：api.ts 的 22 处 `ApiResponse<{...}>` 内联全部替换为 contracts 新增的 14 个具名响应类型（MessageResult / AccountBalanceAtResult / AccountDeleteResult / TransactionCategoryDeleteResult / TransactionCategoryMoveResult / TransactionStats / EarliestTransactionDateResult / TransactionDeleteResult / AuditEventHistoryResult / RecycleBinResult / DashboardSummaryData / AssetClassDeleteResult / ImportBackupResult / DetectFileResult，其中 DetectFileResult.includes 按后端实际返回收紧为 `BackupDataType[]`、各 Result 的 optional 字段与后端分支返回形状逐一核对）；后端 transaction.service 的 `TransactionStats` interface（number 版重复定义）删除改 import contracts 的 Minor 版——同名类型只剩一个来源；api.ts 既有 re-export 链保持，组件消费者零改动。验收：`rg "ApiResponse<\{" apps/web/src` 0 命中（迁移前 22 处）；typecheck 三包 0 错、lint 0 错、test:web 12 文件 + test:api 33 文件全过 |
| D5 | 阶段 0 · M1 | 2026-11-03 | `41b80bd` 删桶导出、react-refresh 警告归零（按决策 #39 最小实现：删桶、消费者直连具体文件，不留兼容 re-export）：settings/shared.tsx（3 个 `export *` 桶，treeTypes / sortable / moveModalHelpers）删除，4 个消费者（AccountConfigModal / CashFlowConfigModal / TransactionConfigModal / InvestmentAssetClassConfigModal）import 拆直连三个源文件，settings/index.ts 的 `export * from './shared'` 行删除；TransactionItemRow.tsx 的两个非组件导出（getCategoryName / getAccountName）移入 utils/transaction.ts 纯函数工具文件，TransactionDetail / RecycleBinSection 改从 utils 取、TransactionItemRow 自身本地改 import。验收：`npm run lint` react-refresh 警告 **0**（总数 10 → 5，剩余 5 条全为 react-hooks/exhaustive-deps 历史遗留——图表组件 useMemo 依赖写法问题，不属本条目）；shared 残留引用 grep 0 命中；typecheck 三包 0 错、test:web 12 文件全过 |

## 待领（按推荐顺序）

- 阶段 0 · M1：D4 → D6 → D7 → D9 → D10（D10：D1 基线外残留收口——clear-data / import / smart-import / audit-event / rollback 的事务内直调收进 repository 或统一事务封装）
- 阶段 1 · M2：见 [stage-1](stage-1-experience.md)——批次 U「界面重做」三段：U0 → U1 → U1b → U2–U3（地基）→ **UX1–UX5**（重设计，不改代码）→ U4 → U5 → U6–U11 / E/L/K8（可交错；E1–E4 在 UX 之后按原型落地，E6 随时可做）→ U12（完整顺序与依据见 [stage-1](stage-1-experience.md)「顺序要求」）
- 阶段 2 · M3：F1–F11（见 [stage-2](stage-2-sync.md)）；V5 spike 在 M3 开头做
- 之后见 [../rewrite-blueprint.md](../rewrite-blueprint.md) §3 里程碑表

## 领条目 / 销条目

1. **领**：在下方「进行中」加一行（条目 / 领取日期）；一次只领一条。
2. **做**：读阶段文档 + [architecture.md](architecture.md) 对应小节；按验收标准**用具体命令**自检。
3. **销**：「状态」表加一行（条目 / 阶段 / 完成日期 / commit），从阶段文档差距清单删除该行（保留编号空洞），并从「进行中」移除。

## 进行中

（空）
