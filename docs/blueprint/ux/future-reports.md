# 未来报表：唯一口径

> 状态：**2026-11-08 定稿（阶段 6）**。本文件是报表未来区间的唯一口径来源。
> 旧的「预算前瞻 v3」方案、简化面板与兼容参数已完成拆除，管线与参数以本文件为准。
> 代码入口：[ReportsPage.tsx](file:///C:/Users/George/Documents/MoneyBrain/apps/web/src/features/reports/ReportsPage.tsx)、
> [TimeBar.tsx](file:///C:/Users/George/Documents/MoneyBrain/apps/web/src/features/reports/TimeBar.tsx)、
> [apiReports.ts](file:///C:/Users/George/Documents/MoneyBrain/apps/web/src/features/reports/apiReports.ts)、
> [futureModel.ts](file:///C:/Users/George/Documents/MoneyBrain/apps/web/src/features/reports/futureModel.ts)、
> [prediction.tsx](file:///C:/Users/George/Documents/MoneyBrain/apps/web/src/features/reports/prediction.tsx)。
> 后端实现：[projection-events.ts](file:///C:/Users/George/Documents/MoneyBrain/apps/api/src/services/projection-events.ts)、
> [projection.service.ts](file:///C:/Users/George/Documents/MoneyBrain/apps/api/src/services/projection.service.ts)、
> [income-expense-projection.service.ts](file:///C:/Users/George/Documents/MoneyBrain/apps/api/src/services/report/income-expense-projection.service.ts)。

## 1. 范围

未来区间只覆盖**三个视图**，且与已发生区间使用同一套视图组件：

| 视图 | 已发生 | 未来 / 混合 | 数据源 |
|---|---|---|---|
| 资产负债 `balance` | `balance-sheet` | 复用 `BalanceView` | `analytics/asset-projection` |
| 收支 `flow` | `income-expense` | 复用 `FlowView` | `reports/income-expense-projection` |
| 现金流 `cash` | `cash-flow` | 复用 `CashView` | `reports/cash-flow-projection` |
| 投资 `invest` | `investment-analysis` | **不做未来版本** | 仅历史报表 |

- 投资分析 tab 的时间条**不禁用**；未来区间正文显示「该视图暂无未来数据源」空态，并提供「回到已发生」入口。
- 报表页不再有 `FutureBalanceView / FutureFlowView / FutureCashView` 这套简化面板。

## 2. 时间轴三态

报表时间条只有一条，四个视图共用。区间相对账本锚点 `asOf` 分三态：

| 状态 | 判定 | 含义 |
|---|---|---|
| 已发生 `past` | `to <= asOf`（时点：`point <= asOf`） | 只取历史报表 / 真实余额 |
| 混合 `mixed` | 起点在 `asOf` 前、终点在 `asOf` 后 | 桶内同时有已发生段与未来段，按同一视图分段展示 |
| 全未来 `future` | `from > asOf` | 只展示预测数据源 |

`asOf` 在真实账本里是今天；种子模式使用冻结锚点。时间条上的「已发生 / 混合区间 · 含未来 / 全未来」标签直接显示该状态。

## 3. 粒度、窗口与上限

四粒度同一套参数：`asOf`、`from`、`to`、`granularity=day|week|month|year`。桶边界由后端向外对齐，不拆桶：

| 粒度 | 标签 | 对齐 | 未来上限（只约束 `to`） |
|---|---|---|---|
| `day` | `YYYY-MM-DD` | 自然日 | 3 个月 |
| `week` | `YYYY-Www` | ISO 周（周一–周日） | 6 个月 |
| `month` | `YYYY-MM` | 自然月 | 12 个月 |
| `year` | `YYYY` | 自然年 | 3 年 |

- 不传任何窗口参数时，默认「月粒度、从 `asOf` 所在自然月起连续 12 个月」。
- 超过上限时后端返回 400 与可操作文案；时间条按同一规则截断并提示。
- `fromMonth / months` 已删除，不再作为入口。
- 资产负债时点窗口从 `asOf` 所在桶起点起算、止于所选时点所在桶末；期间窗口保留用户 `from`、`to` 对齐到桶末。

## 4. 三来源口径

未来数字一律由后端合成，前端不写 `actual + planned + committed`：

| 来源 | 定义 |
|---|---|
| `actual` | `date <= asOf` 的真实交易 |
| `committed` | `asOf < date <= 窗口末` 的真实交易（已排定） |
| `planned` | 窗口内预算 occurrence 展开（按预算计划） |
| `total` | `actual + committed + planned` |

- `planned: null` 表示**没有预算来源**；不得用 `0` 冒充。
- `covered[]` 只作解释：被真实交易覆盖的计划点位已从 `planned` 剔除，金额只留 `committed`，前端不二次抵扣。
- `endCash = startCash + netCashFlow.total` 恒成立。

### 4.1 去重 / 互斥规则

预算点位是周期计划，实际发生日常常偏移（例如 5 号房租 7 号付），因此**不收紧到严格同日**：

- 同类型 + 同账户对（`accountId`、`toAccountId` 均相同）+ **同分类**（`categoryId` 相同）+ 真实交易日期落在同一预算周期 `[periodStart, periodEnd]`；
- 预算点位与真实交易**一对一配对**，一笔真实交易最多覆盖一个点位；
- **同日优先**：第一轮按同一天配对，第二轮再在同周期内匹配剩余点位；
- 金额不参与匹配；
- 未被匹配的两侧都保留：预算点位留在 `planned`，真实交易留在 `committed`，并在明细中可见。

分类是收紧维度：同一账户下不同分类的预算与真实交易不得互相吃掉。

## 5. 后端端点

| 端点 | 参数 | 返回要点 |
|---|---|---|
| `GET /api/analytics/asset-projection` | `asOf + from/to + granularity`，`includePlanned` / `includeCommitted`（默认 true） | `base{assets,liabilities,netWorth}`；`points[].{actual,planned,committed,total,covered}`；**新增** `points[].accounts[]`（账户 → 类别，含 `valuationNote`）与 `points[].categories[]`（账户分类 → 一级分类） |
| `GET /api/reports/income-expense-projection` | 同上，另支持 `includeExcluded` | `income / expense / balance` 三来源；`incomeCategoryDetails / expenseCategoryDetails`（`actual / committed / planned(null) / total / hasBudget`）；`points[].{income,expense,balance,covered}`；`predictionNote` |
| `GET /api/reports/cash-flow-projection` | 同上 | 窗口级 `cashInflow / cashOutflow / netCashFlow`、`byActivity{operating,investing,financing,uncategorized}`（活动级 inflow/outflow/net + 三来源 item）、**窗口级 `sankey` 默认返回**、`covered[]`、`predictionNote`；逐桶 `points[]` |
| `GET /api/budgets/period-plan` | 同上 | 仍供预算页使用；报表未来收支**不再**消费该端点 |

- 现金流窗口级桑基默认返回，不设「按需参数」；若实测日粒度响应体确实过大，再评估改为按需。
- 投资账户在资产投影里返回 `valuationNote='transfer_schedule_only'`，表示只按买卖（转账）排期推演余额。

## 6. 各视图行为

### 6.1 资产负债

- 账户行来自 `points[].accounts`，按「账户 → 一级分类」展开；`categories` 供既有层级分组复用。
- 资产按实际余额（允许负数）；负债对外取**正数欠款**；余额为 0 的账户折叠成计数提示，不删数据。
- 指标行展示 `actual / planned / committed / total` 的文案拆分；预测部分由后端字段驱动。
- 走势图使用投影窗口逐点 `total.netWorth`。

### 6.2 收支

- 分类树来自 `incomeCategoryDetails / expenseCategoryDetails`；行金额取 `total`，预测部分 = `total − actual`。
- `hasBudget=false` 的行显式标「无预算」；`planned=null` 不显示为 0。
- 笔数只在真实流水中统计；纯未来区间为 0，不把预算点位当笔数。
- 走势图按桶输出 `income / expense` 三来源合计，不跨桶累计。

### 6.3 现金流

- 按经营 / 投资 / 筹资 / 未分类归组；分组金额与条目均带三来源。
- 分组第二列在预测区间显示「N 个分类」，不伪造成流水笔数。
- 窗口级桑基默认渲染（PC）；后端 link 已合成三来源，前端只做「三层结构」直译，不用账本回放校验期初 / 期末。
- 现金 → 非现金目标（如买入证券）属于流出，不是现金账户间转账；`transferTotal` 只统计现金账户之间。

### 6.4 投资分析

- 未来区间维持空态：不提供未来持仓 / 收益推演；「回到已发生」把期间收回到当前桶并截至今天。

## 7. 预测编码

未来数字不能只靠颜色或透明度区分。统一编码由
[prediction.tsx](file:///C:/Users/George/Documents/MoneyBrain/apps/web/src/features/reports/prediction.tsx)
产出，四个视图不得各写一份：

- **常驻文字标记**：含预测的行标「预测」；没有任何预算来源的分类标「无预算」。
- **指标构成文案**：`已发生 … · 按预算计划 … · 已排定 … · 合计 …`，四个数字全部来自后端；`planned=null` 显示「—」。
- 不新增颜色、不改 token 数值、不靠透明度编码。

## 8. 投资账户与转账口径

### 8.1 投资账户

- 任何真实或已排定的现金流事件都进入余额；只是**不推演市值涨跌**，也不使用净值变动或收益率假设。
- 没有现金流事件时余额不变。
- **不为「非 transfer 事件打到投资账户」增加过滤开关**：分红记为收入进余额是正确行为。
- 投资账户的未来余额按买卖（转账）排期推演，与收支统计互不影响。

### 8.2 转账与收支

- 转账按类型**默认不计收支**，不提供开关。
- 普通收入 / 支出 / 退款继续由既有的 `excludeFromIncomeExpense` 逐笔控制。
- 不新增 `incomeExpenseSide` 三态字段，不做规则 v2，不改 `Transaction / Budget` 字段、CSV 列或 DB schema。

## 9. 前端实现

- 三个 mapper 把端点字段映射回既有视图模型，页面未来分支直接渲染 `BalanceView / FlowView / CashView`：
  - `mapProjectionBalanceReport` → `BalanceReport`
  - `mapProjectionFlowReport` → `FlowReport`
  - `mapProjectionCashReport` → `CashReport`
- 收支未来的按钮 / 勾选与已发生区间共用同一状态；切换「计入不计收支」会带 `includeExcluded` 重新请求。
- 桑基通过 `CashReport.projectionMode` 进入直译路径；逐账户期初 / 期末不在端点返回，图例保留账户计数、不显示 0 元明细。

## 10. 不做

- 不恢复 `fromMonth / months` 兼容参数。
- 不在前端推算桶边界、不出前端合计、不用透明度编码预测。
- 不把投资视图的未来空态做成禁用时间条。
- 不做 `transfer` 的「是否计入收支」选项、规则 v2 或相关字段迁移。

## 11. 验证

- 后端：`apps/api/tests/integration/projection.route.test.ts`（26 条）、
  `apps/api/tests/integration/projection-detail.route.test.ts`（5 条，含三处维度明细与分类互斥）、
  `apps/api/tests/unit/budget-time-points.test.ts`（3 条）。
- 前端：`apps/web/tests/unit/future-reports.test.tsx`（15 条，含三来源映射、`planned=null`、桑基直译）。
- 命令：`npm run typecheck`、`npm run lint:api`、`npm run lint:web`、`npm run test:domain`、`npm run test:api`、`npm run test:web`、`npm run build`。
