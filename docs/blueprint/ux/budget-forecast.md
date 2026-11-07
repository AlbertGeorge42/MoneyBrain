# 预算前瞻 v3：预算驱动推演（后端计算 · 前端渲染）

> 状态：**2026-11-07 更新实现位置**。口径与界面设计沿用 2026-11-06 版；前端引用改为当前 `features/budgets/`、`features/overview/`、`features/reports/`，旧 `src/pages/*`、`src/components/*` 已随 R1–R3 删除（`4816ad7`）。
> 落地状态：三个推演端点已存在，**前端尚未接线**（见 [PROGRESS.md](../PROGRESS.md)「已知未收口」）。
> 目标：设置预算后，能看到**按预算计划走**的未来现金流与资产情况。
> 边界：推演全部由后端计算，前端只取数、格式化、渲染；不做任何求和、累计、折算或插值。
> 范围：预算页顶部推演面板、总览预算卡、预算条目详情；历史回看仍只展示实际支出。
> 相关：[concept-design.md](concept-design.md) 的 W7 预算 · [interaction-spec.md](interaction-spec.md) §6 预算 ·
> [design-tokens.md](design-tokens.md) §2.7 / §2.8。

---

## 0. 结论摘要

1. **推演是后端的职责**：活跃预算按周期与 `transactionTime` 展开，逐月汇总现金流与资产/负债，后端输出完整序列；前端不重算。
2. **三态拆分**：`actual`（已发生）、`planned`（按预算计划）、`committed`（已排定真实交易）分字段返回、分视觉呈现、互不混淆。
3. **前端只消费三个只读契约**：`asset-projection`、`cash-flow-projection`、`budgets/period-plan`；月末现金、月末净资产、合计值、未来预算额度都由后端给。
4. **未设预算月份是可见缺口**：`period-plan` 返回 `hasBudget: false` / `totals: null`，前端画缺口 + 新建入口；不拿 `0`、历史均值或上期值填补。
5. **展示形态**：预算页顶部 + 总览卡；现金流用「分向柱 + 月末现金折线」，资产用「净资产折线 + 选中月累计构成」；支持 3 / 6 / 12 月切换。
6. **既有语义不变**：四态进度条只由已发生决定；三层桑基只画过去实际；实际报表合计不并入推演；历史只保留实际支出。
7. **交互已定稿**：预算页推演面板默认「现金流」，资产第二 tab；无预算月份折线断开 + 6px 灰色短横线缺口；前端禁止清单与降级规则集中在 §5。

---

## 1. 职责边界（硬规则）

| 环节 | 归属 | 说明 |
|---|---|---|
| 预算展开 | 后端 | 按 `daily / weekly / monthly / quarterly / yearly` 与 `transactionTime` 生成发生日 |
| 周/季/年归一到月 | 后端 | 前端不得把周预算乘以周数、把年预算除以 12 |
| 逐月现金流汇总 | 后端 | `inflow / outflow / net` 直接返回 |
| 逐月资产/负债/净资产 | 后端 | `actual* / planned* / committed* / total*` 直接返回 |
| `planned` 与 `committed` 去重 | 后端 | 同一预算 occurrence 不得既算计划又算已排定；覆盖结果通过 `covered` 返回 |
| 未来预算点位/额度 | 后端 | `budgets/period-plan` 按自然月返回 `hasBudget`、`totals`、逐条 occurrence |
| 无预算语义 | 后端 | `hasBudget: false` + `totals: null`，不返回可被误读的 0 额度 |
| 月末现金 / 月末净资产 | 后端 | `endCash` / `total.netWorth` 由后端累计，前端不 `base + Σ` |
| 月份范围 | 前端 | 只把 `months=3 / 6 / 12` 传给后端，不拉 12 再切片 |
| 渲染 | 前端 | 取字段、格式化金额、画图、图例、空态、无障碍 |
| 只读 | 前端 | 不写库、不生成交易、不写审计、不改报表合计 |

前端**禁止**出现以下实现：

1. 对 `points` 做 `sum / reduce` 求和；
2. 用 `base + 累计净额` 自行算月末净资产或月末现金；
3. 把周/季/年预算在前端折算成月；
4. 对缺失月份插值、外推、用历史日均补齐；
5. 用 `planned === 0` 判断「无预算」（必须读 `period-plan` 的 `hasBudget`，且不能把 `totals: null` 当 0）；
6. 把 `actual` 与 `planned` 相加成一个「总计」数字（旧 `PredictionStatistic` 的合并口径不沿用）；
7. 在前端对 `planned` / `committed` 去重、互相扣减，或把 `covered` 的金额加回任何合计。

---

## 2. 后端现状与前端盘点

### 2.1 后端已有能力

| 能力 | 位置 | 结论 |
|---|---|---|
| 预算展开为伪交易 | [budget.service.ts](file:///C:/Users/George/Documents/MoneyBrain/apps/api/src/services/budget.service.ts#L458-L505) `generatePredictions` | 已是推演的唯一来源 |
| 预算预测只读端点 | [budget.route.ts](file:///C:/Users/George/Documents/MoneyBrain/apps/api/src/routes/budget.route.ts#L66-L73) `GET /budgets/predictions` | 已暴露 `startDate` / `endDate` 展开结果 |
| 周期发生日展开 | [budget.service.ts](file:///C:/Users/George/Documents/MoneyBrain/apps/api/src/services/budget.service.ts#L510-L590) `generateTimePoints` | daily/weekly/monthly/quarterly/yearly 均已实现 |
| 预算对账户余额的累计影响 | [prediction.ts](file:///C:/Users/George/Documents/MoneyBrain/apps/api/src/services/report/prediction.ts#L27-L67) `accumulatePredictionChanges` / `sumPredictionByType` | 收入 `+`、支出 `−`、转账 from `−` / to `+` |
| 时点资产/负债/净资产 | [prediction.ts](file:///C:/Users/George/Documents/MoneyBrain/apps/api/src/services/report/prediction.ts#L97-L114) `computePredictedAssetsLiabilities` | 已能算「到某时点为止」的预测变动 |
| 指定账户集合的时点余额 | [prediction.ts](file:///C:/Users/George/Documents/MoneyBrain/apps/api/src/services/report/prediction.ts#L125-L145) `computePredictedAccountTotal` | 现金流/投资账户范围可复用 |
| 报表 `includePredictions` | [report.route.ts](file:///C:/Users/George/Documents/MoneyBrain/apps/api/src/routes/report.route.ts#L12-L23) | `income-expense` / `cash-flow` 已支持 `includePredictions=true` |
| 未来资产负债表 | [balance-sheet.service.ts](file:///C:/Users/George/Documents/MoneyBrain/apps/api/src/services/report/balance-sheet.service.ts#L62-L78) | `targetDate > now` 时调用 `generatePredictions` |
| 现金流期初/期末现金 | [cash-flow.service.ts](file:///C:/Users/George/Documents/MoneyBrain/apps/api/src/services/report/cash-flow.service.ts#L115-L131) | 已有 `startCash` / `endCash` 形态，但目前是 `{ actual, predicted }` |
| 任意日期多账户余额 | `balance.service.ts` 的 `calculateBalancesBatch` | 可作为投影起点的真实余额来源 |
| 现金/投资账户标识 | `account-category` 的 `isCashEquivalent` / `isInvestment` | 现金流投影按现金类账户统计 |
| 资产推演端点 | [analytics.route.ts](file:///C:/Users/George/Documents/MoneyBrain/apps/api/src/routes/analytics.route.ts#L41-L48) `GET /analytics/asset-projection` | 已接受 `months` / `asOf` / `includePlanned` / `includeCommitted` |
| 现金流推演端点 | [report.route.ts](file:///C:/Users/George/Documents/MoneyBrain/apps/api/src/routes/report.route.ts#L40-L47) `GET /reports/cash-flow-projection` | 已按自然月输出 `inflow/outflow/net` 与 `endCash` |
| 未来预算点位端点 | [budget.route.ts](file:///C:/Users/George/Documents/MoneyBrain/apps/api/src/routes/budget.route.ts#L78-L84) `GET /budgets/period-plan` | 已返回 `hasBudget` / `totals` / 逐条 occurrence |
| 推演服务实现 | [projection.service.ts](file:///C:/Users/George/Documents/MoneyBrain/apps/api/src/services/projection.service.ts#L201-L242) | `base + planned + committed = total` 由后端合成 |
| 推演契约类型 | [types/index.ts](file:///C:/Users/George/Documents/MoneyBrain/packages/contracts/types/index.ts#L829-L925) | `ProjectionBalance` / `ProjectionFlowValue` 已定义 |

结论：预算展开、账户余额、现金流范围、资产/负债语义都已在后端；任何「前端自己算月度结余/资产累计」都是重复实现，且会与后端口径漂移。

### 2.2 当前前端实现盘点（2026-11-07）

旧 `src/pages/Budgets.tsx`、`src/pages/Dashboard.tsx`、`src/components/budgets/BudgetForm.tsx`、`src/components/charts/BaseChart.tsx`、`src/components/reports/{PredictionStatistic,BalanceSheetReport,CashFlowReport}.tsx` 已随 R1–R3 删除（`4816ad7`），不再保留链接。下表只按当前 `features/*` 实现盘点：

| 方面 | 当前实现 | 与推演设计的关系 |
|---|---|---|
| 预算类型与分组 | [BudgetPage.tsx](../../../apps/web/src/features/budgets/BudgetPage.tsx#L891-L898) 用 `HfSegmented` 切支出 / 收入 / 转账，分组来自 [budgetModel.ts](../../../apps/web/src/features/budgets/budgetModel.ts#L244-L251) | 保留；推演面板加在页面顶部，不改分组 |
| 进度环封顶 | [BudgetPage.tsx](../../../apps/web/src/features/budgets/BudgetPage.tsx#L95-L113) 圆环视觉钳到 0–100，百分比文案用真实值（C3） | 保留真实百分比口径；推演不改进度环 |
| 超支金额 | 头部「可花」按 `max(remaining, 0)` 显示（[L162](../../../apps/web/src/features/budgets/BudgetPage.tsx#L162)），另有「已超支 ¥x」行（[L169-L174](../../../apps/web/src/features/budgets/BudgetPage.tsx#L169-L174)） | 已解决「剩余钳 0 看不到超支」；超支仍只由 `actual` 判断 |
| 周期与交易日 | 编辑器周期仅 `weekly / monthly / quarterly / yearly`（[L873](../../../apps/web/src/features/budgets/BudgetPage.tsx#L873)），无 `daily`，无 `transactionTime` 字段 | **缺口**：推演按 `transactionTime` 展开，接线上线前需补 `daily` 与交易日输入，否则后端展开能力无法在 UI 配置 |
| 总览预算卡 | [BudgetCard.tsx](../../../apps/web/src/features/overview/BudgetCard.tsx#L17-L60) 只取前 3（移动）/ 4（桌面）条，带使用率徽标与超支标记 | 保留摘要；推演入口需新增，不塞进这 3–4 行 |
| 报表预测标记 | [apiReports.ts](../../../apps/web/src/features/reports/apiReports.ts#L128-L161) 把 `actual + predicted` 合成行金额，[reportRows.ts](../../../apps/web/src/features/reports/reportRows.ts#L39-L48) 用「预测」文字与「实际 … · 预测 …」拆解行区分 | 新面板不沿用合并数字；三态分段展示 |
| 图表预测编码 | 报表图表为纯 SVG（[charts.tsx](../../../apps/web/src/features/reports/charts.tsx)），预测靠文字标签，未用虚线 | 新面板另加实心 / 斜纹 / 点纹三级编码（§4.5） |

**沿用**：预算类型分组、四态进度环、真实百分比文案、超支金额单列、总览 3–4 行摘要、报表「预测」文字标签。

**不沿用**：把 `actual` 与 `predicted` 相加后的单一数字作为推演面板合计；把条长封顶当作超支表达；未来的单一「预测」标签（无法区分计划与已排定）。

### 2.3 后端能力与前端缺口

| 能力 | 后端现状 | 前端要做的事 |
|---|---|---|
| 未来逐月资产/净值序列 | 已提供 `asset-projection`，逐月 `base + actual/planned/committed/total` | 画净资产折线 + 选中月累计构成 |
| 未来逐月现金流序列 | 已提供 `cash-flow-projection`，逐月 `inflow/outflow/net/endCash` | 画分向柱 + 月末现金折线 |
| 未来各周期预算额度 | 已提供 `budgets/period-plan`，逐月 `totals` 与逐条 occurrence | 画「本月预算额度」与未来预算清单 |
| 无预算语义 | 已提供 `hasBudget: false` / `totals: null` | 画缺口，不用 0 冒充 |
| 未来真实交易与预算展开双计 | 已拆成 `planned` / `committed`，并按 occurrence 互斥（提交 `6e7090b`）；每个点位返回 `covered` 解释被覆盖点位 | 分段渲染；`covered` 只展示与解释，不抵扣、不加回合计 |
| 预算周期与交易日配置 | 后端支持 `daily/weekly/monthly/quarterly/yearly` 与 `transactionTime`；前端编辑器只有 4 周期、无交易日字段 | 接线上线前补齐 `daily` 与交易日输入（见 §2.2） |
| 计划与已排定的视觉区分 | 旧 UI 只有「预测」一级 | 新增斜纹 / 点纹两级编码 |

---

## 3. 推演契约（前端只读）

### 3.1 `asset-projection`

`GET /api/analytics/asset-projection?months=3|6|12&asOf=YYYY-MM-DD&includePlanned=true&includeCommitted=true`

```ts
interface ProjectionBalance {
  assets: Minor
  liabilities: Minor      // 正数绝对值
  netWorth: Minor         // assets - liabilities
}

interface ProjectionCoveredOccurrence {
  budgetId: string
  budgetName: string
  type: 'income' | 'expense' | 'transfer'
  date: string            // 预算点位日期（YYYY-MM-DD）
  amount: Minor           // 被剔除的 planned 金额
  transactionId: string   // 覆盖它的真实交易
  transactionDate: string
}

interface AssetProjectionPoint {
  label: string           // '2026-11'
  date: string            // 该月最后一个自然日
  actual: ProjectionBalance
  planned: ProjectionBalance
  committed: ProjectionBalance
  total: ProjectionBalance
  covered: ProjectionCoveredOccurrence[]  // 仅本月被覆盖点位；空数组为正常状态
}

interface AssetProjectionResult {
  asOf: string            // 真实余额基准日，默认今天
  months: 3 | 6 | 12
  base: ProjectionBalance // asOf 当天的真实资产/负债/净资产
  points: AssetProjectionPoint[]
}
```

字段语义（由后端保证，前端不推导）：

- `base` = `asOf` 当天真实余额；每个 point 的 `actual` 都是这个真实存量（含 `asOf` 之前全部实际交易）。
- `planned` / `committed` 是**相对 `actual` 的累计增量**，不是当月增量；当前月覆盖 `asOf + 1` 到月末，后续月累计到各自月末。
- `total` = `actual + planned + committed`，由后端合成；前端只用它画折线/汇总。
- `covered` 只列**本月**被真实交易覆盖的预算点位（按预算点位 `date` 的年月过滤）：命中后该点位已从 `planned` 剔除，金额只留在 `committed`，`total` 不变；空数组表示本月无覆盖，是正常状态而非缺数据。
- `covered` 是解释字段，不参与任何合计；前端不再二次抵扣，也不把 `amount` 加回 `planned` / `committed` / `total`（见 §5.1 F11）。
- 未来月份没有单独的 `actual` 增量；`actual` 保持基准日存量，避免把「今天之前」重复计入未来月。
- 资产范围沿用资产负债表口径（全部资产/负债账户）；不含投资收益、资产增值、汇率变动。
- 该契约**不带预算状态**；「该月是否有预算」由 `period-plan` 按 `label` 对齐，见 §3.3。

### 3.2 `cash-flow-projection`

`GET /api/reports/cash-flow-projection?months=3|6|12&asOf=YYYY-MM-DD&includePlanned=true&includeCommitted=true`

```ts
interface ProjectionFlowValue {
  actual: Minor
  planned: Minor
  committed: Minor
  total: Minor            // 后端合计，已去重
}

interface CashFlowProjectionPoint {
  label: string           // '2026-11'
  date: string
  inflow: ProjectionFlowValue
  outflow: ProjectionFlowValue
  net: ProjectionFlowValue
  startCash: Minor        // 该月月初现金
  endCash: Minor          // 该月月末现金，后端累计
  covered: ProjectionCoveredOccurrence[]  // 仅本月被覆盖点位；空数组为正常状态
}

interface CashFlowProjectionResult {
  asOf: string
  months: 3 | 6 | 12
  startCash: Minor        // 第一个月的月初现金
  endCash: Minor          // 最后一个月的月末现金
  points: CashFlowProjectionPoint[]
}
```

字段语义：

- 现金范围只取 `isCashEquivalent` 账户；现金账户之间的转账净额为 0，后端已处理。
- 当前月 `actual` 覆盖月初到 `asOf`；未来月 `actual = 0`，不是「没有数据」。
- `planned` / `committed` 是**当月流量**（不是累计），分别代表预算展开与已排定真实交易。
- `inflow.total`、`outflow.total`、`net.total` 由后端合成；`net.total = inflow.total - outflow.total`、`endCash = startCash + net.total` 均由后端算，前端不做。
- `covered` 与 `asset-projection` 同义（类型见 §3.1）：本月被真实交易覆盖的预算点位，命中后已从 `planned` 剔除、金额只留在 `committed`；空数组成正常状态，不参与合计，不再二次抵扣。
- 折线只画每个 point 的 `endCash`，不画 `startCash + Σnet`。
- 该契约**不带预算状态**；「该月是否有预算」由 `period-plan` 对齐，见 §3.3。

### 3.3 `budgets/period-plan`（未来预算额度与无预算语义）

`GET /api/budgets/period-plan?fromMonth=YYYY-MM&months=N`

```ts
interface BudgetPeriodPlanOccurrence {
  budgetId: string
  budgetName: string
  type: 'income' | 'expense' | 'transfer'
  date: string
  amount: Minor
}

interface BudgetPeriodPlanPoint {
  month: string           // '2026-11'
  hasBudget: boolean      // 该月是否存在预算展开点位
  budgets: BudgetPeriodPlanOccurrence[]
  totals: { income: Minor; expense: Minor; transfer: Minor } | null
}

interface BudgetPeriodPlanResult {
  fromMonth: string
  months: number
  points: BudgetPeriodPlanPoint[]
}
```

字段语义：

- `hasBudget = false` 是**无预算的唯一权威信号**：该月没有任何预算展开点位，`totals = null`；前端画可见缺口。
- `hasBudget = true` 时 `totals` 一定非空；`totals` 是后端按 occurrence 额度合计的结果，前端不按条相加。
- 年度预算的非扣款月、周预算无发生日的月份都会得到 `hasBudget: false`——这是「本月没有预算安排」，不是「预算额度为 0」。
- `budgets[]` 可用于展示未来预算清单/点位；不得在前端按周期自行归集。
- 与投影序列按 `month === point.label` 对齐；这是查表，不是计算。
- `fromMonth` 直接取第一个投影点的 `label`（当前自然月），`months` 与两个投影请求一致；前端不自行推算月份边界。

### 3.4 「无预算」语义

| 后端返回 | 前端表现 |
|---|---|
| `period-plan.hasBudget: false` + `totals: null` | 该月画灰底斜纹缺口，文字「未设预算」，带「去设置预算」入口 |
| `period-plan.hasBudget: true` + `totals` 各项为 0 | 正常月份；标注「本月预算额度 0」，不画缺口 |
| `period-plan.hasBudget: true` | 正常月份；`totals` 直接展示，不按条相加 |
| 整段窗口全部 `hasBudget: false` | 面板空态 + 新建预算入口；不画任何折线/柱 |

硬规则：

- 不用 `0` 代表无预算；`0` 是「有预算点位但额度为 0」。
- 不用历史月均值、上期值、实际值填补缺口。
- 缺口月份不画计划柱；折线**必须断开**（D11）；若该月有 `committed`，只画已排定点，并明确标注。缺口视觉与降级规则见 §5.2。

### 3.5 计划与已排定的去重

- `planned` = 仅由预算展开产生、且**尚未被真实交易覆盖**的伪交易。
- `committed` = 已录入的未来真实交易（`date > asOf`）。
- 互斥已由后端实现（提交 `6e7090b`）：同一预算 occurrence 若在其周期内有同类型、同账户（转账还需同目标账户）的真实交易，该点位从 `planned` 剔除，金额只留在 `committed`；`total = actual + planned + committed` 不变。
- 每个点位额外返回 `covered: ProjectionCoveredOccurrence[]`，列出本月被覆盖的预算点位与被剔除的 `planned` 金额，仅用于展示与解释；空数组是正常状态。
- `inflow/outflow/net.total`、`endCash`、`total` 由后端统一合成；前端只按返回字段堆叠，**不做去重、不做二次抵扣、不把 `covered.amount` 加回任何合计**。
- 若前端发现同一 occurrence 同时出现在两段，按后端缺陷处理并写测试，不在 UI 里抵扣。

### 3.6 字段映射（UI ← 契约）

| UI 元素 | 取字段 | 前端动作 |
|---|---|---|
| 起点现金 | `cash-flow-projection.startCash` | 格式化 |
| 起点净资产 | `asset-projection.base.netWorth` | 格式化 |
| 现金流柱（已发生） | `point.inflow.actual` / `point.outflow.actual` | 画实心段 |
| 现金流柱（按预算计划） | `point.inflow.planned` / `point.outflow.planned` | 画斜纹段 |
| 现金流柱（已排定） | `point.inflow.committed` / `point.outflow.committed` | 画点纹段 |
| 现金流柱合计标签 | `point.inflow.total` / `point.outflow.total` / `point.net.total` | 直接展示，不求和 |
| 现金流折线 | `point.endCash` | 画点，不累计 |
| 资产折线 | `point.total.netWorth` | 画点，不用 `base + Σ` |
| 资产累计构成明细 | `point.actual/planned/committed.netWorth` | 按后端累计值分层展示 |
| 本月预算额度 | `period-plan.points[].totals` | 直接展示，不按条相加 |
| 未来预算清单 | `period-plan.points[].budgets` | 直接渲染 |
| 缺口月份 | `period-plan.points[].hasBudget === false` | 画缺口，不读 `planned` 是否为 0 |
| 被覆盖的预算点位 | `point.covered` | 仅展示与解释：空数组不渲染任何标记；非空在明细中列出预算名、预算点位、真实交易日期与被剔除金额；**不抵扣、不加回任何合计** |
| 3 / 6 / 12 月 | 请求参数 `months` | 只传参，不切片 |
| 口径说明 | 前端固定文案 | 不来自接口；写明不含投资收益/资产增值 |

---

## 4. 展示设计

### 4.1 预算页（PC）

推演面板放在类型 tab 之上；下面的支出/收入/转账预算卡仍是**本周期执行**，不因推演改色。

```text
预算
┌ 预算推演 ────────────────────────────────────────────────────┐
│  [现金流] [资产]                         [3 月] [6 月] [12 月] │
│  起点现金 ¥12,400.00 · 基准日净资产 ¥86,500.00               │
│                                                              │
│  4,200 ┤   ▨▨▨        ▨▨▨        ▨▨▨        ▨▨▨            │
│        │   ███        ███        ███        ███            │
│  0     ┼──────────────────────────────────────────────       │
│        │   ███        ███        ███        ███            │
│ -3,800 ┤   ▨▨▨        ▨▨▨        ▨▨▨        ▨▨▨            │
│        │   11月       12月    [未设预算] 3月   4月              │
│        │   ────────╌╌╌╌╌╌╌  缺口  ╌╌╌╌╌╌╌                   │
│  11月: 已发生 ¥2,800 · 按预算计划 ¥1,100 · 已排定 ¥300        │
│  2月:  未设预算，不推演                           [去设置]     │
└────────────────────────────────────────────────────────────────┘

[支出] [收入] [转账]
  餐饮  ▓▓▓░░  已发生 286 / 1,500  剩余 1,214   ← 只由 actual 决定
  ...

历史（实际支出，按月）
```

- 顶部推演面板与下方预算卡**分数据源**：面板读 `asset-projection` / `cash-flow-projection` / `period-plan`，卡片读 `/budgets/statuses`。
- 面板不展示「每条预算 × 未来每个月」的聚合矩阵；未来预算清单只直接渲染 `period-plan.points[].budgets`，不在前端归集。
- 面板首屏默认「现金流」（D12），资产为第二 tab；切换只换图。三份数据一次取回，切换不重新请求，也不重算字段。
- `3 / 6 / 12` 只改请求参数与横轴，不改口径；三个端点使用同一 `months`。

### 4.2 总览

```text
┌ 预算执行 ─────────────────────────────┐    ┌ 未来现金流与净资产 ─────────────┐
│ 餐饮   ▓▓▓░░  已使用 286 / 预算 1,500 │    │ 起点现金 ¥12,400                │
│ 居住   ▓▓▓▓▓  已使用 5,600 / 5,600    │    │  11月  12月  1月  2月  ...      │
│ 购物   ▓▓▓▓▓  已使用 1,257 / 800      │    │  ███   ▨▨▨  ▨▨▨  缺口           │
└───────────────────────────────────────┘    │ 月末现金 ¥13,300 → ¥16,650      │
                                             │ 查看预算推演 →                  │
                                             └─────────────────────────────────┘
```

- 现有「预算执行」卡不动，仍是实际进度、仍可红条表示超支。
- 新卡「未来现金流与净资产」：默认 tab = 现金流（D12）；PC 默认 6 个月，移动默认 3 个月；现金流缩略图放分向柱 + `endCash` 折线，资产缩略图只放 `total.netWorth` 折线。
- 新卡数据与「预算执行」完全分开；不把推演金额加进任何实际合计。
- 无预算月份显示短横线缺口 + 「未设预算」；折线断开，不用 0 或上期值连接（§5.2）。
- `period-plan` 整段全为 `hasBudget: false` 时，新卡显示空态 + 「去设置预算」，不画 0 折线。

### 4.3 图表形态

**现金流（默认）**

- 柱：向上 `point.inflow.total`、向下 `point.outflow.total`；每根柱按 `actual / planned / committed` 三段堆叠（字段见 §3.2）。
- 折线：`point.endCash`，画在次坐标轴；不画「计划收入」「计划支出」两条线。
- 选中月份 → 明细展示 `point.startCash / inflow / outflow / net / endCash`，全部取后端字段，前端只做位置映射。
- 整体示意：[budget-forecast-marker.svg](file:///C:/Users/George/Documents/MoneyBrain/docs/blueprint/ux/budget-forecast-marker.svg)（现金流视图）。

**资产**

- 折线：`point.total.netWorth`；`actual.netWorth` 作为基准水平虚线。
- 选中月份 → **累计构成明细**：`actual.netWorth`（基准）+ `planned.netWorth`（预算累计）+ `committed.netWorth`（已排定累计）+ `total.netWorth`（后端合计）。前三项是后端返回的累计值，不是月增量。
- **不画月间差值瀑布**：`asset-projection` 只返回累计水平，画「上月→本月」的瀑布需要前端做 `points[i] - points[i-1]`，违反 §1 的零计算硬规则。若后续要月间瀑布，由后端补 `delta` 字段后再做。
- 资产视图的「柱」只出现在选中月份的累计构成明细里，不画主图柱，避免把累计存量误读成当月流量。

**`covered` 的解释层（两视图通用）**

- `covered` 为空数组：**正常渲染**，不显示徽标、不显示「0 条」、不留占位、不显示 0 金额——它表示本月没有预算点位被真实交易覆盖，不是缺数据。
- `covered` 非空：只在选中月明细/抽屉里追加一行信息提示，文案「本月这笔已按真实交易计入，不重复推算」，展开列出 `budgetName · 预算点位 date → 实际交易 transactionDate · 金额 amount`。
- 该解释层不新增柱段、不改变折线、不改变 `inflow/outflow/net/total`、`endCash`、`total.netWorth` 或任何合计；它的作用只是解释 `planned` 为何比预算额度少。

**为什么不是清一色柱**

- 现金流：柱承担「当月流量」，折线承担「月末现金存量」；两者同一横轴、不同量纲，用左右轴标签区分。
- 资产：只有折线承担「月末净资产存量」，选中月用累计构成明细替代主图柱。
- 缺口月份不画计划柱；折线**必须断开**（D11），避免把「没预算」读成「预算为 0」；缺口短横线与文案见 §5.2。

### 4.4 当月衔接

当前月必须同时回答两件事：

1. **已经发生什么**：现金流投影的 `point.inflow.actual / outflow.actual` 覆盖月初到 `asOf`；资产投影的 `actual` 是 `asOf` 当天真实存量。下方四态进度条仍只由已发生决定。
2. **按预算计划还会发生什么**：现金流投影的 `planned`（`asOf` 之后到月末）+ `committed`（已录入未来交易）；资产投影的 `planned` / `committed` 是截至月末的累计增量。

规则：

- 当前月现金流柱 = `actual` + `planned` + `committed` 三段；标签写「已发生 ¥x · 按预算计划 ¥y · 已排定 ¥z」。
- 当前月资产明细 = `actual.netWorth` + 截至月末的 `planned.netWorth` + `committed.netWorth` = `total.netWorth`；四项取后端值。
- 不按「当前速度」外推剩余天数；剩余日期只取后端 `planned`。
- 实际已超支：下方进度条红、文字「已超支 ¥x」；上方推演柱不改红，也不显示「将会超」。
- 当月 `period-plan.hasBudget = false` 但已录入未来交易：画缺口 + 已排定点，不补计划段。

### 4.5 视觉编码

| 语义 | 填充 | 折线/点 | 说明 |
|---|---|---|---|
| 已发生 `actual` | 实心、全不透明 | 实线/实心点 | 与现有报表「实际」一致；资产视图作基准水平线 |
| 按预算计划 `planned` | 同色系 45° 斜纹 | 虚线/空心点 | 旧 BaseChart 的「未来虚线」语言升级为斜纹 |
| 已排定 `committed` | 同色系点纹/细点 | 点线/实心小点 | 是真实交易但发生在未来，不能画成已发生 |
| 未设预算 `none` | 灰底斜纹缺口 | 断开 | 不画 0 柱、不连线 |
| 合计 `total/endCash` | 不单独填充 | 折线 + 端点标签 | 由后端给，前端不叠算 |

- 方向色沿用报表：流入绿、流出钢色/红；现金流柱的**状态只靠纹理区分**，避免与四态语义争色。
- 资产折线：`total.netWorth` 用虚线/空心点（含计划），`actual.netWorth` 用实线（基准）。
- 红、绿、琥珀、钢色进度 token 不用于推演图；四态颜色只在下方实际进度条出现。
- 图例必须同时写「实心=已发生、斜纹=按预算计划、点纹=已排定、缺口=未设预算」。
- 色盲/灰度下仍可区分：实心 vs 斜纹 vs 点纹的纹理差异必须保留，不能只靠透明度。

### 4.6 移动端 390

```text
╔═ 预算 ────────────────────────────╗
║ [现金流] [资产]                   ║
║ [3 月] [6 月] [12 月]              ║
║ 起点现金 ¥12,400                   ║
║ ┌───────────────────────────────┐ ║
║ │  ███   ▨▨▨   ▨▨▨   [缺口]     │ ║
║ │  11月  12月   1月    2月       │ ║
║ │  ─────╌╌╌╌╌   断     ╌╌╌╌      │ ║
║ └───────────────────────────────┘ ║
║ 11月 已发生 2,800 · 计划 1,100     ║
║ 已排定 300                        ║
║ [查看明细]                        ║
╚═══════════════════════════════════╝
```

- 图表高 240px；横轴月份过多时隔月显示标签，不横向滚动。
- 点柱/月 → 底部抽屉展示选中月明细；现金流为流入/流出/期末现金，资产为累计构成；不跳页。
- 图例折两行；金额标签换行展示，不用小字号硬塞。
- 不隐藏全局 FAB、不改手机框；底部留白沿用现有规则。

### 4.7 空态与边界

| 场景 | 展示 |
|---|---|
| 完全没有预算（`period-plan` 全 `hasBudget: false`） | 推演面板空态：「设置预算后查看未来现金流与资产」+ 新建入口；不画折线 |
| 某月 `period-plan.hasBudget = false` | 灰色短横线 + 「未设预算」+ 设置入口；折线断开；不显示 0、不显示历史均值、不用上期值连接 |
| 有预算点位但额度为 0 | 正常月份，`totals` 展示 0，标注「本月预算额度 0」；不画缺口 |
| 只有周/年预算 | 有 occurrence 的月份正常；没有 occurrence 的月份 `hasBudget: false`，按缺口处理 |
| 只有转账预算 | `totals.transfer > 0`、`hasBudget: true`；现金净额可能为 0，标注「转账，现金净额 0」，**不是缺口** |
| 只有已排定、无预算 | 缺口 + 已排定点；不补计划段，不连线 |
| 接口失败 | 面板内联错误 + 重试；不回退到前端本地计算 |
| 数据延迟 | 显示 `asOf` 与请求时间；不把旧缓存当实时结果 |

### 4.8 历史回看

- 历史仍只展示**实际支出**，按月聚合；不叠加预算线、不叠加计划或预测。
- 跨年可切、空月可停留、最早数据边界可见；历史条不随 3/6/12 推演窗口变化。
- 历史数据来源不是投影契约；失败不影响上方推演面板。

---

## 5. 前端渲染约束（实现方照此执行）

本节合并 §1 的职责边界与 §3.4 的无预算语义，是前端实现的唯一约束；与其它小节冲突时，以本节为准。

### 5.1 禁止清单

| # | 禁止 | 必须改为 |
|---|---|---|
| F1 | 对柱值/分段做 `sum` / `reduce` 求合计 | 直接取 `point.inflow.total` / `point.outflow.total` / `point.net.total` |
| F2 | 用 `base + Σ` 或 `startCash + Σnet` 累加折线 | 直接取 `point.total.netWorth` / `point.endCash` |
| F3 | 周/年 → 月折算（除以 12、乘周数、按天摊） | 直接取 `period-plan.points[].totals` |
| F4 | 插值、外推、按当前速度补剩余天数 | 只渲染后端 `planned` / `committed` |
| F5 | 用 `points[i] - points[i-1]` 生成月间瀑布 | 资产视图只画累计水平与选中月构成 |
| F6 | 用 0、历史均值、上期值填补无预算月份 | 画缺口，见 §5.2 |
| F7 | 把 `actual + planned` / `actual + predicted` 合并成一个数字 | 三态分段展示，合计只读后端字段 |
| F8 | 前端对 `planned` / `committed` 去重或抵扣 | 后端负责互斥，前端只分段渲染 |
| F9 | 先拉 12 月再按 3/6 切片 | 请求参数 `months` 直接传 3/6/12 |
| F10 | 无数据时画 0 线或空坐标轴 | 走 §5.2 的降级状态 |
| F11 | 从 `planned` 里二次抵扣 `covered`，或把 `covered[].amount` 加回 `inflow/outflow/net/total`、`endCash`、`total.netWorth` 等任何合计 | `covered` 只用于展示与解释；后端已把命中点位从 `planned` 剔除、金额留在 `committed`，`total` 不变 |

一句话：**所有合计、序列点、缺口状态一律取后端字段；前端只负责取数、格式化、渲染。**

### 5.2 数据未就绪的降级

原则：**宁可显示「暂无数据 / 未设预算」，也不显示错误的 0 线或空白。**

| 状态 | 判定 | 页面必须显示 | 禁止 |
|---|---|---|---|
| 加载中 | 请求未返回 | 图表骨架 + 「正在计算」；保留 tab 与范围控件 | 闪空、先画 0 线 |
| 整段无预算 | `period-plan` 全部 `hasBudget: false` | 面板空态：「设置预算后查看未来现金流与资产」+ 新建入口；若有 `committed`，保留点纹点但无计划段/线 | 空白、0 折线 |
| 单月无预算 | `hasBudget: false` / `totals: null` | 该月灰色短横线（6px）+「未设预算」+「去设置」；不画计划柱；折线断开 | 0 高柱、上期值连线、历史均值 |
| 序列为空/null | 投影返回 `points: []` 或 `null` | 空态文案「暂无推演数据」+ 重试；保留 tab 与范围 | 空白、0 线、编造点 |
| 部分月份缺失 | 某些 point 为 null / 缺字段 | 缺月画缺口 + 「数据未就绪」；其它月正常；折线在缺月断开 | 用 0 或相邻月补齐 |
| 请求失败 | HTTP / 解析错误 | 内联错误 + 重试；标明未使用前端兜底计算 | 前端本地算一份“兜底” |
| 有 `committed` 无预算 | `hasBudget: false` 且 `committed` 有值 | 缺口 + 已排定点纹标记；不补计划段、不连线 | 把 `committed` 画成计划 |
| 合法 0 值 | `hasBudget: true` 且 `totals` / `planned` = 0 | 正常柱/线，标「本月预算额度 0」 | 当成无预算缺口 |

缺口视觉规格：

- 短横线：`#A4A8A2`、线宽 6px、长度约 36px，位于该月基线；**不是 0 高柱**。
- 文案：短横线上方 11px `#565A60`「未设预算」；整段无预算时改用面板空态，不重复画缺口。
- 折线：在缺口月前一个点后断开，缺口月后从下一个有数据月重新起线；**禁止**用 0 或上期值连接。
- 若该月有 `committed`：只画点纹/实心点，不连线到计划段；tooltip 标「已排定，未设预算」。
- 读屏：缺口月 `aria-label="未设预算，无计划数据"`。

`covered` 渲染规格（不是降级状态）：

- 空数组：按正常月份渲染，**不显示徽标、不显示「0 条」、不留占位、不显示 0 金额**；空数组表示「本月无点位被真实交易覆盖」，不是数据缺失。
- 非空：在选中月明细/抽屉追加信息行，主干文案「本月这笔已按真实交易计入，不重复推算」，补充「预算点位 `date` → 实际交易 `transactionDate`」并列出 `budgetName` 与被剔除金额 `amount`。
- 该信息行只解释 `planned` 变少的原因；不新增柱段、不连线、不参与任何合计，读屏用 `aria-label="已被真实交易覆盖，不重复推算"`。

### 5.3 实现自检

- 新增投影组件对 `points` 的 `reduce` / `sum` / `points[i-1]` 命中为 0。
- 源码中无 `/ 12`、`* 52`、`365` 等预算折算常量。
- mock `points: null` / `points: []` / `hasBudget: false` 时，页面走 §5.2 对应状态，不是 0 线。

---

## 6. 语义一致性

| 维度 | 规则 |
|---|---|
| 只读 | 推演不生成交易、不写预算、不写审计、不改变账本 |
| 报表合计 | 推演金额不进「本月支出」「本期收入」「净资产实际值」等实际合计；实际报表沿用现有口径 |
| 四态进度条 | 只由 `actual` 决定；`planned` / `committed` 不改条色、不改百分比文案 |
| 三层桑基 | 只画过去实际流向；推演用柱/折线/累计构成独立呈现，**不进入桑基节点或连线** |
| 旧合并口径 | 不复用 `actual + predicted` 的 `PredictionStatistic` / 资产报表合计；新面板三态分开 |
| 超支判断 | 仍只看已发生：`actual > 预算额度` 才是超支；计划/已排定只展示事实 |
| 金额 | 后端 `Minor` 整数分；前端只格式化两位小数，不做单位换算 |
| 未来预算额度 | 以 `period-plan.points[].totals` 为准；不在前端按预算条数或周期归集 |
| 日期 | 本地日历日；后端按本地日展开，前端不自行解析 `slice(0, 10)` |
| 推演说明 | 面板底部固定文案：仅含预算与已录入未来交易，不含投资收益、资产增值、汇率变动 |

---

## 7. 验收口径

| # | 验收点 | 可实测方式 |
|---|---|---|
| 1 | 前端不做推演计算 | mock 返回哨兵值（如 `inflow.planned = 12345`）；UI 展示与接口一致；新增投影代码中对 `points` 的 `reduce/sum` 命中为 0，且无 `points[i] - points[i-1]` |
| 2 | 3/6/12 由后端控制 | 切换后三个端点请求 `months` 分别为 3/6/12，返回点数一致；前端无 `slice(0, n)` |
| 3 | 月末值不由前端累计 | 篡改 `endCash` / `total.netWorth` 返回值，折线端点随之改变；前端无 `startCash + Σnet`、`base + Σ` |
| 4 | 计划与已排定分开 | 构造「房租预算 + 同月未来真实房租」：`planned` 中无该点位、金额只在 `committed`，`covered` 有对应记录，不双计；柱段与图例一致 |
| 5 | 已排定不被当成已发生 | 未来真实交易进入 `committed` 段；`actual`、进度条、四态均不变 |
| 6 | 未设预算缺口 | `period-plan.hasBudget = false` 月份 DOM 有灰色短横线（6px）+「未设预算」；折线在该月断开，前后点不连接；无 0 高柱、无历史均值、无上期值连线 |
| 7 | 当月衔接 | 当前月现金流柱 = `actual` + `planned` + `committed`；当前月资产明细四项取后端；剩余日期无「按当前速度」文案或字段 |
| 8 | 视觉可区分 | 灰度截图下实心/斜纹/点纹可辨；图例四项齐全；资产基准线与 `total.netWorth` 可辨；读屏能读出段名与金额 |
| 9 | 四态不冲突 | 实际 74% + 大额计划：进度条仍为实际状态；实际 >100% 才红 |
| 10 | 桑基不含推演 | 桑基节点/连线无 `planned` / `committed`；推演面板不渲染桑基 |
| 11 | 实际合计不变 | 推演面板出现前后，总览/报表/流水的实际合计与账本计数不变 |
| 12 | 只读 | 请求前后交易、预算、审计事件计数不变；无写请求 |
| 13 | 空态/错误 | 整段无预算 → 面板空态 + 新建入口；接口失败 → 内联错误 + 重试；不回退本地计算 |
| 14 | 移动端 | 390×844 真实视口：无横向溢出；图例两行可见；FAB 不遮挡；点柱出明细 |
| 15 | 回归 | `typecheck` / `lint` / `test:web` 通过；新增投影组件对旧 `PredictionStatistic` 合并口径引用为 0 |
| 16 | 前端禁止清单 | 新增代码无柱值 `sum/reduce`、无 `base + Σ`、无周/年→月折算常量、无 `points[i] - points[i-1]`；合计只读 `.total` |
| 17 | 空序列降级 | mock `points: null` / `points: []`：页面显示「暂无推演数据」+ 重试，不是空白、不是 0 线 |
| 18 | 缺月降级 | mock 某月 point 为 null：该月显示「数据未就绪」缺口，其它月正常，折线在缺月断开，不用 0/邻月补齐 |
| 19 | 默认 tab | 预算页推演面板首次进入为「现金流」，资产为第二 tab；总览卡默认现金流 |
| 20 | `covered` 只解释 | mock `covered: []` 正常渲染，无徽标/「0 条」/占位；mock 非空时明细出现「本月这笔已按真实交易计入，不重复推算」，且 `inflow/outflow/net/total`、`endCash`、`total.netWorth` 均不变；代码中 `covered.amount` 不参与求和或抵扣 |

---

## 8. 已定口径（无待拍板）

### 8.1 已定

| # | 结论 |
|---|---|
| D1 | 推演全部由后端计算；前端只取数、格式化、渲染，禁止求和/累计/折算/插值 |
| D2 | 使用 `asset-projection`、`cash-flow-projection`、`budgets/period-plan` 三个只读契约；字段见 §3 |
| D3 | 三态拆分：`actual` 已发生、`planned` 按预算计划、`committed` 已排定；三者互斥且视觉可分 |
| D4 | 当前月 = 已发生 + 剩余日期计划 + 已排定；不按速度外推 |
| D5 | 未设预算月份以 `period-plan.hasBudget: false` / `totals: null` 为准，前端画可见缺口；不拿 0 / 历史 / 上期填补 |
| D6 | 月末现金与月末净资产直接取 `endCash` / `total.netWorth`；前端不做 `base + Σ` |
| D7 | 3/6/12 月通过 `months` 参数由后端出数，前端不切片 |
| D8 | 预算页顶部推演面板 + 总览「未来现金流与净资产」卡；「每条预算 × 未来每个月」的聚合矩阵不在本次范围，`period-plan` 自带的未来清单可直接展示 |
| D9 | 四态进度条、三层桑基、实际报表合计不变；推演只读 |
| D10 | 历史仍只保留实际支出，不叠加预算/计划/预测 |
| D11 | 无预算月份：**折线断开 + 灰色短横线缺口（线宽 6px、长约 36px）+「未设预算」**；理由「没设预算 ≠ 计划为 0」；禁止用 0 或上期值连接；视觉规格见 §5.2 |
| D12 | 预算页推演面板默认 tab = **现金流**，资产为第二 tab；总览卡默认也展示现金流 |
| D13 | `covered` 只用于展示与解释（「本月这笔已按真实交易计入，不重复推算」）；空数组按正常月份渲染；不参与任何合计，前端不二次抵扣 |

### 8.2 待拍板：无

本次无待拍板项。契约字段、无预算语义、去重责任、视觉编码、3/6/12、移动降级、默认 tab 均按 §5 与 §8.1 写死；实现方直接按 §5 执行。唯一的实现缺口是预算编辑器的 `daily` 周期与 `transactionTime` 输入（§2.2 / §2.3），属接线前的前置工作，不是待拍板口径。

---

## 9. 本方案明确不做

1. 任何统计外推：日均、近 3/6 月加权、趋势、预计月末、降级链。
2. 前端自行计算月度结余、资产累计、周/年折算、缺口插值。
3. 把 `actual + planned` 或 `actual + predicted` 合并成一个展示数字。
4. 用 `0` 或历史均值填补未设预算月份。
5. 进度条条外预测标记（2px 竖杆 + 空心虚线三角）不再使用；`budget-forecast-marker.svg` 已改为预算推演面板示意，不再包含该标记。
6. 前端自行归集的「每条预算 × 未来每个月」聚合矩阵；`period-plan` 自带的未来预算清单可直接渲染。
7. 推演进入三层桑基、流水合计、实际报表合计。
8. 生成交易、写预算、写审计或持久化推演结果。
