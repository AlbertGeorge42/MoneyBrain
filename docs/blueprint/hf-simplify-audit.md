# 高保真前端精简审查（只读）

> 审查对象：`apps/web/src/features/**`、`apps/web/src/app/design/**`、`apps/web/src/features/shell/**` 及相关样式
> 基线：`4816ad7`（旧 `pages|components|layouts|queries|hooks` 已于 `73c2709` 清退）
> 快照时间：2026-11-07。**审查期间另一会话正在改主题接线与旧前端收尾**，工作区有大量未提交改动。
> 本文只出清单，未改任何代码、未写库、未连接 `apps/api/prisma/dev.db`。

## 0. 先说明一个结论

「antd 残留」维度**已被并发会话基本清零**（工作区口径）：`from 'antd'`、`@ant-design`、`ant-` 选择器、`antd-overrides.css`、`styles/theme/config.ts|chart-tokens.ts|financial-tokens.ts|ThemeContext.tsx|mode.ts` 均已删除或在删除中；`package.json` 已无 antd；e2e 里也没有等 antd 的 helper。

因此这条维度**不要再排期**，只剩三处尾巴（见 A5）。

图例：🔴 = 与并发会话正在改的文件撞车，必须等其提交后再动；🟢 = 当前无人在改，可独立做。

---

## 1. 低风险高收益（不改视觉、可独立验证）

### A1 删除 0 引用 CSS（约 50 行）

| # | 位置 | 问题 | 动作 | 冲突 |
|---|---|---|---|---|
| 1 | `features/overview/overlays.css:75-95` | `.mb-seg` 整块（含 `.mantine-SegmentedControl-indicator`）。QuickEntry 早已改成自定义 `<button aria-pressed>`，这是上一版 Mantine SegmentedControl 的遗留样式 | 整块删 | 🟢 |
| 2 | `features/overview/overlays.css:127-131` | `.mb-currency` 0 引用 | 删 | 🟢 |
| 3 | `features/overview/overlays.css:132-137` | `.mb-chip-row` 0 引用 | 删 | 🟢 |
| 4 | `features/overview/overlays.css:138-161` | `.mb-chip / :hover / [aria-pressed='true']` 仅被 `shell.css:301` 的 `.mb-sheet .mb-chip` 反向引用，TSX 中无任何 `mb-chip` | 两处一起删 | 🟢 |
| 5 | `features/overview/overlays.css:162-?` | `.mb-entry-hint` 0 引用（QuickEntry 已用行内提示） | 删 | 🟢 |
| 6 | `features/overview/overview.css:447,454,459,464` | `.mb-amount` 0 引用；四条规则与 **活的** `.mb-m-tx-amount` 共组 | 只从分组选择器中移除 `.mb-amount`，保留 `.mb-m-tx-amount` | 🔴（overview.css 正在改） |
| 7 | `features/transactions/transactions.css:370-381`、`1265` | `.mb-tx-row-trigger` 0 引用（已被 `TxRow` 的两段式行取代） | 删规则；`1265` 从分组里移除该成员 | 🔴（transactions.css 正在改） |
| 8 | `features/reports/reports.css:1381`、`1396` | `.mb-rp-sankey-label` 0 引用（桑基标签已改用组内其它类） | 从两处分组选择器移除该成员，**不要删整块** | 🟢 |

验证：`npm run lint` + `npm run test -- css-vars-guard`；CSS 删除可用 `git grep -n "<类名>"` 复核为 0。

### A2 删除完全无引用的导出（约 180 行，含 1 个整文件）

已用脚本扫描 `src + tests`（同名符号在定义文件内也只出现 1 次）：

| 符号 | 位置 | 说明 |
|---|---|---|
| `SECTION_GROUP_TITLES` | `features/settings/settingsModel.ts:50` | 分区标题已内联到 `SettingsPage` |
| `ASSET_KINDS` / `LIABILITY_KINDS` | `settingsModel.ts:66-67` | 旧表单分组遗留 |
| `accountCountLabel` / `txCountLabel` | `settingsModel.ts:450,454` | 旧统计文案，页面已改写 |
| `restoreTransactionCategoriesInLedger` | `features/transactions/ledgerOps.ts:148-?` | **删前确认**：种子模式下分类删除撤销已改为快照/`restoreTransactionsInLedger` 路径 |
| `transactionNet` | `features/transactions/filters.ts:162` | 报表改用 `summarizeTransactions` |
| `resetReportSettings` | `features/reports/reportSettings.ts:142` | 重置入口已直接构造默认对象 |
| `daysBetween` / `isValidRange` | `features/reports/reportsTime.ts:121,238` | 校验已并入 `normalizeRange` |
| `formatRangeText` | `features/shared/datePicker/datePickerModel.ts:150` | 日期文案改由 `DatePicker` 内部渲染 |
| `yAxisLabelLeftEdge` | `features/shared/chartLayout.ts:65` | 图表轴标签布局改为 `charts.tsx` 内联计算；测试也没有用到 |
| `currencyTooltipFormatter` + `TooltipParams` | `utils/format.ts:71-88` | ECharts HTML tooltip 遗留；当前图表是自绘 SVG |
| `createStatisticFormatter` | `utils/format.ts:98` | AntD Statistic 遗留，函数体内注释仍写着「与 Ant Design Statistic 对齐」 |
| `investmentApi`（48 行整块） | `services/api.ts:294-341` | 投资里程碑未触发；按 AGENTS.md「不提前实现」应删，等阶段 4 再恢复。**若投资页面本周开工则保留** |
| `tests/mocks/api.ts` 整文件 | `apps/web/tests/mocks/api.ts:1-?` | `createMockApi/createSuccessResponse/createErrorResponse` 全仓 0 引用（无任何测试 import），直接删文件 |

验证：`npx tsc --noEmit -p apps/web`（或 `npm run typecheck`）+ 单测；删除后 CI 才能证明没有隐藏引用。

### A3 只在测试里出现的导出（不删实现，只去掉 `export`）

这些是纯函数，测试有价值，但业务侧不再接线。建议保留函数、去掉 `export`，或补回调用：

- `settingsModel.ts:209 categoryTxCount`
- `ledgerOps.ts:127 restoreTransactionsInLedger`（与 A2 的 `restoreTransactionCategoriesInLedger` 成对，先确认哪一个是现役撤销路径）
- `filters.ts:174 summarizeTransactions`
- `overview/apiLedger.ts:252 fetchAllTransactions`
- `styles/theme/hf-theme.ts:327 buildMbColorVarNames`：**保留 export**，它是 `css-vars-guard.test.ts` 的守卫入口

### A4 删掉第二套结构 token 中 0 引用的成员（`variables.css:8-46`）

实测引用次数（排除 token 定义文件本身）：

| token | 引用 | 动作 |
|---|---|---|
| `--mb-space-xs/sm/md/lg/xl/2xl/3xl` | 全部 **0** | 整段删（HF 用 `--mb-s-1..7`） |
| `--mb-font-size-sm/body/body-lg/title/heading` | 全部 **0** | 整段删（HF 用 `--mb-fs-0..6`） |
| `--mb-border-width-thick` | **0** | 删 |
| `--mb-font-ui/display/num` | 41 / 31 / 60 | **保留**（全局字体族，定义在 `:root` 是合理的） |
| `--mb-border-style-dashed` | 2 | 保留 |
| `--mb-radius-control` | 24 | 见 B4（值 = 6px，可零视觉迁移） |
| `--mb-radius-card` | 3 | 见 B6（8px 在 HF 圆角表里没有对应值） |
| `--mb-motion-fast/mid`、`--mb-ease-standard` | 5 / 2 / 7 | 见 B4（曲线不同，属视觉决策） |
| `--mb-z-batchbar/z-toast` | 3 / 1 | 见 B4（需先核对层叠顺序） |

文件头注释已写「仅包含主题无关的结构 token」，但实际仍并存两套；清掉空间/字号后，这个文件才名副其实。预计删 ~15 行。

### A5 antd 收尾的 3 处尾巴（不是排期项，顺手做）

1. 历史注释：`utils/format.ts:93-96`（「与 Ant Design Statistic 对齐」，随 A2 一起删）、`e2e/tests/settings.spec.ts:7`、`e2e/tests/theme.spec.ts:7`（「旧 antd 版…」），改成当前事实或删除。
2. `tests/setup.ts`：确认没有 antd mock 残留（并发会话已改，复核即可）。
3. `package.json` / `package-lock.json`：确认 antd、`@ant-design/*`、`dev:legacy` 均已移除（工作区看起来已移除）。

### A6 未跟踪的历史临时产物（不属于本次审查范围，但违反 AGENTS.md「一次性脚本不留仓库」）

`NIGHTLY-HANDOFF.md`、`apps/web/vite.capture.tmp.config.ts`、`scripts/tmp-capture-root-vars.mts`、`scripts/tmp-theme-switch.mts`、`artifacts/`。
判定：**大概率是并发会话/上一轮复核留下的**，不要在本条里删；只在收尾时问一句归属。

---

## 2. 需要设计决策（会改视觉/交互，或需要跨文件约定）

### B1 四套 toast（最强的一处重复造轮子）

| 系统 | 位置 | 能力 |
|---|---|---|
| 外壳全局 | `app/design/DesignApp.tsx:183-214, 388-410` + `design.css:201-230`（`mb-hf-toast`） | 文案 + 可选动作 + 可配时长 |
| 报表页 | `features/reports/ReportsPage.tsx:84, 232, 286, 296, 514-520` + `reports.css:1796-1820`（`mb-rp-toast`） | 2.4s 纯文案，`is-over-sheet` 位置修正 |
| 设置页 | `features/settings/SettingsPage.tsx:909, 1015, 1039, 1058, 3324-3336` | **复用** `mb-hf-toast` 的 CSS，但自己实现 state/timer |
| 流水页 | `features/transactions/TransactionsPage.tsx:55, 257-269, 409-418, 736` + `transactions.css:1209, 1322`（`mb-tx-toast-stack`） | 最多 3 条堆叠 + 撤销回调 |

建议：先抽 `ToastProvider + useToast()`（保留现有视觉与时长差异，只去重 state/timer/清理逻辑），把 4 处调用改成 `notify(message, { duration, action })`。**不要**一步换 `@mantine/notifications`：需要新增依赖，且底部固定位置、`is-over-sheet`、390 宽手机框内的定位都要重调。
改动量：~120 行删除 / ~80 行新增；风险中（撤销 6s 与批量操作的时序）。🔴 涉及 `SettingsPage/DesignApp/transactions.css`，必须等并发会话提交。
收益：少 2 套 CSS、3 份定时器清理逻辑、3 个 `ToastState` 类型。

#### B1-1 已落地（2026-11-07）与待定口径

已实现 `features/shared/toast.tsx` + `toastContext.ts` + `toast.css`：
`notify(message, { variant, duration, action })` / `dismiss(id)`；`shell` 由 Provider 自动 body-portal，
`reports` / `stack` 由页面内 `<ToastViewport variant>` 渲染。四套调用点的 state/timer/渲染已删除，
调用方逐项显式传参以**保持当前可见行为**（零视觉改动、零行为退化，18 组视口×主题 rect/CSS 比对无差异）。

以下 4 处口径差异**本轮刻意不统一**，作为后续待定项（决定后再改数值，一次一项）：

| 项 | 现状 | 待定问题 |
|---|---|---|
| 普通提示时长 | `shell` 2400ms；设置页 2600ms | 是否统一为 2400ms（设置页持有 2600ms 是历史实现，非设计值） |
| 带动作提示时长 | `shell` / 设置页 6000ms；`stack` 恒 6000ms（有无动作都一样） | 是否让 `stack` 也区分有无动作（无动作缩短到 2400ms？） |
| 条数上限 | `shell` / `reports` 新盖旧（1 条）；`stack` 最多 3 条 | 是否统一为 3 条堆叠，或全局限 1 条 |
| 层级/定位 | `shell` body portal（可盖抽屉）；`reports` 手机态 `is-over-sheet` 抬到 380px；`stack` 留在页面流内 | 是否把三种定位收敛为一套「页面内 + 抽屉之上」规则 |

### B2 三套 Tabs + 四套 Segmented（Mantine 有现成组件）

- Tabs：`reports.css:36-70`（`.mb-rp-tabs/.mb-rp-tab`）、`settings.css:137-170`（`.mb-set-tabs/.mb-set-tab`，`SettingsPage.tsx` 4 处 `role="tablist"`：1742/1906/1955/2050）、`ReportsPage.tsx:130-171`（同一组 tab 为移动/桌面写了两遍）。
- Segmented：`ReportsPage.tsx:93-119` 自行实现的 `Segmented<T>` 泛型组件；`TimeBar.tsx` 的 granularity 按钮组；`BudgetPage.tsx:936` `.mb-bg-seg`；`ReportSettingsPanel.tsx:84` 的 `Toggle`；QuickEntry 的收支类型按钮（`aria-pressed`）。
- Mantine 对应：`Tabs`、`SegmentedControl`。但原型的 3px 内衬、32px 高、`is-active` 字重/底色与 Mantine 默认差异明显，**直接换会破坏像素对齐**。
- 建议：抽一个 `HfSegmented`（受控 `value/items/ariaLabel`）+ 一个 `HfTabs`，内部用现有 CSS，先做「同文件去重」，再评估是否换 Mantine 皮肤。`ReportsPage.tsx` 的移动/桌面双写是第一个可收掉的点。
- 改动量：中（~200 行级）；风险中（视觉回归必须用 390×844 与桌面双档截图）。

### B3 四套 Switch / 勾选交互

- `BudgetPage.tsx:722` `role="switch"` + `.mb-bg-switch-*`；
- `ReportsPage.tsx:991` `role="switch"` + `.mb-rp-config-toggle`（`reports.css:1583-1620`）；
- `SettingsPage.tsx:2287` `role="switch"` + `.mb-set-switch`；
- `TransactionDetailPanel.tsx:464` `.mb-tx-excluded-toggle`（`transactions.css:501-527`）；
- `ReportSettingsPanel.tsx:84` 的 `Toggle` 又是 button + `aria-pressed`。

Mantine 对应：`Switch`（视觉需按原型调 track/thumb/状态文案）。建议统一成一个 `HfSwitch`，无障碍语义统一为 `role="switch" + aria-checked`（目前混用 aria-pressed）。改动量：小-中；风险中（触控 44px 命中区）。

### B4 token 双轨收敛（第二套 token 的价值判断）

- `--mb-radius-control`（24 处，`reports.css` 9 / `transactions.css` 10 / `datePicker.css` 3 / `states.css` 2）→ `--mb-radius-xs` 同为 **6px**，**零视觉改动**，建议直接迁。
- `--mb-radius-card`（3 处，仅 `reports.css`）值为 8px；HF 圆角表是 6/10/14/20。要么保留作为一次性语义 token，要么接受 8→10px 的视觉变化。**需要设计确认**。
- `--mb-motion-fast`(=150ms) / `--mb-motion-mid`(=240ms) / `--mb-ease-standard` 与 `--mb-dur-1`(150ms) / `--mb-dur-2`(280ms) / `--mb-ease`：时长只有 mid 差 40ms，缓动曲线不同。迁移会有轻微手感变化，属可接受但需拍板。
- `--mb-z-batchbar:50` / `--mb-z-toast:500` vs `--mb-z-fab:110`：三套 z 值没有统一阶梯。建议先画一张层叠表（fab / batchbar / toast / drawer / modal）再合并，否则容易出现遮挡。
- 改动量：小（24 处替换 + 4 行删除）；风险低-中。🔴 `variables.css` 正在被并发会话改。

### B5 20 处 Drawer 各自重复 10-14 行配置（Mantine Drawer 的封装缺失）

同一段「移动端 bottom / 桌面端 right + 尺寸 + `withinPortal={false}` + `portalTarget` + `classNames`」在 11 个文件里复制了 20 次：

`ReportsPage.tsx`(4)、`SettingsPage.tsx`(6)、`BudgetPage.tsx`(2)、`QuickEntry.tsx`(2)、`TransactionDetail.tsx`(1)、`TransactionDetailPanel.tsx`(1)、`FilterPanel.tsx`(1)、`DisplayPanel.tsx`(1)、`ReconcileSheet.tsx`(1)、`BatchDialogs.tsx`(1)、`DatePicker.tsx`(1)。

建议：抽 `HfSheet`（props: `opened/onClose/title/device/size/children`），把 portal 目标与位置三元表达式收进去。**不改视觉**，属纯重构；但一次动 11 个文件，建议分两批：先 5 个干净文件，Settings 的 6 处等并发会话结束。
改动量：删 ~150 行 / 新增 ~60 行；风险中（zIndex、portal、`mb-sheet` 类名与关闭手势）。

### B6 三套卡片外壳

- `overview.css:309-319` `.mb-card`
- `reports.css:322-329` `.mb-rp-card`
- `states.css:3-14` `.mb-coldstart / .mb-errorpanel`

三者声明几乎逐行相同（`--mb-card-pad` + 1px 边框 + `surface-raised` + `mb-sh-1`），唯一差别是圆角 token（`md` 14px vs `card` 8px）。建议合到一个 `.mb-card` 基础类，业务类只覆盖差异；圆角差异需要设计拍板（同 B4）。改动量：小；风险低（但会改 3 个页面的观感，需截图对比）。

### B7 两套 Button 体系

实测：Mantine `<Button>` 仅 **11** 处；原生 `<button>` **207** 处，配 18 个自定义类（`mb-primary-btn`、`mb-secondary-btn`、`mb-tx-btn`、`mb-bg-*`、`mb-rp-*`、`mb-set-*`…）。`mb-primary-btn`/`mb-secondary-btn` 同时被 Mantine Button 的 `className` 和原生按钮使用，等于「同一视觉两套 DOM」。

Mantine 对应：`Button`（`variant/size`）。建议不要一次性替换 207 处：先定一个 `HfButton`（或 Mantine Button 的 `classNames` 映射），把 14 处 `mb-*-btn` 主/次按钮先迁，其余保持；否则回归量过大。改动量：大；风险高；收益主要是减少一套视觉定义，**可后排**。

### B8 自研 DatePicker：建议保留，但要收口

`features/shared/datePicker/DatePicker.tsx`（558 行、17 个 props）+ `datePickerModel.ts` + `datePicker.css`，仅 2 个调用点。Mantine 对应 `@mantine/dates` 的 `DatePickerInput`（未安装）。

不建议替换：原型的月/年粒度吸附、自定义区间预设、移动端底部 Sheet、`不限` 文案都是 Mantine 不直接提供的；换库要新增依赖并重做 3 类交互，风险远大于收益。
建议：① props 收成一个 `DatePickerProps` 对象；② 把 Sheet 部分换 B5 的 `HfSheet`；③ 在组件头注释写清「为何不用 Mantine dates」。改动量：小；风险低。

### B9 半成品 UI

`features/shared/StateViews.tsx` 的 `ErrorPanel`：

- 「打开诊断」按钮**没有 onClick**，点了无反应；
- 面板里硬编码 `ERR_LOCAL_DB_TIMEOUT · 2.4s`，是假诊断文案。

建议：删按钮与假文案（或接真实诊断入口）。改动量：极小；风险：会改变错误态视觉，需确认原型是否本来就没有按钮。🔴 `states.css` 在并发改动中（TSX 未改）。

### B10 两个超大文件（职责混杂）

- `features/settings/SettingsPage.tsx`：**3200+ 行**。可拆点非常明确：`EditorSheet`（298-702）、`MoverSheet`（703-798）、`CategoryDeleteSheet`（799-867）、`RowMenu`（234-?）、主页面（868 起，约 2300 行，内含账户/分类/现金流/主题/备份 5 个 section）。建议按 section 拆成 4-5 个文件，主文件只留路由与状态编排。
- `features/reports/ReportsPage.tsx`：1483 行，含 `Segmented`、`PageHead`、4 个报表构建函数、设置 Sheet、下钻 Sheet。建议把 `Segmented` 与各报表构建器移出，页面保留编排。
- 改动量：大（纯移动，不改逻辑）；风险中（并发改 `SettingsPage`，必须最后做）。

### B11 预览/调试面是否留在生产包

`/design` 路由 + `DesignApp` 的 `preview` 工具条（设备/深浅色/数据态切换）在 `index.html`/`App.tsx` 里直接可达。它既是高保真回归工具，也是生产可访问的调试面。建议：保留但用 `import.meta.env.DEV` 或显式 `?preview=1` 二次门控；属产品决策，非死代码。

---

## 3. 明确「不建议做」的替换（省得以后返工）

| 候选 | 结论 | 理由 |
|---|---|---|
| ReportTable → Mantine `Table` | 不做 | 固定 29px 行高、`is-foldable` 折叠、`tfoot` 合计、移动端首列吸附都靠自定义 `<table>` 类；Mantine Table 只给样式，替换等于重写 |
| 流水列表 → Mantine `Table` | 不做 | 两段式行（`--mb-tx-row-h:54px`）不是表格语义 |
| 自研 `CheckBox`（TransactionsList 内）→ Mantine `Checkbox` | 暂不做 | 现实现是纯展示 span，换成真实 input 会引入焦点/事件差异，收益低 |
| 空态/错误态 → Mantine | 不做 | Mantine 没有 EmptyState；`StateViews` 已被 5 处复用 |
| 图表 → 图表库 | 不做 | 自绘 SVG 满足 1:1 原型与桑基/环图定制 |
| `utils/format.ts` 与 `overview/format.ts` | 保留 | 后者只是 overview 适配层，不是重复实现 |

---

## 4. 建议执行顺序与分批

前提：**先等并发会话把主题/旧前端收尾提交**；本文所有 🔴 项都要在它之后 rebase。

| 批次 | 内容 | 主要文件 | 预估 | 验证 |
|---|---|---|---|---|
| 0 复核 | 确认 antd 已清零、`css-vars-guard` 通过、`tests/setup` 无 antd mock | `main.tsx` / `hf-theme.ts` / `package.json` | 0.5h | `npm run lint` + `npm test -- css-vars-guard` |
| 1 死代码（单 commit） | A1 + A2 + A3 + A5 | overlays/reports/shell.css、settingsModel、format、api、tests/mocks | 删 ~250 行 | `tsc --noEmit` + 全量单测 |
| 2 token 收口（单 commit） | A4 删除 0 引用 token；`radius-control → radius-xs` | `variables.css` + 3 个 css | ~30 行 | grep 0 引用 + 三档截图 |
| 3 Sheet 封装（单 commit） | B5，先 5 个干净文件，再 Settings 6 处 | 11 个 tsx | 删 ~150/增 ~60 | 抽屉开合、portal、移动端 bottom |
| 4 交互收敛（每个主题一个 commit） | B1 toast → B2 tabs/seg → B3 switch → B9 半成品 | DesignApp/Settings/Reports/Transactions | 中 | 390×844 + 桌面截图；撤销时序用例 |
| 5 结构（最后） | B10 拆文件；B4 的 motion/z-index 决策；B6 卡片；B7 按钮；B11 预览门控 | Settings/Reports | 大 | 逐页视觉回归 |

不建议把 B1-B3 与 B10 混在一个 commit；也不建议先动 B7（207 处原生按钮），它收益最低、回归面最大。

---

## 5. 与「正在删除旧前端」会话的冲突清单

🔴 当前被并发修改、**不要现在动**：
`apps/web/index.html`、`apps/web/package.json`、`src/main.tsx`、`src/app/design/DesignApp.tsx`、`src/components/common/ErrorBoundary.tsx`、`src/styles/global.css`、`src/styles/reset.css`、`src/styles/theme/hf-theme.ts`、`src/styles/theme/variables.css`、`src/features/settings/SettingsPage.tsx`、`src/features/budgets/budgets.css`、`src/features/overview/overview.css`、`src/features/shared/states.css`、`src/features/shared/types.ts`、`src/features/transactions/transactions.css`、`tests/setup.ts`、`tests/unit/css-vars-guard.test.ts` 及 5 个 settings/theme 测试。

🟢 当前干净、可独立做：
`features/reports/*`（含 `reports.css`、`ReportsPage.tsx`）、`features/shell/shell.css`、`features/overview/overlays.css`、`features/budgets/BudgetPage.tsx`、`features/overview/QuickEntry.tsx`、`features/transactions/*.tsx`、`features/shared/*`、`utils/format.ts`、`services/api.ts`、`features/settings/settingsModel.ts`、`tests/mocks/api.ts`。
