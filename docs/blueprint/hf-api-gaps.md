# HF × API 接入与缺口

> 这份文档回答：**高保真前端还缺哪些接口、哪些产品口径没拍板、推演端点怎么算**。
> 什么时候看：接新页面、改预算/报表/同步相关接口，或需要核对推演口径时。
> 已完成批次的逐条过程与实测数字在 git 历史；日期契约见 [dev-guide §3.3](../dev-guide.md)，退款口径见 [requirements §3.5](../requirements.md)，报表口径见 [interaction-spec §5.6](ux/interaction-spec.md)。

## 当前状态（2026-11-08）

- 总览、流水、报表、预算、设置五个页面全部接真实账本（生产构建恒为 API；种子数据仅开发用，见 `features/dev-fixtures`）。
- 预算 CRUD、启停、`/budgets/statuses` 已接；预算页与总览预算卡直接消费 statuses，头部只合计**月度且启用**的支出预算，周/年预算在明细里按各自周期展示。设置页自动备份开关已接 `GET/PUT /data/auto-backup`。
- 导入/导出/导入回滚/清空、账户与分类 CRUD、排序、删除撤销、回收站均已接。
- 三个推演端点（资产推演 / 现金流推演 / 预算周期计划）已完成接线，报表未来区间与预算页入口均可用；口径见 [future-reports.md](ux/future-reports.md)。
- 同步仍只在 `packages/sync`，**没有同步端点**；未到 M3/M5，不阻塞当前页面。

## 剩余缺口

| 页 | 能力 | 接口 | 前端现状 | 缺什么 | 级别 |
|---|---|---|---|---|---|
| 总览 | 账户余额 | `GET /accounts/:id/balance-at?date=` | 逐账户 `Promise.all` | 无批量余额端点；账户多时请求数线性增长 | B |
| 流水 | 编辑撤销 | `PUT /transactions/:id` | 编辑真实落库 | `PUT` 不返回 `auditEventId`，API 模式编辑没有 6 秒撤销 | B |
| 流水 | 回收站入口 | `GET /transactions/recycle-bin` | 设置页可恢复 | 流水页无独立入口 | B |
| 流水 | 批量改分类 | 无批量端点 | 逐条 `PUT` | 非原子；请求数 = 选中笔数 | B |
| 报表 | 下钻到流水 | `GET /transactions` 支持多 `categoryId` + `from/to` | 下钻带当前报表期间 | ✅ 已收口（`from/to` 半开区间，与报表主查询同口径） |
| 预算 | 预测 / 用量明细 | `/budgets/predictions`、`/budgets/:id/usage-details` | 未用 | 接线后补下钻与预测 | B |
| 预算 | 推演三端点 | `/analytics/asset-projection`、`/reports/cash-flow-projection`、`/budgets/period-plan` | 已接 | 报表未来时间轴 + 预算计划视图 | ✅ 已收口（阶段 5） |
| 报表 | 投资分析持仓明细 | `GET /reports/investment-analysis` | 账户/分类明细均带 `items` | ✅ 已收口（按资产类型聚合，无持仓返回空数组） |
| 设置 | 存点回滚 | `/data/rollback-points` 系列 | 未接 | 目前只做导入批次回滚 | B |
| 全局 | 同步状态 / 关闭 | **无同步端点** | 无 UI | 未到里程碑，先不实现 | C |

## 推演端点口径（后端已完成）

| 端点 | 参数 | 返回字段 |
|---|---|---|
| `GET /api/analytics/asset-projection` | `from/to + granularity=day\|week\|month\|year`（唯一入口）、`asOf=YYYY-MM-DD`、`includePlanned` / `includeCommitted`（默认 true）；不传窗口参数时默认月粒度 12 个月 | `asOf`、`granularity`、`start`、`end`、`bucketCount`、`base{assets,liabilities,netWorth}`、`points[{granularity,label,start,end,date,actual,planned,committed,total,covered[]}]` |
| `GET /api/reports/cash-flow-projection` | 同上 | `asOf`、`granularity`、`start`、`end`、`bucketCount`、`startCash`、`endCash`、`points[{granularity,label,start,end,date,inflow,outflow,net,startCash,endCash,covered[]}]` |
| `GET /api/budgets/period-plan` | `from/to + granularity=day\|week\|month\|year`（唯一入口）；不传窗口参数时默认月粒度 12 个月 | `asOf`、`granularity`、`start`、`end`、`bucketCount`、`points[{month,granularity,label,start,end,date,hasBudget,budgets[],totals{income,expense,transfer}\|null}]`；`budgets[]` 按 occurrence 日期升序，`totals` 后端求和，无预算为 `null` |

**`covered[]`**：本月计划点位被真实交易覆盖时逐条列出，字段 `budgetId`、`budgetName`、`type`（`income`/`expense`/`transfer`）、`date`、`amount`（被剔除的 planned 金额，整数分）、`transactionId`、`transactionDate`。被覆盖金额已从 `planned` 剔除，只留 `committed`。

**硬约束**：

1. `actual` = `date ≤ asOf` 的真实交易余额；未来日期真实交易不计入起点。
2. `committed` = `asOf < date ≤ 月末` 的真实交易累计增量，只来自真实交易。
3. `planned` = 同窗口的预算展开累计增量，只来自 `generatePredictedOccurrences`，已剔除被覆盖点位。
4. `total = actual + planned + committed`，逐项相加；同一 occurrence 只出现一次。
5. **同一 occurrence 互斥**：类型相同 + 来源账户相同 + 转入账户相同（非转账两侧都为 `null`，转账必须同源同目标）+ 真实交易日期在预算周期内；金额与分类不参与匹配。`committed` 按日期升序贪心匹配，一笔真实交易最多覆盖一个点位。命中后从 `planned` 剔除、金额只留 `committed`，写入 `covered[]`。匹配在 `projection.service.ts`，前端不做抵扣。
6. 资产口径只做预算展开 + 已排定交易，不做统计外推、不推定投资收益。
7. 现金流 `流入 − 流出` 与交易对现金余额的净影响同源；现金账户互转本金不计流入/流出、手续费计流出，`endCash = startCash + net` 恒成立。
8. `hasBudget=false` 时 `totals=null`，不用 0 冒充。

**预算展开语义**：`generateBudgetTimePoints` 只返回 `[start, end]` 内的点；季度/年度 `transactionTime` 是从周期起点起的天偏移，窗口起点之前的落点被裁掉，避免长期推演重复带回已过去的点位。

**验证**：`apps/api/tests/integration/projection.route.test.ts`（8 条）、`apps/api/tests/unit/budget-time-points.test.ts`（3 条）。手算对照与「同一 occurrence 双计」用例保留在 git 历史（`195`–`254` 行，2026-11-06 版）。
