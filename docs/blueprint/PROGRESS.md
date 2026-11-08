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
| A5 | 阶段 0 · M0 | 2026-11-04 | ✅ `4cdf29a` · 导出/备份文件名改本地日历日，UTC+8 凌晨不再落到前一天 |
| A6 | 阶段 0 · M0 | 2026-11-04 | ✅ `671787c` + `b51320b` · 全库日期语义改本地日历日；快照 CSV 新格式 + 旧 ISO 兼容 |
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
| D3 | 阶段 0 · M1 | 2026-11-03 | ✅ `3161237` · API 响应类型收敛 contracts（22 处内联换 14 个具名类型；`TransactionStats` 单一来源） |
| D5 | 阶段 0 · M1 | 2026-11-03 | ✅ `41b80bd` · 删桶导出、react-refresh 警告归零（消费者直连源文件） |
| D6 | 阶段 0 · M1 | 2026-11-03 | ✅ `005faff` · SQLite WAL + busy_timeout + 长任务真串行队列；并发写 5 用例全过 |
| D7 | 阶段 0 · M1 | 2026-11-03 | ✅ `fe79d32` · 软删除索引改 `[deletedAt, date]`，列表/统计扫描收敛到期间 |
| D8 | 阶段 0 · M1 | （历史） | ✅ · 历史条目，明细见 git 历史 |
| D9 | 阶段 0 · M1 | 2026-11-04 | ✅ `5ffe91c` · `report.utils` 拆为 period / prediction / cash-flag / account-sum |
| D10 | 阶段 0 · M1 | 2026-11-04 | ✅ `85ac424` · 事务边界统一 `withTransaction`，clear-data / import 残留直调改走 repository |
| D11 | 阶段 0 · M1 | 2026-11-04 | ✅ `777fd70` · 账户分类回填与写入映射、退款 `relatedType` 同步、分页 id 次序键 |
| U0 | 阶段 1 · M2 | 2026-11-03 | ✅ `a60a135` · AntD cssVar 前缀 mb → ant，`--mb-*` 与 `--ant-*` 重叠归零 |
| U1 | 阶段 1 · M2 | 2026-11-04 | ✅ `137af85` · 清除 6 处未定义 `--mb-*` 引用（引用即定义） |
| U1b | 阶段 1 · M2 | 2026-11-04 | ✅ `e6f3f5f` · CSS 变量守卫三条规则（引用完整性 / 禁 `--ant-*` / 死变量白名单） |
| UX1 | 阶段 1 · M2 | 2026-11-03 | ✅ `855741d` · 信息架构：主导航 5 项、层级约束、归属判断表 → `ux/information-architecture.md` |
| UX2 | 阶段 1 · M2 | 2026-11-03 | ✅ `855741d` · 核心交互模型：记账 / 搜索 / 批量 / 报表 / 预算 / 数据 → `ux/interaction-spec.md` |
| UX3 | 阶段 1 · M2 | 2026-11-03 | ✅ `855741d` · 两端差异规范与浮层宿主规则 → `ux/platform-design.md` |
| UX4 | 阶段 1 · M2 | 2026-11-03 | ✅ `3f89b2c` · 设计 token 与暗色方案 → `ux/design-tokens.md`（初稿 `855741d`，darkfirst 终稿 `3f89b2c`） |
| UX5a | 阶段 1 · M2 | 2026-11-04 | ✅ `b121868` · 九类工作流双端线框概念稿定稿（W1–W9；初稿 `855741d`） |
| UX5b (HF) | 阶段 1 · M2 | 2026-11-07 | ✅ · 高保真设计即代码，五个页面全部落在生产入口；旧 AntD 页面/路由删除（`4816ad7`） |
| R1 | 阶段 1 · M2 | 2026-11-07 | ✅ · 单入口与主题骨架（Mantine 8 + 42 token × 2 scheme）随 HF 定稿 |
| R2a–R2c | 阶段 1 · M2 | 2026-11-07 | ✅ · 流水 / 记账 / 详情 / 总览 / 报表 / 预算 / 设置均按 `ux/*` 重建，后端 API 直连 |
| R3 | 阶段 1 · M2 | 2026-11-07 | ✅ · 报表四视图与并排表按 interaction-spec / design-tokens 收口（`2293600` 起分拆维护） |
| 前端精简 1–8 | 阶段 1 · M2 | 2026-11-07 | ✅ `da2444f` + `c923096` · 死代码/token/依赖、HfSheet、toast、Tabs/Segmented/Switch、Card、HfButton、ReportsPage/SettingsPage 拆分；逐项状态见 [hf-simplify-audit.md](hf-simplify-audit.md) |
| F-A | 阶段 2 · M4 | 2026-11-04 | ✅ `e2b4820` · 六类可同步实体补 `rev`/`vv`，客户端 UUID 幂等入库，`ledgerId`/`deviceId` 持久化 + AAD |
| F-B | 阶段 2 · M4 | 2026-11-04 | ✅ `ffc3f16` · `packages/sync` 记录级合并（顺序无关/幂等）+ 冲突收敛 + 引用待补全；`sync_conflicts` 本地表 |
| F-C | 阶段 2 · M4 | 2026-11-05 | ✅ `3f3de80` · 加密容器（Argon2id + XChaCha20-Poly1305）备份/同步共用；前链不入同步记录、应用后按唯一规则重算；逐条校验 + 未知实体跳过；格式文档 + 独立解密脚本 |
| V5 | 阶段 4 · 前置 spike | 2026-11-05 | ✅ · 两实例目录同步收敛（3 轮 + 复读 `identical=true`、并发冲突同版、半文件被拒）；默认 KDF seal 1499.6 ms / open 1430.1 ms < 2s；结论可冻结，产物标注 spike |

## 条目处置（一行）

D4 取消（不降级、不保留）、U13.1–U13.5 取消，前端改为「HF 高保真设计（A 设计即代码）→ R1–R3 重建」（[决策 #42](principles.md)）；U2/U3 降为原则（[dev-guide §2.1/§2.2](../dev-guide.md)）；U4/U6/U7 并入 R2/R3 验收（已完成）；U5/U8–U11 取消；E1–E4 并入 R2，E6 并入 R3（已完成）；U12 保留至 R3 后；H8 移非目标；A4 候选冻结（触发条件未出现）。

## 待领（两条并行通道，每通道一次只领一条）

**前置 spike（不计入待领条数）**：`V5` 已完成（2026-11-05，结论见 [stage-4](stage-4-expansion.md)：「可冻结」）；`V1` 在 `K8` 前，`V2/V3` 在 `H-A` 前、`V4` 在 `I-A` 前。

**通道 A · 后端：**

`G-A` →（等待 `L1–L3`）→ `H-A` → `H-B` → `H-C` → `G-B` → `G-C` → `I-A` → `I-B`

**通道 B · 前端（3 条）：**

`L1–L3`（可并行）→ `U12` → `V1` → `K8`

- 前端重建（HF → R1 → R2a–R2c → R3）与前端精简 1–8 已完成；旧 `pages/`、`queries/`、AntD 运行时均已删除。
- **硬边界**：`L1–L3 → H-A`（手机复用重建后的 feature 层与文案目录）；`R3 → U12`（已满足）；`V1 → K8`；`F-C → V5`（已满足）。
- 阶段 1 剩余条目见 [stage-1](stage-1-experience.md)；阶段 2 的 3 条见 [stage-2](stage-2-sync.md)；阶段 3 的 5 条见 [stage-3](stage-3-mobile.md)。
- 两条通道各领一条：单个会话一次只做一条；并行会话可在不同通道各领一条，同通道内严格按箭头顺序。

## 领条目 / 销条目

工作循环（领一条 → 读上下文 → 实现 → 自检 → 销条目 → 清理）见 [AGENTS.md](../../AGENTS.md)；本文件只做登记：领时在「进行中」加一行，销时在「状态」加一行并从阶段文档差距清单删行（保留编号空洞）。

## 进行中

| 条目 | 领取日期 | 范围 |
|---|---|---|
| — | — | 当前无已登记条目（并行会话的文档更新见各自提交） |

## 近期里程碑（非条目改动，细节见 git）

| 日期 | 提交 | 结论 |
|---|---|---|
| 2026-11-06 | `efba1b7` | 钱迹账本重建脚本 + 89 条平帐，新库对齐 Excel 22 个月锚点 |
| 2026-11-06 | `c22dc3d`…`baa6c3a` | 对账批次 A–F：平账分录、账户行入口、不计收支开关、月初 0 点语义 |
| 2026-11-06 | `851ab15` / `91f488d` | 预算 CRUD 与启停真实落库，失败保留表单并可重试 |
| 2026-11-07 | `7acdbaa` / `46d2e30` | 报表「计入/不计收支」开关、总览支出趋势与分类饼图 |
| 2026-11-07 | `4816ad7` / `73c2709` / `fb29f97` | 旧 AntD 页面、组件、运行时全部删除；主题单一来源 Mantine |
| 2026-11-07 | `b727f14`…`038c989` | 前端精简 1–8：HfSheet / toast / Tabs / Segmented / Switch / Card / HfButton / 页面拆分 |
| 2026-11-07 | `da2444f` | 前端精简收尾审计：逐项状态与规模数字以该文档为准 |

## 未来报表（阶段 4–6 已完成）

唯一口径见 [future-reports.md](ux/future-reports.md)。旧「预算前瞻 v3」面板 / 推演卡与兼容参数已在阶段 6 删除。

| 端点 | 参数 | 返回字段 |
|---|---|---|
| `GET /api/analytics/asset-projection` | `from/to + granularity=day\|week\|month\|year`（唯一入口；不传时默认月粒度 12 个月）、`asOf=YYYY-MM-DD`、`includePlanned` / `includeCommitted`（默认 true） | `asOf`、`granularity`、`start`、`end`、`bucketCount`、`base{assets,liabilities,netWorth}`、`points[{granularity,label,start,end,date,actual,planned,committed,total,covered[]}]` |
| `GET /api/reports/cash-flow-projection` | 同上 | `asOf`、`granularity`、`start`、`end`、`bucketCount`、`startCash`、`endCash`、`points[{granularity,label,start,end,date,inflow,outflow,net,startCash,endCash,covered[]}]` |
| `GET /api/budgets/period-plan` | `from/to + granularity=day\|week\|month\|year`（唯一入口；不传时默认月粒度 12 个月） | `asOf`、`granularity`、`start`、`end`、`bucketCount`、`points[{month,granularity,label,start,end,date,hasBudget,budgets[],totals{income,expense,transfer}\|null}]` |

**硬约束**：

1. `actual` = `date ≤ asOf` 的真实交易余额；未来日期真实交易不计入起点。
2. `committed` = `asOf < date ≤ 月末` 的真实交易累计增量。
3. `planned` = 同窗口的预算展开累计增量，只来自 `generatePredictedOccurrences`。
4. `total = actual + planned + committed`；同一 occurrence 只出现一次。
5. **同一 occurrence 互斥**：类型相同 + 来源账户相同 + 转入账户相同 + 真实交易日期落在预算周期内；命中后从 `planned` 剔除、金额只留 `committed`，并写入 `covered[]`。匹配在 `projection.service.ts`，前端不做抵扣。
6. 资产口径只做预算展开 + 已排定交易，不做统计外推、不推定投资收益。
7. 现金流 `endCash = startCash + net` 恒成立；现金账户互转本金不计流入/流出，手续费计流出。
8. `hasBudget=false` 时 `totals=null`，不用 0 冒充。
9. 收支未来视图只展示「预测 · 预算计划」，后端无 `actual/planned/committed` 分项；不显示「真实 + 预测 = 合计」，不做跨桶额度合计。

验证：`apps/api/tests/integration/projection.route.test.ts`（26 条）、`apps/api/tests/unit/budget-time-points.test.ts`（3 条）。推演口径详版见 [hf-api-gaps.md](hf-api-gaps.md)。

## 已知未收口（不属于任何阶段条目，按来源文档跟踪）

- **日期存储**：DB `date` 仍是 DateTime（存本地零点瞬时）；读写语义已统一为日历日，彻底消除需改 schema。
- **同步**：无同步端点；G 批未开始，`packages/sync` 尚未接 UI。
