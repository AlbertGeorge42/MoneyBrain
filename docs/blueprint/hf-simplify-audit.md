# 高保真前端精简审查（收尾审计）

> 审查对象：`apps/web/src/features/**`、`apps/web/src/app/design/**`、`apps/web/src/features/shell/**` 及相关样式
> 基线：`4816ad7`（旧 `pages|components|layouts|queries|hooks` 已于 `73c2709` 清退）
> 收尾审计时间：2026-11-07，HEAD `038c989`（批次 1–8 已提交）
> 口径：**以当前代码为准**，不沿用本文旧结论。审计只读，未改代码、未改测试、未连接 `apps/api/prisma/dev.db`。
> 状态标记：`✅ 已落地` / `⚠️ 部分落地` / `❌ 未做` / `— 已失效`

## 0. 终态总览

| 条目 | 状态 | 当前证据（2026-11-07 实测） |
|---|---|---|
| A1 删除 0 引用 CSS | ⚠️ 部分落地 | 8 项中 7 项已删；`.mb-amount` 仍在 [overview.css](file:///c:/Users/George/Documents/MoneyBrain/apps/web/src/features/overview/overview.css#L435-L455) |
| A2 删除无引用导出 | ⚠️ 部分落地 | 13 项中 8 项已删；`settingsModel.ts` 仍有 5 个 0 引用导出 |
| A3 仅测试使用的导出 | ⚠️ 部分落地 | `categoryTxCount`、`restoreTransactionsInLedger` 仍保留 `export`；`fetchAllTransactions` 已改为模块私有 |
| A4 第二套 token 清理 | ⚠️ 部分落地 | 空间/字号/粗边框/`radius-control` 已删；`radius-card`、motion、z-index 仍保留 |
| A5 antd 尾巴 | ✅ 已落地 | `antd` / `@ant-design` / `--ant-` / 历史注释在 `apps/web` 内均 0 处（`css-vars-guard` 的反回潮断言除外） |
| A6 临时产物 | ⚠️ 部分落地 | `vite.capture.tmp.config.ts`、`scripts/tmp-*.mts` 已删；`NIGHTLY-HANDOFF.md`、`artifacts/` 仍未跟踪 |
| B1 四套 toast | ✅ 已落地 | 统一到 `features/shared/toast.tsx`；B1-1 的 4 项口径**保持本文原结论不变** |
| B2 Tabs / Segmented | ✅ 已落地 | `HfTabs` 10 处调用、`HfSegmented` 13 处调用；业务侧无第二套 tablist |
| B3 Switch / 勾选 | ✅ 已落地 | `HfSwitch` 12 处调用；`role="switch"` 只剩共享原语内部 |
| B4 token 双轨收敛 | ⚠️ 部分落地 | `--mb-radius-control` 已迁到 `--mb-radius-xs`；`--mb-radius-card`、motion、z-index 未决 |
| B5 Drawer 封装 | ✅ 已落地 | `HfSheet` 22 处调用；`@mantine/core` 的 `Drawer` 只在 `HfSheet.tsx` 内出现 |
| B6 三套卡片外壳 | ✅ 已落地 | `card.css` 收口 `.mb-card/.mb-rp-card/.mb-coldstart/.mb-errorpanel`；`Card` 14 个文件在用 |
| B7 两套 Button | ⚠️ 部分落地 | 业务页面原生 `<button>` 清零；`shell/AppShell.tsx` 仍有 6 处；Mantine `<Button>` 仍有 11 处 |
| B8 自研 DatePicker | ⚠️ 部分落地 | Sheet 已换 `HfSheet`；17 个 props 未收成对象；头注释未写「为何不用 Mantine dates」 |
| B9 半成品 UI | ✅ 已落地 | `ErrorPanel` 的假诊断按钮/假诊断码已删；仅剩 0 引用 CSS `.mb-errorpanel-code` |
| B10 超大文件 | ✅ 已落地 | `SettingsPage.tsx` 1084 行（原 3200+）；`ReportsPage.tsx` 298 行（原 1483） |
| B11 预览面门控 | ⚠️ 部分落地 | `/design` 路由仍无条件可达；工具条仅在 `preview` 时渲染；种子数据已用 `import.meta.env.DEV` 隔离 |

---

## 1. 低风险高收益（逐条核对）

### A1 删除 0 引用 CSS

| # | 位置 | 原动作 | 状态 | 证据 |
|---|---|---|---|---|
| 1 | `features/overview/overlays.css` `.mb-seg` | 整块删 | ✅ | 全仓 0 处 `mb-seg`（含 `mantine-SegmentedControl-indicator`） |
| 2 | `overlays.css` `.mb-currency` | 删 | ✅ | 0 处 |
| 3 | `overlays.css` `.mb-chip-row` | 删 | ✅ | 0 处 |
| 4 | `overlays.css` `.mb-chip` | 两处一起删 | ✅ | 0 处（`shell.css` 的反向引用也已消失） |
| 5 | `overlays.css` `.mb-entry-hint` | 删 | ✅ | 0 处 |
| 6 | `features/overview/overview.css:435-455` `.mb-amount` | 只从分组选择器移除 `.mb-amount` | ❌ | 4 条规则仍与活的 `.mb-m-tx-amount` 共组；TSX 中 `.mb-amount` 0 引用 |
| 7 | `features/transactions/transactions.css` `.mb-tx-row-trigger` | 删规则 + 分组移除 | ✅ | 0 处 |
| 8 | `features/reports/reports.css` `.mb-rp-sankey-label` | 从两处分组移除成员 | ✅ | 0 处 |

### A2 删除完全无引用的导出

| 符号 | 状态 | 当前证据 |
|---|---|---|
| `SECTION_GROUP_TITLES` | ❌ | 仍在 `settingsModel.ts:50`，`src + tests` 0 引用 |
| `ASSET_KINDS` / `LIABILITY_KINDS` | ❌ | 仍在 `settingsModel.ts:74-75`，0 引用（`accountGroupsForType` 内部用的是字面量数组） |
| `accountCountLabel` / `txCountLabel` | ❌ | 仍在 `settingsModel.ts:458-462`，0 引用 |
| `restoreTransactionCategoriesInLedger` | ✅ | 已删 |
| `transactionNet` | ✅ | 已删 |
| `resetReportSettings` | ✅ | 已删 |
| `daysBetween` / `isValidRange` | ✅ | 已删 |
| `formatRangeText` | ✅ | 已删 |
| `yAxisLabelLeftEdge` | ✅ | 已删 |
| `currencyTooltipFormatter` + `TooltipParams` | ✅ | 已删 |
| `createStatisticFormatter` | ✅ | 已删（`utils/format.ts` 已无 AntD 注释） |
| `investmentApi` | ✅ | 已删 |
| `tests/mocks/api.ts` | ✅ | 文件不存在 |

### A3 只在测试里出现的导出

| 符号 | 状态 | 当前证据 |
|---|---|---|
| `settingsModel.ts categoryTxCount` | ⚠️ | 仍 `export`，仅 `p2-settings.test.ts` 引用 |
| `ledgerOps.ts restoreTransactionsInLedger` | ⚠️ | 仍 `export`，仅 `transactions-ledgerOps.test.ts` 引用 |
| `filters.ts summarizeTransactions` | ✅ | 仍是 `filters.ts` 内部（`buildTransactionListModel`）的现役实现，`export` 有业务意义 |
| `overview/apiLedger.ts fetchAllTransactions` | ✅ | 已无 `export`，仅模块内调用 |
| `styles/theme/hf-theme.ts buildMbColorVarNames` | ✅ | 保留 `export`，`css-vars-guard.test.ts` 守卫入口 |

### A4 第二套结构 token

实测引用次数（排除 `variables.css` 定义本身）：

| token | 引用 | 状态 | 说明 |
|---|---|---|---|
| `--mb-space-xs/sm/md/lg/xl/2xl/3xl` | 0 | ✅ | 整段已删 |
| `--mb-font-size-sm/body/body-lg/title/heading` | 0 | ✅ | 整段已删 |
| `--mb-border-width-thick` | 0 | ✅ | 已删 |
| `--mb-font-ui/display/num` | 41 / 31 / 59 | ✅ | 保留（全局字体族） |
| `--mb-border-style-dashed` | 2 | ✅ | 保留 |
| `--mb-radius-control` | 0 | ✅ | 已迁到 `--mb-radius-xs`，token 已删 |
| `--mb-radius-card` | 5 | ⚠️ | 仍定义 8px，见 B4 |
| `--mb-motion-fast/mid`、`--mb-ease-standard` | 5 / 1 / 6 | ⚠️ | 与 `--mb-dur-1/2`、`--mb-ease` 并存，见 B4 |
| `--mb-z-batchbar/z-toast` | 3 / 2 | ⚠️ | 与 `--mb-z-fab` 无统一阶梯，见 B4 |

### A5 antd 收尾

- ✅ `utils/format.ts` 的 AntD 注释随 `createStatisticFormatter` 一并删除。
- ✅ `e2e` 与 `tests/setup.ts` 无 antd mock / 等 antd 的 helper。
- ✅ `package.json` 无 `antd`、`@ant-design/*`、`dev:legacy`；`postcss.config.cjs` 只剩 Mantine 预设。
- ✅ `styles/theme/` 只剩 `hf-theme.ts` + `variables.css`。

### A6 未跟踪的临时产物

- ✅ `apps/web/vite.capture.tmp.config.ts`、`scripts/tmp-capture-root-vars.mts`、`scripts/tmp-theme-switch.mts` 已不存在。
- ⚠️ `NIGHTLY-HANDOFF.md`、`artifacts/` 仍未跟踪；本次审计按要求不 `add`。

---

## 2. 需要设计决策（逐条核对）

### B1 四套 toast

✅ 已落地：`features/shared/toast.tsx` + `toastContext.ts` + `toast.css`。`ToastProvider` 在 `main.tsx` 挂载；`shell` 由 Provider body-portal，`reports` / `stack` 由页面内 `<ToastViewport variant>` 渲染。四套调用点的 state/timer/渲染已删除。

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

### B2 Tabs / Segmented

✅ 已落地：`HfTabs`（`report` / `settings` 两族类名）+ `HfSegmented`（`report` / `granularity` / `budget` / `entry` 四族类名）。`role="tablist"` 只出现在 `HfTabs.tsx`。
残留：视觉 CSS 仍按族分开（`mb-rp-*` / `mb-set-*` / `mb-bg-*` / `mb-entry-*`），这是保留像素对齐的刻意结果，不作为缺陷。

### B3 Switch / 勾选交互

✅ 已落地：`HfSwitch` 覆盖 `report` / `budget` / `settings` 三种轨道开关 + `toggle` 按压变体；`role="switch"` 只出现在共享原语内部。
残留：四族轨道尺寸/颜色仍由四份 CSS 定义，组件只统一了 DOM/ARIA。

### B4 token 双轨收敛

- ✅ `--mb-radius-control`（24 处）已迁到 `--mb-radius-xs`（同为 6px），token 已删。
- ⚠️ `--mb-radius-card` 仍为 8px，剩 5 处引用（`reports.css` ×2、`card.css` ×1、注释 ×2）。**卡在设计拍板：保留 8px 一次性语义 token，还是并入 HF 圆角档位（6/10/14/20）。**
- ⚠️ `--mb-motion-fast`(0.15s) / `--mb-motion-mid`(0.24s) / `--mb-ease-standard` 仍与 `--mb-dur-1`(150ms) / `--mb-dur-2`(280ms) / `--mb-ease` 并存。**卡在动效手感是否允许 40ms 与曲线变化。**
- ⚠️ `--mb-z-batchbar:50` / `--mb-z-toast:500` / `--mb-z-fab:110` 未形成统一阶梯。**卡在层叠表（fab / batchbar / toast / drawer / modal）先定还是先合并。**

### B5 Drawer 封装

✅ 已落地：`HfSheet` 22 处调用，覆盖报表、设置、预算、总览、流水、日期选择器；`Drawer` 的直接 import 只剩 `HfSheet.tsx`。

### B6 三套卡片外壳

✅ 已落地：`features/shared/card.css` 以 `.mb-card/.mb-rp-card/.mb-coldstart/.mb-errorpanel` 共组底座，`Card.tsx` 14 个文件在用。报表卡 8px 圆角差异按注释刻意保留（见 B4）。

### B7 两套 Button

⚠️ 部分落地：`HfButton` 已在 38 个文件使用，`budgets / reports / settings / transactions` 的原生 `<button>` 为 0。
残留：
- `features/shell/AppShell.tsx` 仍有 6 处原生 `<button>`（侧栏 / 移动导航 / 图标按钮）；
- Mantine `<Button>` 仍有 11 处（`QuickEntry` 6、`StateViews` 3、`TransactionDetail` 1、`ErrorBoundary` 1），且部分仍通过 `className="mb-primary-btn"` 复用同一视觉；
- `.mb-primary-btn` / `.mb-secondary-btn` 的基础声明只写在 `app/design/design.css`（设计预览样式表），生产页面能生效是因为 `DesignApp` 包住全部路由——这是样式归属问题，不是死代码。

**卡在决策：按钮尺寸分档**（当前 `--mb-control-h: 38px` 与 `.mb-sheet` 内 44px 手写覆盖并存），未定档前不迁剩余 11 处 Mantine Button。

### B8 自研 DatePicker

⚠️ 部分落地：Sheet 部分已换 `HfSheet`；`DatePicker.tsx` 仍有 16 个 props（原报告写 17，实际按当前签名逐项数为 16）。
残留：未收成 `DatePickerProps` 对象；头注释只写了使用场景，未写明「为何不用 Mantine dates」。**卡在是否接受一次性 props 收口带来的 2 个调用点改动。**

### B9 半成品 UI

✅ 已落地：`ErrorPanel` 无「打开诊断」按钮，也无 `ERR_LOCAL_DB_TIMEOUT` 假文案。
残留：`states.css:84` 的 `.mb-errorpanel-code` 已 0 引用，属于本次清理尾巴。

### B10 超大文件

✅ 已落地：
- `SettingsPage.tsx` 1084 行，已拆出 `SettingsNav / AccountsSection / CategoriesSection / CashflowSection / InvestSection / AppearanceSection / BackupSection / DisplaySection / DataSection / TrashSection / RecycleBinSection / EditorSheet / MoverSheet / CategoryDeleteSheet / OpeningSheet / ClearSheet / ImportSheet / ReconcileSheet / RowMenu`。
- `ReportsPage.tsx` 298 行，只剩期间状态、视图切换、请求编排；视图/抽屉/设置/外壳各自成文件。

### B11 预览/调试面

⚠️ 部分落地：`/design` 路由在 `App.tsx` 仍无条件注册；`PreviewToolbar` 只在 `preview=true` 时渲染；种子数据已用 `import.meta.env.DEV` 动态隔离。
**卡在产品决策：生产包是否保留 `/design` 路由（保留调试能力 vs 暴露预览面）。**

---

## 3. 明确「不建议做」的替换（维持原结论）

| 候选 | 结论 | 理由 |
|---|---|---|
| ReportTable → Mantine `Table` | 不做 | 固定 29px 行高、`is-foldable` 折叠、`tfoot` 合计、移动端首列吸附都靠自定义 `<table>` 类 |
| 流水列表 → Mantine `Table` | 不做 | 两段式行（`--mb-tx-row-h:54px`）不是表格语义 |
| 自研 `CheckBox` → Mantine `Checkbox` | 暂不做 | 纯展示 span，换真实 input 会引入焦点/事件差异 |
| 空态/错误态 → Mantine | 不做 | Mantine 没有 EmptyState；`StateViews` 已被 5 处复用 |
| 图表 → 图表库 | 不做 | 自绘 SVG 满足 1:1 原型与桑基/环图定制 |
| `utils/format.ts` 与 `overview/format.ts` | 保留 | 后者是 overview 适配层，不是重复实现 |

---

## 4. 执行结果

| 批次 | 内容 | 状态 |
|---|---|---|
| 0 复核 | antd 清零、`css-vars-guard`、`tests/setup` | ✅ |
| 1 死代码 | A1 + A2 + A3 + A5 | ⚠️ 只剩 A1-6 与 `settingsModel` 5 个导出 |
| 2 token 收口 | A4 + `radius-control → radius-xs` | ⚠️ 只剩 B4 三项待决策 |
| 3 Sheet 封装 | B5 | ✅ |
| 4 交互收敛 | B1 → B2 → B3 → B9 | ✅ |
| 5 结构 | B10；B6 卡片；B7 按钮；B11 门控 | ⚠️ B7 / B11 待决策 |
| 6–8 | 卡片外壳 / HfButton / ReportsPage+SettingsPage 拆分 | ✅ |

原「与并发会话的冲突清单」**已失效**：所列举文件均已由批次 1–8 提交，不再存在并发改动风险。

---

## 5. 终态与残余清单

### 5.1 可直接收尾（不需设计决策）

| # | 残余 | 位置 | 动作 |
|---|---|---|---|
| R1 | `.mb-amount` 0 引用 | `overview.css:435,442,447,452` | 从 4 个分组选择器移除该成员，保留 `.mb-m-tx-amount` |
| R2 | `.mb-errorpanel-code` 0 引用 | `states.css:84-89` | 整块删 |
| R3 | `SECTION_GROUP_TITLES` / `ASSET_KINDS` / `LIABILITY_KINDS` / `accountCountLabel` / `txCountLabel` 0 引用 | `settingsModel.ts:50,74-75,458-462` | 删除实现 |
| R4 | `categoryTxCount` / `restoreTransactionsInLedger` 只被测试引用 | `settingsModel.ts:217`、`ledgerOps.ts:127` | 保留函数、去掉 `export`（测试改同文件内导入需单独决策） |
| R5 | `mb-primary-btn` / `mb-secondary-btn` 的 `:focus-visible` 在 `design.css` 与 `shell.css` 各写一遍 | `design.css:303`、`shell.css:379` | 二选一 |
| R6 | `tsx` 在根 `package.json` 与 `apps/web/package.json` 重复声明，web 侧无脚本使用 | `apps/web/package.json:43` | 删除 web 侧声明（根已提供，`tsx` 仍被 `db:verify` 等脚本使用） |
| R7 | 空的旧目录 `src/hooks`、`src/layouts`、`src/pages`、`src/queries` | `apps/web/src/` | 本地空目录，Git 不跟踪；无需提交动作 |
| R8 | 测试目录 `tests/unit/pages/*` 命名仍叫 pages | `apps/web/tests/unit/pages/` | 只是命名，导入的已是 `features/*`；改名可选 |

### 5.2 卡在设计/产品决策

| # | 残余 | 卡点 |
|---|---|---|
| D1 | `--mb-radius-card` 8px 与 HF 圆角档位 6/10/14/20 不一致 | **圆角档位**：保留一次性 token，还是并入档位（会改报表卡视觉） |
| D2 | `--mb-motion-*` / `--mb-ease-standard` 与 `--mb-dur-*` / `--mb-ease` 并存 | 动效曲线与 40ms 差异是否可接受 |
| D3 | `--mb-z-batchbar:50` / `--mb-z-fab:110` / `--mb-z-toast:500` 无统一阶梯 | 先定层叠表还是先合并 |
| D4 | 剩余 11 处 Mantine `<Button>` 与 `HfButton` 双体系 | **按钮尺寸分档**：是否统一 38/44px 两档并定义 `size` |
| D5 | 四族 Switch、四族 Segmented、两族 Tabs 的 CSS 仍各写一套尺寸/颜色 | 是否接受“组件统一、视觉分族”，还是收敛为一套视觉参数 |
| D6 | 设置页「账户分类」资产/负债一级分组 + 组内账户的二级结构 | **账户分类二级结构**：是否允许任意层级，还是固定一级分组+账户 |
| D7 | `/design` 路由在生产入口可达 | 保留调试面 vs 生产门控 |
| D8 | `DatePicker` 16 个 props 未收成对象 | 是否值得改 2 个调用点 |
| D9 | B1-1 的 4 项 toast 口径（时长 / 条数 / 层级） | 见 B1-1 表，本轮不动 |

### 5.3 依赖与测试核对

- `package.json` 依赖：`@mantine/core`、`@tanstack/react-query`、`axios`、`lucide-react`、`react`、`react-dom`、`react-router-dom` 均有实际引用；`@mantine/hooks` 只作为 `@mantine/core` 的 peer 依赖存在（`src/tests` 0 处直接 import），**不是可删项**。
- `postcss-preset-mantine` / `postcss-simple-vars` 由 `postcss.config.cjs` 使用；`jsdom` 由 `vitest.config.ts` 使用；`@vitest/coverage-v8` 由 `vitest --coverage` 隐式使用。
- `tests/` 中未发现断言已删实现（`daysBetween` / `formatRangeText` / `createStatisticFormatter` / `investmentApi` / `mb-seg` / `mb-tx-row-trigger` 等均 0 命中）；`npx tsc --noEmit` 通过。
- 唯一仍读取“实现细节 CSS”的用例是 `p2-reports.test.tsx`，它已改为读取 `src/features/shared/toast.css`，与当前结构一致。

---

## 6. 前端当前规模（2026-11-07 实测）

统计口径：`apps/web/src` 下 `*.ts/*.tsx/*.css`，按文件物理行数（含空行与注释）。

### 6.1 `src/features` 各目录

| 目录 | 文件数 | 总行数 |
|---|---:|---:|
| budgets | 3 | 1,880 |
| overview | 20 | 5,715 |
| reports | 20 | 8,195 |
| settings | 23 | 5,813 |
| shared | 24 | 2,735 |
| shell | 3 | 581 |
| transactions | 12 | 3,977 |
| **合计** | **105** | **28,896** |

`src` 全量（含 `app / components / dev-fixtures / services / styles / utils`）：**121 个文件，30,855 行**。

### 6.2 最大的 5 个文件

| 行数 | 文件 |
|---:|---|
| 1,751 | `features/reports/reports.css` |
| 1,272 | `features/settings/settings.css` |
| 1,090 | `features/transactions/transactions.css` |
| 1,084 | `features/settings/SettingsPage.tsx` |
| 1,002 | `features/reports/reportsModel.ts` |

次大：`budgets/BudgetPage.tsx` 950、`reports/cashSankeyModel.ts` 927、`overview/LedgerContext.tsx` 904、`reports/charts.tsx` 807。

### 6.3 共享原语清单与行数

| 文件 | 行数 | 用途 |
|---|---:|---|
| `shared/HfSheet.tsx` | 192 | 抽屉封装（7 种视觉族） |
| `shared/toast.tsx` + `toastContext.ts` + `toast.css` | 137 + 38 + 101 | toast 状态与三族位置 |
| `shared/StateViews.tsx` + `states.css` | 146 + 158 | 冷启动 / 错误 / 骨架屏 |
| `shared/Card.tsx` + `card.css` | 45 + 47 | 卡片底座与 4 种外壳 |
| `shared/HfSwitch.tsx` | 100 | 轨道开关 + 按压 Toggle |
| `shared/HfSegmented.tsx` | 56 | 分段选择（4 族） |
| `shared/HfTabs.tsx` | 53 | 页签（2 族） |
| `shared/HfButton.tsx` | 41 | 原生按钮 DOM 契约（4 变体） |
| `shared/TxRow.tsx` + `txRow.css` | 107 + 181 | 两段式流水行 |
| `shared/BudgetProgress.tsx` + `budgetProgress.css` | 71 + 31 | 预算进度条 |
| `shared/RefundTag.tsx` | 59 | 退款角标 |
| `shared/accountIdentity.ts` | 14 | 账户身份文案 |
| `shared/chartLayout.ts` | 55 | 图表布局计算 |
| `shared/portalHost.ts` | 16 | portal 宿主 |
| `shared/types.ts` | 5 | 共享类型 |
| `shared/datePicker/DatePicker.tsx` + `datePickerModel.ts` + `datePicker.css` | 536 + 155 + 391 | 日期选择器 |
| **合计** | **2,735** | |

### 6.4 重复视觉能力现状

| 能力 | 组件收口 | 视觉 CSS 套数 | 结论 |
|---|---|---|---|
| Toast | 1 套 `ToastProvider` | 3 族位置（`shell / reports / stack`） | 逻辑已统一，位置差异按 B1-1 待定 |
| Tabs | 1 个 `HfTabs` | 2 族（report / settings） | 逻辑已统一 |
| Segmented | 1 个 `HfSegmented` | 4 族 | 逻辑已统一 |
| Switch | 1 个 `HfSwitch` | 4 族（含 toggle） | 逻辑已统一 |
| Card | 1 个 `Card` | 1 份底座 + 4 个外壳类 | 已统一 |
| Button | `HfButton` + Mantine `Button` | 18 个业务类 + 4 个 Hf 变体 | **仍有两套 DOM**（B7 / D4） |
| 抽屉 | 1 个 `HfSheet` | 7 族类名 | 已统一 |
| 空态/错误态 | 1 个 `StateViews` | 1 份 | 已统一 |

CSS 类引用扫描（`src/**/*.css` 共 756 个 `.mb-*` 类）：仅 `.mb-amount`、`.mb-errorpanel-code` 在 TS/TSX 中 0 引用；`.mb-tone-cat-1..6` 为模板拼接（`mb-tone-cat-${n}`）的动态类，不是死代码。
CSS 文件全部有 import，无孤立样式文件；同名类跨文件重复定义 6 组，其中仅 `mb-primary-btn` / `mb-secondary-btn` 的 focus-visible 属真实重复（R5），其余为作用域覆盖。
token 扫描：`variables.css` 中定义的结构 token 均至少被 `var()` 引用 1 次，无 0 引用 token；剩余问题不是“没人用”，而是“双轨并存”（B4 / D1–D3）。
