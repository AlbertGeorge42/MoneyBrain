# 未来报表：唯一口径

> 状态：**2026-11-08 定稿（阶段 6）**。本文件是报表未来区间的唯一口径来源。
> 旧的`预算前瞻 v3`方案已完成接线并被本文件取代，管线与参数以本文件为准。
> 代码入口：[ReportsPage.tsx](file:///C:/Users/George/Documents/MoneyBrain/apps/web/src/features/reports/ReportsPage.tsx)、
> [TimeBar.tsx](file:///C:/Users/George/Documents/MoneyBrain/apps/web/src/features/reports/TimeBar.tsx)、
> [futureModel.ts](file:///C:/Users/George/Documents/MoneyBrain/apps/web/src/features/reports/futureModel.ts)、
> [prediction.tsx](file:///C:/Users/George/Documents/MoneyBrain/apps/web/src/features/reports/prediction.tsx)。

## 1. 时间轴三态

报表时间条只有一条，四个视图共用。区间相对账本锚点 `asOf` 分三态：

| 状态 | 判定 | 含义 |
|---|---|---|
| 已发生 `past` | `to <= asOf`（时点：`point <= asOf`） | 只取历史报表 / 真实余额 |
| 混合 `mixed` | 起点在 `asOf` 前、终点在 `asOf` 后 | 桶内同时有已发生段与未来段，分段展示、不相加 |
| 全未来 `future` | `from > asOf` | 只展示预测数据源 |

`asOf` 在真实账本里是今天；种子模式使用冻结锚点。时间条上的「已发生 / 混合区间 · 含未来 / 全未来」标签直接显示该状态。

## 2. 粒度与未来上限

四粒度同一套参数：`from`、`to`、`granularity=day|week|month|year`。桶边界由后端向外对齐，不拆桶：

| 粒度 | 标签 | 对齐 | 未来上限（只约束 `to`） |
|---|---|---|---|
| `day` | `YYYY-MM-DD` | 自然日 | 3 个月 |
| `week` | `YYYY-Www` | ISO 周（周一–周日） | 6 个月 |
| `month` | `YYYY-MM` | 自然月 | 12 个月 |
| `year` | `YYYY` | 自然年 | 3 年 |

超过上限时后端返回 400 与可操作文案；时间条也按同一规则截断并提示。不传任何窗口参数时，默认「月粒度、从 `asOf` 所在自然月起连续 12 个月」；`fromMonth / months` 已删除，不再作为入口。

## 3. 预测编码

未来数字不能只靠颜色或透明度区分。统一编码由
[prediction.tsx](file:///C:/Users/George/Documents/MoneyBrain/apps/web/src/features/reports/prediction.tsx)
产出，四个视图不得各写一份：

- **常驻文字标记**：任何未来数字旁必须有「预测」；预算计划额外标「预算计划」。图例首项固定为「预测」。
- **实线 / 虚线**：已发生实线；预测虚线。`asOf` 位置画竖向虚线并标「数据截至」。
- **柱状图纹理**：预算计划 = 45° 斜纹，已排定 = 点纹。柱的底色与描边沿用既有语义 token，**不新增颜色、不改 token 数值、不靠透明度**。
- **表格行内后缀**：`hint=预测` 走 `PredictionBadge`，不出现裸字符串。

## 4. 各视图降级边界

| 视图 | 数据源 | 未来区间行为 |
|---|---|---|
| 资产负债 `balance` | `asset-projection` | 桶末余额；`actual / planned / committed / total` 全部取后端字段，前端只展示与拼文案 |
| 收支 `flow` | `budgets/period-plan` + 历史收支逐桶 `actual` | 只展示「预测 · 预算计划」；**后端没有 `actual/planned/committed` 分项**，因此不显示「真实 + 预测 = 合计」，也不做跨桶额度合计 |
| 现金流 `cash` | `cash-flow-projection` | 流入 / 流出 / 净额三项各自拆分；`endCash = startCash + net` 恒成立；`covered[]` 只作解释，不再二次抵扣 |
| 投资 `invest` | 仅历史报表 | 时间条不禁用；正文显示「该视图暂无未来数据源」空态，并提供「回到已发生」入口（重算 `from/to` 回到当前桶） |

收支混合桶的规则：

- `point.budgets` 中 `date > asOf` 的 occurrence 才属于「预算计划」；当前桶内剩余日期正常出桶。
- 已发生段来自历史收支报表的逐桶 `actual`，与预算计划**分段展示、不相加**；混合桶不显示桶内总合计。
- 纯未来桶可以显示后端 `totals`（收入 / 支出 / 转账），但这是**桶内合计**，不是跨桶额度合计。
- `hasBudget=false` 显示「未设预算」；后端 `totals=null`，前端不得用 0 冒充。

`period-plan` 的 `budgets[]` 按 occurrence 日期升序（同日期按 `budgetId`），`totals` 由后端求和。

## 5. 不做前端相加（硬规则）

1. `total`、`endCash`、`totals` 一律取后端字段；前端不写 `actual + planned + committed`、不写「真实 + 预测」。
2. 同一 occurrence 的预算点位与真实交易互斥在后端完成；前端不抵扣。
3. 资产口径只做预算展开 + 已排定交易，不做统计外推、不推定投资收益。
4. 历史回看仍只展示实际数据，不叠加预算线 / 计划 / 预测。

## 6. 入口

- 预算页保留纯文字入口「查看未来报表 →」，跳转到报表页未来区间（默认收支视图）。
- 总览不再保留推演卡入口；旧推演面板、推演卡与 `forecast.css` 已在阶段 6 删除。
- 报表页从预算入口进入时初始为「未来 3 个月 · 月粒度」的收支视图。

## 7. 明确不做

- 不恢复 `fromMonth / months` 兼容参数。
- 不在前端推算桶边界、不出前端合计、不用透明度编码预测。
- 不把投资视图的未来空态做成禁用时间条。
